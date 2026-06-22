import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { setLocale } from '../shared/i18n'

// ── Hoisted mock for @anthropic-ai/sdk ───────────────────────────────────────

const { mockCreate, MockAnthropic, MockAuthenticationError, MockRateLimitError, MockAPIError } =
  vi.hoisted(() => {
    const mockCreate = vi.fn()

    class MockAPIError extends Error {
      status: number
      constructor(status: number, message: string) {
        super(message)
        this.name = 'APIError'
        this.status = status
      }
    }

    class MockAuthenticationError extends MockAPIError {
      constructor(message = 'Invalid API key') {
        super(401, message)
        this.name = 'AuthenticationError'
      }
    }

    class MockRateLimitError extends MockAPIError {
      constructor(message = 'Rate limit exceeded') {
        super(429, message)
        this.name = 'RateLimitError'
      }
    }

    const MockAnthropic = vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    }))

    // Attach error classes as static properties
    MockAnthropic.AuthenticationError = MockAuthenticationError
    MockAnthropic.RateLimitError = MockRateLimitError
    MockAnthropic.APIError = MockAPIError

    return { mockCreate, MockAnthropic, MockAuthenticationError, MockRateLimitError, MockAPIError }
  })

vi.mock('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}))

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Import after mocks ──────────────────────────────────────────────────────

import { AnthropicClient } from '../main/ai/AnthropicClient'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AnthropicClient', () => {
  beforeAll(() => { setLocale('es') })

  let client: AnthropicClient

  beforeEach(() => {
    client = new AnthropicClient()
    mockCreate.mockReset()
  })

  // ── Respuesta exitosa ──────────────────────────────────────────────────────

  describe('respuesta exitosa', () => {
    it('devuelve el texto del primer bloque de contenido', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hola, soy Claude' }],
      })
      const result = await client.sendMessage('sk-ant-key', 'hola', '')
      expect(result.reply).toBe('Hola, soy Claude')
    })

    it('pasa la apiKey al constructor de Anthropic', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })
      await client.sendMessage('sk-ant-test-key', 'q', '')
      expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test-key' })
    })

    it('envía el modelo claude-sonnet-4-6 y max_tokens 1024', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })
      await client.sendMessage('key', 'pregunta', '')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
        }),
      )
    })
  })

  // ── Respuesta vacía ────────────────────────────────────────────────────────

  describe('respuesta vacía', () => {
    it('lanza error cuando content es un array vacío', async () => {
      mockCreate.mockResolvedValueOnce({ content: [] })
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow()
    })

    it('lanza error cuando el bloque no es de tipo text', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'x', name: 'test', input: {} }],
      })
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow()
    })
  })

  // ── Contexto en el prompt ──────────────────────────────────────────────────

  describe('contexto del terminal', () => {
    it('incluye el contexto redactado cuando no está vacío', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })
      await client.sendMessage('key', '¿qué ves?', 'ls -la\ntotal 42')
      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(callArgs.messages[0].content).toContain('ls -la')
      expect(callArgs.messages[0].content).toContain('total 42')
      expect(callArgs.messages[0].content).toContain('¿qué ves?')
    })

    it('no incluye contexto cuando redactedContext está vacío', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })
      await client.sendMessage('key', '¿qué ves?', '')
      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      // Should be just the user message, without the context template
      expect(callArgs.messages[0].content).toBe('¿qué ves?')
      expect(callArgs.messages[0].content).not.toContain('terminal')
    })

    it('no incluye contexto cuando redactedContext es solo whitespace', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ok' }],
      })
      await client.sendMessage('key', 'pregunta', '   \n  \t  ')
      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(callArgs.messages[0].content).toBe('pregunta')
    })
  })

  // ── Errores de autenticación ───────────────────────────────────────────────

  describe('AuthenticationError', () => {
    it('devuelve mensaje amigable sobre API key inválida', async () => {
      mockCreate.mockRejectedValueOnce(new MockAuthenticationError('invalid x-api-key'))
      await expect(client.sendMessage('bad-key', 'q', '')).rejects.toThrow(
        'API key de Anthropic inválida o expirada',
      )
    })
  })

  // ── Errores de rate limit ──────────────────────────────────────────────────

  describe('RateLimitError', () => {
    it('devuelve mensaje amigable sobre límite de peticiones', async () => {
      mockCreate.mockRejectedValueOnce(new MockRateLimitError())
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Límite de peticiones de Anthropic alcanzado',
      )
    })
  })

  // ── APIError con status 529 (overloaded) ───────────────────────────────────

  describe('APIError con status 529', () => {
    it('devuelve mensaje de sobrecarga', async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(529, 'Overloaded'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Anthropic está temporalmente sobrecargado',
      )
    })

    it('devuelve mensaje de sobrecarga para status 503', async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(503, 'Service unavailable'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Anthropic está temporalmente sobrecargado',
      )
    })
  })

  // ── APIError genérico ──────────────────────────────────────────────────────

  describe('APIError genérico', () => {
    it('devuelve mensaje genérico con el status code', async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(500, 'Internal server error'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Error de la API de Anthropic (500)',
      )
    })

    it('incluye referencia al log en el mensaje', async () => {
      mockCreate.mockRejectedValueOnce(new MockAPIError(400, 'Bad request'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Consulta el log para detalles',
      )
    })
  })

  // ── Error de red (fetch) ───────────────────────────────────────────────────

  describe('error de red', () => {
    it('devuelve mensaje de error de red cuando el error menciona fetch', async () => {
      mockCreate.mockRejectedValueOnce(new Error('fetch failed: ENOTFOUND'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Error de red al contactar con Anthropic',
      )
    })
  })

  // ── Error desconocido ──────────────────────────────────────────────────────

  describe('error inesperado', () => {
    it('devuelve mensaje genérico para errores no clasificados', async () => {
      mockCreate.mockRejectedValueOnce(new Error('something completely unexpected'))
      await expect(client.sendMessage('key', 'q', '')).rejects.toThrow(
        'Error inesperado al contactar con Anthropic',
      )
    })
  })
})
