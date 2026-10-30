# NVIDIA Nemotron × Nebius Token Factory — Technical Integration

[← Back to README](../README.md)

This document covers the technical details of the Nebius Token Factory integration added for the Nebius × NVIDIA Global AI Hackathon 2026. For the user-facing quickstart, see [the README section](../README.md#nvidia-nemotron--nebius-token-factory-integration). For what changed and why, see [`HACKATHON_CHANGES.md`](HACKATHON_CHANGES.md).

---

## Why two separate LLM clients?

OpenSec Intelligence has two independent layers that talk to language models:

1. **The general agent layer** (`src/llm/*`, used by `opensec serve` and the REPL) — a full `LLMAdapter` interface with tool-calling, streaming, and vision support, implemented by `OllamaAdapter`, `OpenAIAdapter`, and `AnthropicAdapter`. `src/llm/provider-factory.ts` is the `ModelRouter`/`ModelConfiguration` equivalent — it picks and constructs the right adapter from a `ProviderName`.
2. **The security pipeline** (`src/security/llm.ts`, used by the Analyst, Consensus, Fixer, and Prover) — a deliberately minimal, self-contained client that does single-shot JSON-extracting completions. It predates this hackathon and intentionally does not depend on the general agent layer, so the Scanner (and the rest of the security CLI) never has a hard dependency on it.

Both now support Nebius Token Factory, but as two separate, small additions rather than a shared abstraction — that matches how the codebase already separated Ollama support in both places, and avoids coupling the security pipeline to the larger agent framework.

## 1. General agent layer: `src/llm/provider-factory.ts`

```ts
export type ProviderName = 'ollama' | 'openai' | 'anthropic' | 'nebius'
```

The `'nebius'` case in `createAdapter()`:

```ts
case 'nebius': {
  const apiKey = options.apiKey ?? process.env.NEBIUS_API_KEY
  if (!apiKey) throw new Error('Nebius API key required. Set the NEBIUS_API_KEY environment variable...')
  return new OpenAIAdapter({
    apiKey,
    baseUrl: options.baseUrl ?? process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1',
    name: 'nebius',
  })
}
```

No new adapter class was written. `OpenAIAdapter` already implements the OpenAI-compatible `/chat/completions` request/response shape (with tool-calling via `tools`/`tool_calls`, and SSE streaming with `stream_options: { include_usage: true }`), and Token Factory's documented API ([api.tokenfactory.nebius.com/docs](https://api.tokenfactory.nebius.com/docs)) is OpenAI-compatible — only the base URL and API key differ. `detectProviderFromModel()` also gained a `/nemotron/i` pattern so a bare model name like `nvidia/nemotron-super-49b-v1` auto-selects the Nebius provider.

This is also threaded through `src/core/types.ts` (`AgentConfig.provider`, `CmdrConfig.defaultProvider`, `OrchestratorOptions.defaultProvider`), `src/config/schema.ts` (Zod enum), and `src/config/config-loader.ts` (`OPENSEC_AI_PROVIDER` / `OPENSEC_PROVIDER` env override), so `nebius` is a normal first-class value everywhere the existing three providers were.

## 2. Security pipeline: `src/security/llm.ts`

This is the integration that actually matters for the prove-fix-reprove loop. The existing `LlmConfig` interface:

```ts
export interface LlmConfig {
  baseUrl?: string
  model: string
}
```

became:

```ts
export type LlmProvider = 'ollama' | 'nebius'

export interface LlmConfig {
  provider?: LlmProvider   // default 'ollama' — every existing caller still works unchanged
  baseUrl?: string
  apiKey?: string          // Nebius only; never logged
  model: string
}
```

`generate(config, prompt)` — the single function every reasoning stage calls — now dispatches:

```ts
export async function generate(config: LlmConfig, prompt: string): Promise<string> {
  if (providerOf(config) === 'nebius') return generateNebius(config, prompt)
  // ...unchanged Ollama /api/generate path
}
```

`analyst.ts`, `consensus.ts`, `fixer.ts`, and `prover.ts` call `generate()`/`generateJson()` exactly as before — **none of their code changed**. They never knew which provider they were talking to; they still don't.

### Request construction

```ts
fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  }),
  signal: AbortSignal.timeout(60_000),
})
```

Every call site already builds a single combined prompt string (system instructions + finding context, see `analyst.ts`/`consensus.ts`/`fixer.ts`/`prover.ts`), so this is sent as one `user` message — there was no existing system/user split to preserve, and introducing one would have been a gratuitous structural change for no behavioral benefit.

### Error handling, retries, timeouts

- **Timeout:** 60s per attempt via `AbortSignal.timeout`. A timeout surfaces as `Error('Nebius Token Factory request timed out')` rather than a raw `DOMException`.
- **Rate limits (429) and server errors (5xx):** retried up to 3 attempts total, with exponential backoff (`500ms × 2^attempt`), honoring a `Retry-After` response header in seconds when present.
- **Other 4xx errors** (bad request, auth failure, etc.): not retried — they fail immediately with the response body (truncated to 300 chars) in the error message.
- **Malformed response** (missing `choices[0].message.content`): throws immediately with a descriptive error instead of returning `undefined`/`null` silently.
- **Missing API key / missing model:** fails fast with an actionable message before making any network call.

All of this is covered by `tests/unit/nebius-llm.test.ts` against a mocked `fetch`.

### Model selection — no hardcoded model ID

```ts
export async function resolveNebiusModel(opts: NebiusResolveOptions): Promise<NebiusResolvedModel> {
  if (opts.model) return { model: opts.model, source: 'config' }
  const status = await checkNebius(opts)            // GET /v1/models
  if (!status.available) throw new Error('Could not reach the Nebius Token Factory model catalog...')
  const nemotron = status.models.find((id) => /nemotron/i.test(id))
  if (!nemotron) throw new Error('No NVIDIA Nemotron model is available in the Token Factory catalog...')
  return { model: nemotron, source: 'catalog' }
}
```

If `NEBIUS_MODEL` is set, it's used as-is — the account owner knows which Nemotron variant (Nano/Super/Ultra, or a future one) they have access to and how it's named. If it's unset, OpenSec queries the account's live catalog and picks the first ID matching `nemotron`. If the catalog is unreachable or contains no Nemotron model, it fails loudly rather than falling back to a guessed ID — this is intentional: a hardcoded fallback model ID would silently stop being an NVIDIA model the moment it changed or was renamed, which would make the "powered by NVIDIA Nemotron" claim false without anyone noticing.

### Runtime flow

```
bin/cmdr.ts
  resolve --provider / OPENSEC_AI_PROVIDER / OPENSEC_PROVIDER
  if nebius: resolveNebiusModel() → concrete model ID, or exit 1 with a clear error
  if ollama: resolveModel() → existing installed-model check (unchanged)
       │
       ▼
src/security/cli.ts  (securityScan / securityFix / securityProve / securityDemo / validateLlmPipeline)
  toLlmConfig(model, opts) → LlmConfig { provider, model, baseUrl, apiKey }
       │
       ▼
src/security/pipeline.ts → analyst.ts / consensus.ts → fixer.ts → prover.ts
  all call generate()/generateJson() from security/llm.ts — provider-agnostic
```

## Credentials

`NEBIUS_API_KEY` is read only from the environment (or an explicit `apiKey` passed in-process for testing) and is used solely as the `Authorization: Bearer <key>` header value on outbound requests to Token Factory. It is never written to a config file, never included in log output, and never passed into the Prover's sandboxed exploit subprocess (which already runs with a minimal, explicitly-allowlisted environment — see `runExploit()` in `prover.ts`).

## What was verified vs. what wasn't

The environment this integration was built and tested in did not have a `NEBIUS_API_KEY`, so:

- ✅ Verified: configuration loading, missing-key/missing-model error paths, request construction (method, URL, headers, body shape), response parsing, 429/5xx retry + backoff behavior, `Retry-After` handling, timeout handling, model-catalog resolution logic — all against a mocked `fetch` matching Token Factory's documented OpenAI-compatible shape.
- ⚠️ Not verified: an actual live call to `api.tokenfactory.nebius.com`. Anyone running this with a real `NEBIUS_API_KEY` can verify it end-to-end with `opensec scan --demo --provider nebius` or `opensec --validate-llm --provider nebius`.
