import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkNebius,
  resolveNebiusModel,
  isLlmAvailable,
  generate,
  generateJson,
  type LlmConfig,
} from '../../src/security/llm.js'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NEBIUS_API_KEY
  delete process.env.NEBIUS_BASE_URL
})

describe('checkNebius — model catalog reachability', () => {
  it('reports unavailable with no API key and makes no network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const status = await checkNebius({})
    expect(status).toEqual({ available: false, models: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists models from GET /v1/models on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: 'nvidia/nemotron-super-49b' }, { id: 'meta/llama-3.1-70b' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const status = await checkNebius({ apiKey: 'test-key' })
    expect(status.available).toBe(true)
    expect(status.models).toEqual(['nvidia/nemotron-super-49b', 'meta/llama-3.1-70b'])

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.tokenfactory.nebius.com/v1/models')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('respects a custom NEBIUS_BASE_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await checkNebius({ apiKey: 'k', baseUrl: 'https://custom.example.com/v1/' })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://custom.example.com/v1/models')
  })

  it('reports unavailable on a non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))
    vi.stubGlobal('fetch', fetchMock)
    const status = await checkNebius({ apiKey: 'bad-key' })
    expect(status).toEqual({ available: false, models: [] })
  })

  it('reports unavailable on a network error without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const status = await checkNebius({ apiKey: 'k' })
    expect(status).toEqual({ available: false, models: [] })
  })

  it('reads NEBIUS_API_KEY from the environment when not passed explicitly', async () => {
    process.env.NEBIUS_API_KEY = 'env-key'
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const status = await checkNebius({})
    expect(status.available).toBe(true)
    const [, init] = fetchMock.mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer env-key')
  })
})

describe('resolveNebiusModel — model ID configuration', () => {
  it('uses the explicitly configured model without a catalog call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveNebiusModel({ model: 'nvidia/nemotron-nano-9b', apiKey: 'k' })
    expect(result).toEqual({ model: 'nvidia/nemotron-nano-9b', source: 'config' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('picks the first Nemotron model from the live catalog when unset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: 'meta/llama-3.1-70b' }, { id: 'nvidia/nemotron-super-49b-v1' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await resolveNebiusModel({ apiKey: 'k' })
    expect(result).toEqual({ model: 'nvidia/nemotron-super-49b-v1', source: 'catalog' })
  })

  it('throws — never guesses a model ID — when the catalog is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(resolveNebiusModel({ apiKey: 'k' })).rejects.toThrow(/model catalog/i)
  })

  it('throws when no API key is configured (catalog can never be reached)', async () => {
    await expect(resolveNebiusModel({})).rejects.toThrow(/model catalog/i)
  })

  it('throws when the catalog has no Nemotron model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: 'meta/llama-3.1-70b' }] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(resolveNebiusModel({ apiKey: 'k' })).rejects.toThrow(/Nemotron/i)
  })
})

describe('generate() — provider dispatch and Nebius request construction', () => {
  it('rejects when provider is nebius but no API key is configured', async () => {
    const config: LlmConfig = { provider: 'nebius', model: 'nvidia/nemotron-super-49b' }
    await expect(generate(config, 'hello')).rejects.toThrow(/API key/i)
  })

  it('rejects when provider is nebius but no model is configured', async () => {
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: '' }
    await expect(generate(config, 'hello')).rejects.toThrow(/model/i)
  })

  it('performs a successful mocked inference and returns message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: 'the model said hi' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'nvidia/nemotron-super-49b' }
    const text = await generate(config, 'hello')
    expect(text).toBe('the model said hi')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions')
    const body = JSON.parse((init?.body as string))
    expect(body.model).toBe('nvidia/nemotron-super-49b')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('throws a clear error on an invalid/empty API response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'nvidia/nemotron-super-49b' }
    await expect(generate(config, 'hello')).rejects.toThrow(/missing choices/i)
  })

  it('retries on 429 and succeeds once the rate limit clears', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    const text = await generate(config, 'hi')
    expect(text).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on a 5xx server error and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'recovered' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    const text = await generate(config, 'hi')
    expect(text).toBe('recovered')
  })

  it('exhausts retries and throws on a persistent rate limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' }))
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    await expect(generate(config, 'hi')).rejects.toThrow(/429/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry on a non-retryable 4xx error (bad request)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad request' }))
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    await expect(generate(config, 'hi')).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a timeout as a clear error', async () => {
    const timeoutError = new DOMException('The operation was aborted', 'TimeoutError')
    const fetchMock = vi.fn().mockRejectedValue(timeoutError)
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    await expect(generate(config, 'hi')).rejects.toThrow(/timed out/i)
  })

  it('defaults to the ollama provider when unset (regression)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { response: 'local reply' }))
    vi.stubGlobal('fetch', fetchMock)
    const text = await generate({ model: 'qwen2.5-coder:14b' }, 'hi')
    expect(text).toBe('local reply')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://localhost:11434/api/generate')
  })
})

describe('generateJson — end-to-end JSON extraction over Nebius', () => {
  it('parses a JSON object returned inside message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: '```json\n{"confirmed":true,"confidence":0.9}\n```' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const config: LlmConfig = { provider: 'nebius', apiKey: 'k', model: 'm' }
    const result = await generateJson<{ confirmed: boolean; confidence: number }>(config, 'analyze this')
    expect(result).toEqual({ confirmed: true, confidence: 0.9 })
  })
})

describe('isLlmAvailable — generic provider dispatch', () => {
  it('checks Ollama when provider is unset or ollama', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { models: [{ name: 'qwen2.5-coder:14b' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const available = await isLlmAvailable({ model: 'qwen2.5-coder:14b' })
    expect(available).toBe(true)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:11434/api/tags')
  })

  it('checks the Nebius catalog when provider is nebius', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: 'nvidia/nemotron-x' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const available = await isLlmAvailable({ provider: 'nebius', apiKey: 'k', model: 'nvidia/nemotron-x' })
    expect(available).toBe(true)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.tokenfactory.nebius.com/v1/models')
  })
})
