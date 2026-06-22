import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import { registerAiHandlers } from '../main/ipc/ai.handlers'
import type { CredentialStore } from '../main/storage/CredentialStore'
import type { SettingsStore } from '../main/storage/SettingsStore'
import type { AiMessageRequest } from '../shared/types'
import { setLocale } from '../shared/i18n'

// ── Mock AI clients ───────────────────────────────────────────────────────────
// Use vi.hoisted so these are available inside vi.mock() factory closures.

const { mockAnthropicStream, mockGeminiStream } = vi.hoisted(() => ({
  mockAnthropicStream: vi.fn().mockImplementation(async (_key: string, _msg: string, _ctx: string, callbacks: { onChunk: (t: string) => void; onEnd: () => void }) => {
    callbacks.onChunk('respuesta de claude')
    callbacks.onEnd()
  }),
  mockGeminiStream: vi.fn().mockImplementation(async (_key: string, _msg: string, _ctx: string, callbacks: { onChunk: (t: string) => void; onEnd: (q?: unknown) => void }) => {
    callbacks.onChunk('respuesta de gemini')
    callbacks.onEnd({ remaining: 50, isEstimate: false, limitType: 'daily' })
  }),
}))

vi.mock('../main/ai/AnthropicClient', () => ({
  AnthropicClient: vi.fn().mockImplementation(() => ({ sendMessageStream: mockAnthropicStream })),
}))

vi.mock('../main/ai/GeminiClient', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({ sendMessageStream: mockGeminiStream })),
  GeminiQuotaError: class GeminiQuotaError extends Error {
    limitType = 'daily'
    resetAt?: string
  },
}))

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCredentialStore(password: string | null): CredentialStore {
  return {
    getCredential: vi.fn().mockReturnValue(
      password !== null ? { type: 'password', password } : null,
    ),
    hasCredential: vi.fn().mockReturnValue(password !== null),
  } as unknown as CredentialStore
}

function makeSettingsStore(aiProvider: 'anthropic' | 'gemini', geminiModel = 'gemini-2.0-flash-lite'): SettingsStore {
  return {
    get: vi.fn().mockReturnValue({ aiProvider, geminiModel }),
  } as unknown as SettingsStore
}

/** Capture the handler registered via ipcMain.handle for IPC.AI.SEND_MESSAGE */
function captureHandler(): (
  _event: unknown,
  req: AiMessageRequest,
) => Promise<unknown> {
  const handleMock = vi.mocked(ipcMain.handle)
  const call = handleMock.mock.calls.find(([channel]) => channel === 'ai:sendMessage')
  if (!call) throw new Error('ai:sendMessage handler not registered')
  return call[1] as (_event: unknown, req: AiMessageRequest) => Promise<unknown>
}

const REQ: AiMessageRequest = { userMessage: '¿qué pasa?', terminalSnapshot: 'ls output' }

const mockEvent = {
  sender: { isDestroyed: () => false, send: vi.fn() },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AI handler routing', () => {
  beforeAll(() => { setLocale('es') })

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    mockAnthropicStream.mockClear()
    mockGeminiStream.mockClear()
    vi.mocked(mockEvent.sender.send).mockClear()
  })

  // ── Anthropic routing ────────────────────────────────────────────────────────

  describe('when aiProvider = anthropic', () => {
    it('calls AnthropicClient.sendMessageStream', async () => {
      registerAiHandlers(makeCredentialStore('sk-ant-key'), makeSettingsStore('anthropic'))
      const handler = captureHandler()
      const result = await handler(mockEvent, REQ)
      expect(mockAnthropicStream).toHaveBeenCalledOnce()
      expect(mockGeminiStream).not.toHaveBeenCalled()
      expect((result as { success: boolean }).success).toBe(true)
    })

    it('returns success: false when Anthropic key not set', async () => {
      registerAiHandlers(makeCredentialStore(null), makeSettingsStore('anthropic'))
      const handler = captureHandler()
      const result = await handler(mockEvent, REQ)
      expect((result as { success: boolean; error: string }).success).toBe(false)
      expect((result as { error: string }).error).toContain('Anthropic')
      expect(mockAnthropicStream).not.toHaveBeenCalled()
    })
  })

  // ── Gemini routing ───────────────────────────────────────────────────────────

  describe('when aiProvider = gemini', () => {
    it('calls GeminiClient.sendMessageStream', async () => {
      registerAiHandlers(makeCredentialStore('AIza-key'), makeSettingsStore('gemini'))
      const handler = captureHandler()
      const result = await handler(mockEvent, REQ)
      expect(mockGeminiStream).toHaveBeenCalledOnce()
      expect(mockAnthropicStream).not.toHaveBeenCalled()
      expect((result as { success: boolean }).success).toBe(true)
    })

    it('returns success: false when Gemini key not set', async () => {
      registerAiHandlers(makeCredentialStore(null), makeSettingsStore('gemini'))
      const handler = captureHandler()
      const result = await handler(mockEvent, REQ)
      expect((result as { success: boolean }).success).toBe(false)
      expect((result as { error: string }).error).toContain('Gemini')
      expect(mockGeminiStream).not.toHaveBeenCalled()
    })

    it('passes the configured geminiModel to GeminiClient constructor', async () => {
      const { GeminiClient } = await import('../main/ai/GeminiClient')
      registerAiHandlers(makeCredentialStore('AIza-key'), makeSettingsStore('gemini', 'gemini-1.5-flash'))
      const handler = captureHandler()
      await handler(mockEvent, REQ)
      expect(vi.mocked(GeminiClient)).toHaveBeenCalledWith('gemini-1.5-flash')
    })
  })
})
