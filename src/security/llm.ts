/**
 * LLM client for the security pipeline — Analyst, Consensus, Fixer, and Prover.
 *
 * Supports two providers:
 *   - 'ollama' (default): talks to /api/generate directly. Self-contained and
 *     degrades gracefully when Ollama is offline — the Scanner never depends
 *     on this module.
 *   - 'nebius': NVIDIA Nemotron models served through Nebius Token Factory's
 *     OpenAI-compatible /chat/completions endpoint. Requires NEBIUS_API_KEY.
 *
 * Every call site in analyst.ts / consensus.ts / fixer.ts / prover.ts goes
 * through generate()/generateJson() below and is provider-agnostic.
 */

const DEFAULT_URL = 'http://localhost:11434'
const DEFAULT_NEBIUS_URL = 'https://api.tokenfactory.nebius.com/v1'
const NEBIUS_TIMEOUT_MS = 60_000
const NEBIUS_MAX_RETRIES = 3
const NEBIUS_MODEL_CATALOG_TIMEOUT_MS = 8_000

/** Ordered preference list for model auto-selection. */
const PREFERRED_MODELS = [
  'qwen2.5-coder:14b',
  'qwen2.5-coder:7b',
  'deepseek-r1:14b',
  'deepseek-r1:7b',
  'llama3.2:3b',
  'llama3.1:8b',
  'llama3:8b',
]

export type LlmProvider = 'ollama' | 'nebius'

export interface LlmConfig {
  /** Default 'ollama' for backward compatibility with existing callers. */
  provider?: LlmProvider
  /** Ollama: server URL. Nebius: Token Factory base URL (defaults to the public endpoint). */
  baseUrl?: string
  /** Required for provider: 'nebius'. Never logged. */
  apiKey?: string
  model: string
}

export interface OllamaStatus {
  available: boolean
  model: string | null
}

function providerOf(config: Pick<LlmConfig, 'provider'>): LlmProvider {
  return config.provider === 'nebius' ? 'nebius' : 'ollama'
}

/**
 * Check Ollama availability and pick the best available model.
 * Returns `{ available: false, model: null }` when Ollama is unreachable.
 */
export async function checkOllama(baseUrl = DEFAULT_URL): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { available: false, model: null }
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = (data.models ?? []).map((m) => m.name)
    const model = PREFERRED_MODELS.find((p) => names.some((n) => n.startsWith(p))) ?? names[0] ?? null
    return { available: true, model }
  } catch {
    return { available: false, model: null }
  }
}

/** Backward-compat: returns true when Ollama is reachable. */
export async function ollamaAvailable(baseUrl = DEFAULT_URL): Promise<boolean> {
  return (await checkOllama(baseUrl)).available
}

// ---------------------------------------------------------------------------
// Nebius Token Factory (NVIDIA Nemotron)
// ---------------------------------------------------------------------------

export interface NebiusCheckOptions {
  apiKey?: string
  baseUrl?: string
}

export interface NebiusStatus {
  available: boolean
  /** Model IDs reported by GET /v1/models. Empty when unreachable or unauthenticated. */
  models: string[]
}

/**
 * Check Nebius Token Factory reachability and list the model catalog for this
 * account via GET /v1/models. Never throws — returns `available: false` on
 * any network, auth, or parsing failure.
 */
export async function checkNebius(opts: NebiusCheckOptions = {}): Promise<NebiusStatus> {
  const apiKey = opts.apiKey ?? process.env.NEBIUS_API_KEY
  if (!apiKey) return { available: false, models: [] }

  const baseUrl = (opts.baseUrl ?? process.env.NEBIUS_BASE_URL ?? DEFAULT_NEBIUS_URL).replace(/\/$/, '')
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(NEBIUS_MODEL_CATALOG_TIMEOUT_MS),
    })
    if (!res.ok) return { available: false, models: [] }
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return { available: true, models: (data.data ?? []).map((m) => m.id).filter(Boolean) }
  } catch {
    return { available: false, models: [] }
  }
}

export interface NebiusResolveOptions extends NebiusCheckOptions {
  /** Explicit model ID (e.g. from NEBIUS_MODEL). Used as-is when set — no catalog lookup. */
  model?: string
}

export interface NebiusResolvedModel {
  model: string
  source: 'config' | 'catalog'
}

/**
 * Resolve the Nebius model to use.
 *
 * If `opts.model` is set, it's used directly (the account owner already knows
 * which model they want). Otherwise this queries the live Token Factory model
 * catalog (GET /v1/models) and picks the first NVIDIA Nemotron model found.
 *
 * Never guesses a model ID — if the catalog can't be reached or contains no
 * Nemotron model, this throws with an actionable message rather than silently
 * falling back to a hardcoded ID (which could silently stop being an NVIDIA
 * model at all).
 */
export async function resolveNebiusModel(opts: NebiusResolveOptions): Promise<NebiusResolvedModel> {
  if (opts.model) return { model: opts.model, source: 'config' }

  const status = await checkNebius(opts)
  if (!status.available) {
    throw new Error(
      'Could not reach the Nebius Token Factory model catalog (GET /v1/models). ' +
        'Set NEBIUS_MODEL explicitly, or check NEBIUS_API_KEY / NEBIUS_BASE_URL.',
    )
  }
  const nemotron = status.models.find((id) => /nemotron/i.test(id))
  if (!nemotron) {
    throw new Error(
      'No NVIDIA Nemotron model is available in the Token Factory catalog for this account. ' +
        'Set NEBIUS_MODEL explicitly to the exact model ID from your Token Factory dashboard.',
    )
  }
  return { model: nemotron, source: 'catalog' }
}

/** Generic availability check — dispatches to the configured provider. */
export async function isLlmAvailable(config: LlmConfig): Promise<boolean> {
  if (providerOf(config) === 'nebius') return (await checkNebius(config)).available
  return ollamaAvailable(config.baseUrl)
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
}

function toRequestError(err: unknown): Error {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new Error('Nebius Token Factory request timed out')
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Single-shot completion via Nebius Token Factory's /chat/completions. */
async function generateNebius(config: LlmConfig, prompt: string): Promise<string> {
  const apiKey = config.apiKey ?? process.env.NEBIUS_API_KEY
  if (!apiKey) {
    throw new Error('Nebius API key required. Set NEBIUS_API_KEY or pass apiKey in LlmConfig.')
  }
  if (!config.model) {
    throw new Error('Nebius model not configured. Set NEBIUS_MODEL or call resolveNebiusModel() first.')
  }

  const baseUrl = (config.baseUrl ?? process.env.NEBIUS_BASE_URL ?? DEFAULT_NEBIUS_URL).replace(/\/$/, '')
  let lastError: Error = new Error('Nebius Token Factory request failed')

  for (let attempt = 0; attempt < NEBIUS_MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(NEBIUS_TIMEOUT_MS),
      })
    } catch (err) {
      lastError = toRequestError(err)
      if (attempt < NEBIUS_MAX_RETRIES - 1) {
        await backoff(attempt)
        continue
      }
      throw lastError
    }

    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('Nebius Token Factory response missing choices[0].message.content')
      }
      return content
    }

    const text = await res.text().catch(() => '')
    lastError = new Error(`Nebius Token Factory error (${res.status}): ${text.slice(0, 300)}`)

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === NEBIUS_MAX_RETRIES - 1) throw lastError

    const retryAfter = Number(res.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt
    await new Promise((r) => setTimeout(r, delay))
  }

  throw lastError
}

/**
 * Resolve the model to use: validates that `preferredModel` is installed and
 * falls back to the best available model if not.  Returns the resolved model
 * name and whether a fallback was applied.
 */
export async function resolveModel(
  preferredModel: string,
  baseUrl = DEFAULT_URL,
): Promise<{ model: string; fallback: boolean }> {
  try {
    const res = await fetch(`${(baseUrl ?? DEFAULT_URL).replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { model: preferredModel, fallback: false }
    const data = (await res.json()) as { models?: { name: string }[] }
    const names = (data.models ?? []).map((m) => m.name)
    const installed = names.some((n) => n === preferredModel || n.startsWith(preferredModel.split(':')[0] + ':'))
    if (installed) return { model: preferredModel, fallback: false }
    const best = PREFERRED_MODELS.find((p) => names.some((n) => n.startsWith(p.split(':')[0] + ':'))) ?? names[0]
    return best ? { model: best, fallback: true } : { model: preferredModel, fallback: false }
  } catch {
    return { model: preferredModel, fallback: false }
  }
}

/** Single-shot completion. Dispatches to the configured provider. Returns the raw text. */
export async function generate(config: LlmConfig, prompt: string): Promise<string> {
  if (providerOf(config) === 'nebius') return generateNebius(config, prompt)

  const baseUrl = (config.baseUrl ?? DEFAULT_URL).replace(/\/$/, '')
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
      options: { temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    throw new Error(`Ollama /api/generate failed: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { response?: string }
  return data.response ?? ''
}

/**
 * Repair a JSON string that contains unescaped control characters inside
 * string values (the most common LLM formatting mistake).
 */
function repairJson(s: string): string {
  let inString = false
  let escaped = false
  let out = ''
  for (const ch of s) {
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') { escaped = true; out += ch; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
    }
    out += ch
  }
  return out
}

/**
 * Extract the first JSON object/array from a model response.
 * Models often wrap JSON in prose or ```json fences — this is forgiving.
 * Also repairs unescaped newlines/tabs that models embed in string values.
 */
export function extractJson<T = unknown>(text: string): T | null {
  // Strip code fences first.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text

  // Find the outermost {...} or [...} span, tracking string context so
  // braces inside string values don't confuse the depth counter.
  const start = candidate.search(/[{[]/)
  if (start === -1) return null
  const open = candidate[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]
    if (esc) { esc = false; continue }
    if (ch === '\\' && inStr) { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1)
        try {
          return JSON.parse(slice) as T
        } catch {
          try { return JSON.parse(repairJson(slice)) as T } catch { return null }
        }
      }
    }
  }
  return null
}

/**
 * Generate and parse JSON with up to `retries` attempts (exponential backoff).
 * Returns null when all attempts fail or Ollama is unreachable.
 */
export async function generateJson<T = unknown>(
  config: LlmConfig,
  prompt: string,
  retries = 3,
): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const text = await generate(config, prompt)
      const parsed = extractJson<T>(text)
      if (parsed !== null) return parsed
    } catch {
      // swallow and retry
    }
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
  return null
}
