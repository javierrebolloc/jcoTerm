import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest'
import { GeminiClient, GeminiQuotaError } from '../main/ai/GeminiClient'
import { setLocale } from '../shared/i18n'

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Mock electron logger ──────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(text: string, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    json: async () => ({
      candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }],
    }),
  } as unknown as Response
}

function make429Response(
  message = 'Resource has been exhausted',
  details: unknown[] = [],
  headers: Record<string, string> = {},
): Response {
  return {
    ok: false,
    status: 429,
    headers: new Headers(headers),
    json: async () => ({
      error: { code: 429, message, status: 'RESOURCE_EXHAUSTED', details },
    }),
  } as unknown as Response
}

function makeErrorResponse(status: number, message = 'Internal error'): Response {
  return {
    ok: false,
    status,
    headers: new Headers(),
    json: async () => ({ error: { code: status, message, status: 'INTERNAL' } }),
  } as unknown as Response
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeminiClient', () => {
  beforeAll(() => { setLocale('es') })

  // Zero delays so tests don't wait seconds
  let client: GeminiClient

  beforeEach(() => {
    client = new GeminiClient('gemini-2.0-flash-lite', [0, 0, 0])
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('successful response', () => {
    it('returns the reply text', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse('Hola mundo'))
      const result = await client.sendMessage('key', 'pregunta', '')
      expect(result.reply).toBe('Hola mundo')
    })

    it('sends POST to correct URL with the API key in header', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse('ok'))
      await client.sendMessage('my-api-key', 'q', '')
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('gemini-2.0-flash-lite:generateContent')
      expect(url).not.toContain('key=')
      expect((opts.headers as Record<string, string>)['x-goog-api-key']).toBe('my-api-key')
    })

    it('includes terminal context in the request body', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse('ok'))
      await client.sendMessage('key', 'qué hay?', 'ls output here')
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string) as { contents: Array<{ parts: Array<{ text: string }> }> }
      expect(body.contents[0].parts[0].text).toContain('ls output here')
    })

    it('returns undefined quotaInfo when no rate-limit headers', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse('ok'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo).toBeUndefined()
    })
  })

  // ── Quota header parsing ────────────────────────────────────────────────────

  describe('quota header parsing', () => {
    it('reads x-ratelimit-remaining as remaining count', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse('ok', { 'x-ratelimit-remaining': '42' }))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo?.remaining).toBe(42)
      expect(result.quotaInfo?.isEstimate).toBe(false)
    })

    it('falls back to x-ratelimit-remaining-requests variant', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse('ok', { 'x-ratelimit-remaining-requests': '10' }),
      )
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo?.remaining).toBe(10)
    })

    it('converts unix timestamp in x-ratelimit-reset to ISO string', async () => {
      const ts = Math.floor(Date.now() / 1000) + 3600
      mockFetch.mockResolvedValueOnce(
        makeOkResponse('ok', { 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': String(ts) }),
      )
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo?.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('passes through ISO resetAt when in the future', async () => {
      const future = new Date(Date.now() + 3600_000).toISOString()
      mockFetch.mockResolvedValueOnce(
        makeOkResponse('ok', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': future }),
      )
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo?.resetAt).toBe(future)
    })

    it('discards resetAt when in the past', async () => {
      const past = '2025-01-01T08:00:00.000Z'
      mockFetch.mockResolvedValueOnce(
        makeOkResponse('ok', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': past }),
      )
      const result = await client.sendMessage('key', 'q', '')
      expect(result.quotaInfo?.resetAt).toBeUndefined()
    })
  })

  // ── 429 retry with backoff ──────────────────────────────────────────────────

  describe('429 retry with backoff', () => {
    it('retries once on transient 429 and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce(make429Response())
        .mockResolvedValueOnce(makeOkResponse('ok tras reintento'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.reply).toBe('ok tras reintento')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retries up to max attempts on persistent 429', async () => {
      mockFetch.mockResolvedValue(make429Response())
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(GeminiQuotaError)
      // 1 original + 3 retries (retryDelays.length) = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })

    it('succeeds on the last retry attempt', async () => {
      mockFetch
        .mockResolvedValueOnce(make429Response())
        .mockResolvedValueOnce(make429Response())
        .mockResolvedValueOnce(make429Response())
        .mockResolvedValueOnce(makeOkResponse('ok al cuarto intento'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.reply).toBe('ok al cuarto intento')
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })

  // ── GeminiQuotaError ────────────────────────────────────────────────────────

  describe('GeminiQuotaError', () => {
    it('throws GeminiQuotaError after max retries', async () => {
      mockFetch.mockResolvedValue(make429Response())
      await expect(client.sendMessage('key', 'q', '')).rejects.toBeInstanceOf(GeminiQuotaError)
    })

    it('sets limitType to "daily" for generic RESOURCE_EXHAUSTED', async () => {
      mockFetch.mockResolvedValue(make429Response('Resource has been exhausted'))
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('daily')
      }
    })

    it('sets limitType to "rpm" when error message contains per_minute', async () => {
      mockFetch.mockResolvedValue(make429Response('per_minute limit exceeded'))
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('rpm')
      }
    })

    it('sets limitType to "tpm" when error message mentions token', async () => {
      mockFetch.mockResolvedValue(make429Response('token quota exceeded'))
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('tpm')
      }
    })

    it('sets limitType to "daily" when message contains free_tier_requests', async () => {
      mockFetch.mockResolvedValue(
        make429Response(
          'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0',
        ),
      )
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('daily')
      }
    })

    it('classifies as daily (not tpm) when message has both free_tier_requests and token count', async () => {
      mockFetch.mockResolvedValue(
        make429Response(
          'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0\n* Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0',
        ),
      )
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('daily')
      }
    })

    it('reads limitType from quotaId in error details', async () => {
      mockFetch.mockResolvedValue(
        make429Response('exhausted', [
          { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', metadata: { quotaId: 'GenerateContent-per-minute-free' } },
        ]),
      )
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).limitType).toBe('rpm')
      }
    })

    it('includes resetAt from x-ratelimit-reset header in the error', async () => {
      const ts = Math.floor(Date.now() / 1000) + 86400
      mockFetch.mockResolvedValue(
        make429Response('exhausted', [], { 'x-ratelimit-reset': String(ts) }),
      )
      try {
        await client.sendMessage('key', 'q', '')
      } catch (err) {
        expect((err as GeminiQuotaError).resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      }
    })
  })

  // ── Zero-quota fast-fail ────────────────────────────────────────────────────

  describe('zero-quota fast-fail', () => {
    it('throws immediately without retrying when all limits are 0', async () => {
      mockFetch.mockResolvedValueOnce(
        make429Response(
          'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash-lite',
        ),
      )
      await expect(client.sendMessage('key', 'q', '')).rejects.toBeInstanceOf(GeminiQuotaError)
      // Only 1 fetch call — no retries
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('still retries when at least one limit is non-zero', async () => {
      mockFetch.mockResolvedValue(make429Response('limit: 0 for model X, limit: 100 for model Y'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toBeInstanceOf(GeminiQuotaError)
      // All 4 attempts made because limit is not ALL zero
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
  })

  // ── Retry-After / API-suggested delay ──────────────────────────────────────

  describe('API-suggested retry delay', () => {
    it('retries successfully when message contains "Please retry in Xs"', async () => {
      mockFetch
        .mockResolvedValueOnce(make429Response('Please retry in 0.001s'))
        .mockResolvedValueOnce(makeOkResponse('ok tras reintento'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.reply).toBe('ok tras reintento')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retries successfully when Retry-After header is set', async () => {
      mockFetch
        .mockResolvedValueOnce(make429Response('exhausted', [], { 'Retry-After': '0.001' }))
        .mockResolvedValueOnce(makeOkResponse('ok tras Retry-After'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.reply).toBe('ok tras Retry-After')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  // ── Non-429 errors ──────────────────────────────────────────────────────────

  describe('non-429 HTTP errors', () => {
    it('retries transient 500 errors before throwing', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(500))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow()
      expect(mockFetch).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
    })

    it('recovers from transient 500 on retry', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(500))
        .mockResolvedValueOnce(makeOkResponse('recovered'))
      const result = await client.sendMessage('key', 'q', '')
      expect(result.reply).toBe('recovered')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws immediately on 401 (bad API key)', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401, 'API key inválida'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow('API key inválida')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // ── Edge cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('throws when candidates array is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ candidates: [] }),
      } as unknown as Response)
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow('vacía')
    })

    it('uses the model passed in the constructor', async () => {
      const specificClient = new GeminiClient('gemini-1.5-flash', [0, 0, 0])
      mockFetch.mockResolvedValueOnce(makeOkResponse('ok'))
      await specificClient.sendMessage('key', 'q', '')
      const [url] = mockFetch.mock.calls[0] as [string, ...unknown[]]
      expect(url).toContain('gemini-1.5-flash:generateContent')
    })
  })
})
