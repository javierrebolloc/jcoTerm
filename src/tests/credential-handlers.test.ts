import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import { registerCredentialHandlers } from '../main/ipc/credential.handlers'
import { IPC } from '../shared/ipc-channels'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock uuid to return a deterministic value ────────────────────────────────

const MOCK_UUID = 'aaaabbbb-0000-4000-a000-000000000099'
vi.mock('uuid', () => ({ v4: vi.fn(() => MOCK_UUID) }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureHandler(channel: string): (...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

function makeNamedCredentialStore() {
  return {
    list: vi.fn(() => []),
    save: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
  }
}

function makeCredentialStore() {
  return {
    savePassword: vi.fn(),
    deleteCredential: vi.fn(),
    hasCredential: vi.fn(),
    getCredential: vi.fn(),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('credential.handlers', () => {
  beforeAll(() => { setLocale('es') })

  let namedStore: ReturnType<typeof makeNamedCredentialStore>
  let credStore: ReturnType<typeof makeCredentialStore>

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    namedStore = makeNamedCredentialStore()
    credStore = makeCredentialStore()
    registerCredentialHandlers(namedStore as never, credStore as never)
  })

  // ── credentials:list ────────────────────────────────────────────────────────

  describe('credentials:list', () => {
    it('returns the list from the store', async () => {
      const items = [{ id: '1', label: 'Admin', username: 'root' }]
      namedStore.list.mockReturnValue(items)
      const handler = captureHandler(IPC.CREDENTIALS.LIST)
      const result = handler() as { success: boolean; data: unknown }
      expect(result.success).toBe(true)
      expect(result.data).toEqual(items)
    })

    it('returns an empty list when store is empty', () => {
      const handler = captureHandler(IPC.CREDENTIALS.LIST)
      const result = handler() as { success: boolean; data: unknown[] }
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('returns error when store throws', () => {
      namedStore.list.mockImplementation(() => {
        throw new Error('disk error')
      })
      const handler = captureHandler(IPC.CREDENTIALS.LIST)
      const result = handler() as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('disk error')
    })
  })

  // ── credentials:save ────────────────────────────────────────────────────────

  describe('credentials:save', () => {
    it('generates UUID when credential has no id', () => {
      const handler = captureHandler(IPC.CREDENTIALS.SAVE)
      const payload = {
        credential: { id: '', label: 'Dev', username: 'dev' },
        password: 'secret',
      }
      const result = handler({}, payload) as { success: boolean }
      expect(result.success).toBe(true)
      expect(payload.credential.id).toBe(MOCK_UUID)
      expect(namedStore.save).toHaveBeenCalledWith(payload.credential)
      expect(credStore.savePassword).toHaveBeenCalledWith(MOCK_UUID, 'secret')
    })

    it('accepts a valid UUID v4 id', () => {
      const handler = captureHandler(IPC.CREDENTIALS.SAVE)
      const validId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const payload = {
        credential: { id: validId, label: 'Prod', username: 'admin' },
        password: 'pass123',
      }
      const result = handler({}, payload) as { success: boolean }
      expect(result.success).toBe(true)
      expect(namedStore.save).toHaveBeenCalledWith(payload.credential)
      expect(credStore.savePassword).toHaveBeenCalledWith(validId, 'pass123')
    })

    it('rejects an invalid id format', () => {
      const handler = captureHandler(IPC.CREDENTIALS.SAVE)
      const payload = {
        credential: { id: 'not-a-uuid', label: 'Bad', username: 'x' },
        password: 'pass',
      }
      const result = handler({}, payload) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID de credencial inválido')
      expect(namedStore.save).not.toHaveBeenCalled()
    })

    it('saves to named store but skips password when not provided', () => {
      const handler = captureHandler(IPC.CREDENTIALS.SAVE)
      const payload = {
        credential: { id: '', label: 'NoPass', username: 'user' },
      }
      const result = handler({}, payload) as { success: boolean }
      expect(result.success).toBe(true)
      expect(namedStore.save).toHaveBeenCalled()
      expect(credStore.savePassword).not.toHaveBeenCalled()
    })

    it('returns error when named store throws', () => {
      namedStore.save.mockImplementation(() => {
        throw new Error('write failed')
      })
      const handler = captureHandler(IPC.CREDENTIALS.SAVE)
      const payload = {
        credential: { id: '', label: 'Err', username: 'u' },
      }
      const result = handler({}, payload) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('write failed')
    })
  })

  // ── credentials:delete ──────────────────────────────────────────────────────

  describe('credentials:delete', () => {
    it('deletes from both stores with a valid id', () => {
      const handler = captureHandler(IPC.CREDENTIALS.DELETE)
      const result = handler({}, 'some-id') as { success: boolean }
      expect(result.success).toBe(true)
      expect(namedStore.delete).toHaveBeenCalledWith('some-id')
      expect(credStore.deleteCredential).toHaveBeenCalledWith('some-id')
    })

    it('rejects non-string id', () => {
      const handler = captureHandler(IPC.CREDENTIALS.DELETE)
      const result = handler({}, 123) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID inválido')
    })

    it('rejects empty string id', () => {
      const handler = captureHandler(IPC.CREDENTIALS.DELETE)
      const result = handler({}, '') as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID inválido')
    })

    it('returns error when store throws during deletion', () => {
      namedStore.delete.mockImplementation(() => {
        throw new Error('delete failed')
      })
      const handler = captureHandler(IPC.CREDENTIALS.DELETE)
      const result = handler({}, 'valid-id') as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('delete failed')
    })
  })
})
