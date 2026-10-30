import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAdapter, detectProviderFromModel } from '../../src/llm/provider-factory.js'
import type { LLMMessage } from '../../src/core/types.js'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NEBIUS_API_KEY
  delete process.env.NEBIUS_BASE_URL
})

describe('createAdapter — provider selection', () => {
  it('throws when provider is nebius and no API key is configured', () => {
    expect(() => createAdapter({ provider: 'nebius' })).toThrow(/NEBIUS_API_KEY/)
  })

  it('creates a usable adapter for nebius when an API key is supplied', () => {
    const adapter = createAdapter({ provider: 'nebius', apiKey: 'test-key' })
    expect(adapter.name).toBe('nebius')
  })

  it('reads NEBIUS_API_KEY from the environment', () => {
    process.env.NEBIUS_API_KEY = 'env-key'
    expect(() => createAdapter({ provider: 'nebius' })).not.toThrow()
  })

  it('defaults to the public Token Factory base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'x', model: 'nvidia/nemotron-super-49b', choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createAdapter({ provider: 'nebius', apiKey: 'k' })
    const messages: LLMMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    await adapter.chat(messages, { model: 'nvidia/nemotron-super-49b' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('honors a custom NEBIUS_BASE_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'x', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createAdapter({ provider: 'nebius', apiKey: 'k', baseUrl: 'https://custom.example.com/v1' })
    const messages: LLMMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    await adapter.chat(messages, { model: 'm' })

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://custom.example.com/v1/chat/completions')
  })

  it('still constructs the ollama adapter by default (regression)', () => {
    const adapter = createAdapter({ provider: 'ollama' })
    expect(adapter.name).toBe('ollama')
  })

  it('throws for openai/anthropic without an API key (regression)', () => {
    expect(() => createAdapter({ provider: 'openai' })).toThrow(/OpenAI API key/)
    expect(() => createAdapter({ provider: 'anthropic' })).toThrow(/Anthropic API key/)
  })
})

describe('detectProviderFromModel', () => {
  it('detects Nemotron models as nebius', () => {
    expect(detectProviderFromModel('nvidia/nemotron-super-49b-v1')).toBe('nebius')
    expect(detectProviderFromModel('NVIDIA-Nemotron-4-340B')).toBe('nebius')
  })

  it('still detects existing providers (regression)', () => {
    expect(detectProviderFromModel('claude-sonnet-4-5')).toBe('anthropic')
    expect(detectProviderFromModel('gpt-4o')).toBe('openai')
    expect(detectProviderFromModel('qwen2.5-coder:14b')).toBe('ollama')
  })

  it('returns undefined for an unrecognized model name', () => {
    expect(detectProviderFromModel('some-unknown-model')).toBeUndefined()
  })
})
