import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import { registerSessionHandlers } from '../main/ipc/session.handlers'
import type { SessionStore } from '../main/storage/SessionStore'
import type { CredentialStore } from '../main/storage/CredentialStore'
import type { NamedCredentialStore } from '../main/storage/NamedCredentialStore'
import type { SavedSession, NamedCredential, IpcResult, SavedSessionWithStatus, SaveSessionPayload } from '../shared/types'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock uuid ────────────────────────────────────────────────────────────────

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-1234'),
}))

// ── Mock stores ──────────────────────────────────────────────────────────────

function makeSessionStore(sessions: SavedSession[] = []): SessionStore {
  return {
    list: vi.fn().mockReturnValue(sessions),
    save: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getFilePath: vi.fn().mockReturnValue('/mock/sessions.json'),
    setFilePath: vi.fn(),
  } as unknown as SessionStore
}

function makeCredentialStore(credMap: Record<string, boolean> = {}): CredentialStore {
  return {
    hasCredential: vi.fn((id: string) => credMap[id] ?? false),
    savePassword: vi.fn(),
    savePrivateKey: vi.fn(),
    deleteCredential: vi.fn(),
    getCredential: vi.fn(),
  } as unknown as CredentialStore
}

function makeNamedCredentialStore(
  namedCreds: Record<string, NamedCredential> = {},
): NamedCredentialStore {
  return {
    findById: vi.fn((id: string) => namedCreds[id]),
    list: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } as unknown as NamedCredentialStore
}

// ── Handler capture helper ───────────────────────────────────────────────────

function captureHandler(channel: string): (...args: unknown[]) => unknown {
  const handleMock = vi.mocked(ipcMain.handle)
  const call = handleMock.mock.calls.find(([ch]) => ch === channel)
  if (!call) throw new Error(`Handler para "${channel}" no registrado`)
  return call[1] as (...args: unknown[]) => unknown
}

// ── Sample data ──────────────────────────────────────────────────────────────

const SESSION_1: SavedSession = {
  id: 'sess-1',
  name: 'Mi servidor',
  host: '192.168.1.10',
  port: 22,
  username: 'admin',
  authMethod: 'password',
  createdAt: 1700000000000,
}

const SESSION_2: SavedSession = {
  id: 'sess-2',
  name: 'Servidor con cred',
  host: '10.0.0.5',
  port: 2222,
  username: 'deploy',
  authMethod: 'privateKey',
  createdAt: 1700000001000,
  namedCredentialId: 'cred-1',
}

const NAMED_CRED: NamedCredential = {
  id: 'cred-1',
  label: 'Deploy key',
  username: 'deploy',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('session.handlers', () => {
  beforeAll(() => { setLocale('es') })

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
  })

  // ── sessions:list ──────────────────────────────────────────────────────────

  describe('sessions:list', () => {
    it('devuelve sesiones con hasStoredCredential enriquecido', () => {
      const sessionStore = makeSessionStore([SESSION_1])
      const credentialStore = makeCredentialStore({ 'sess-1': true })
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult<SavedSessionWithStatus[]>
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].hasStoredCredential).toBe(true)
      expect(result.data![0].id).toBe('sess-1')
    })

    it('marca hasStoredCredential como false cuando no hay credencial', () => {
      const sessionStore = makeSessionStore([SESSION_1])
      const credentialStore = makeCredentialStore({})
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult<SavedSessionWithStatus[]>
      expect(result.data![0].hasStoredCredential).toBe(false)
    })

    it('incluye namedCredential cuando la sesión tiene namedCredentialId', () => {
      const sessionStore = makeSessionStore([SESSION_2])
      const credentialStore = makeCredentialStore({})
      const namedCredentialStore = makeNamedCredentialStore({ 'cred-1': NAMED_CRED })

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult<SavedSessionWithStatus[]>
      expect(result.data![0].namedCredential).toEqual(NAMED_CRED)
    })

    it('no incluye namedCredential cuando la sesión no tiene namedCredentialId', () => {
      const sessionStore = makeSessionStore([SESSION_1])
      const credentialStore = makeCredentialStore({})
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult<SavedSessionWithStatus[]>
      expect(result.data![0].namedCredential).toBeUndefined()
    })

    it('devuelve array vacío cuando no hay sesiones', () => {
      const sessionStore = makeSessionStore([])
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult<SavedSessionWithStatus[]>
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('devuelve error si el store lanza excepción', () => {
      const sessionStore = makeSessionStore()
      vi.mocked(sessionStore.list).mockImplementation(() => {
        throw new Error('disco corrupto')
      })
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:list')

      const result = handler() as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('disco corrupto')
    })
  })

  // ── sessions:save ──────────────────────────────────────────────────────────

  describe('sessions:save', () => {
    it('guarda la sesión y devuelve success', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const payload: SaveSessionPayload = {
        session: { ...SESSION_1 },
      }
      const result = handler(null, payload) as IpcResult
      expect(result.success).toBe(true)
      expect(sessionStore.save).toHaveBeenCalledWith(payload.session)
    })

    it('genera un id si la sesión no tiene uno', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const session = { ...SESSION_1, id: '' } as SavedSession
      const payload: SaveSessionPayload = { session }
      handler(null, payload)

      // uuid mock returns 'generated-uuid-1234'
      expect(payload.session.id).toBe('generated-uuid-1234')
    })

    it('genera createdAt si la sesión no tiene uno', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const session = { ...SESSION_1, createdAt: 0 } as SavedSession
      const payload: SaveSessionPayload = { session }
      handler(null, payload)

      expect(payload.session.createdAt).toBeGreaterThan(0)
    })

    it('guarda credencial password cuando saveCredential y authMethod=password', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const payload: SaveSessionPayload = {
        session: { ...SESSION_1, authMethod: 'password' },
        saveCredential: true,
        credentials: { password: 'mi-secreto' },
      }
      handler(null, payload)
      expect(credentialStore.savePassword).toHaveBeenCalledWith(SESSION_1.id, 'mi-secreto')
    })

    it('guarda credencial privateKey cuando saveCredential y authMethod=privateKey', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const payload: SaveSessionPayload = {
        session: { ...SESSION_2, authMethod: 'privateKey' },
        saveCredential: true,
        credentials: { privateKey: '-----BEGIN RSA-----\nfake\n-----END RSA-----', passphrase: 'pp' },
      }
      handler(null, payload)
      expect(credentialStore.savePrivateKey).toHaveBeenCalledWith(
        SESSION_2.id,
        '-----BEGIN RSA-----\nfake\n-----END RSA-----',
        'pp',
      )
    })

    it('no guarda credenciales si saveCredential es false', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const payload: SaveSessionPayload = {
        session: { ...SESSION_1 },
        saveCredential: false,
        credentials: { password: 'ignored' },
      }
      handler(null, payload)
      expect(credentialStore.savePassword).not.toHaveBeenCalled()
      expect(credentialStore.savePrivateKey).not.toHaveBeenCalled()
    })

    it('devuelve error si el store lanza excepción al guardar', () => {
      const sessionStore = makeSessionStore()
      vi.mocked(sessionStore.save).mockImplementation(() => {
        throw new Error('sin espacio en disco')
      })
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:save')

      const payload: SaveSessionPayload = { session: { ...SESSION_1 } }
      const result = handler(null, payload) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('sin espacio en disco')
    })
  })

  // ── sessions:delete ────────────────────────────────────────────────────────

  describe('sessions:delete', () => {
    it('elimina la sesión y la credencial asociada', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:delete')

      const result = handler(null, 'sess-1') as IpcResult
      expect(result.success).toBe(true)
      expect(sessionStore.delete).toHaveBeenCalledWith('sess-1')
      expect(credentialStore.deleteCredential).toHaveBeenCalledWith('sess-1')
    })

    it('devuelve error con ID inválido (no string)', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:delete')

      const result = handler(null, 123) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID de sesión inválido')
    })

    it('devuelve error con ID vacío', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:delete')

      const result = handler(null, '') as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID de sesión inválido')
    })

    it('devuelve error si el store lanza excepción al eliminar', () => {
      const sessionStore = makeSessionStore()
      vi.mocked(sessionStore.delete).mockImplementation(() => {
        throw new Error('fallo al eliminar')
      })
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:delete')

      const result = handler(null, 'sess-1') as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('fallo al eliminar')
    })
  })

  // ── sessions:getFilePath ───────────────────────────────────────────────────

  describe('sessions:getFilePath', () => {
    it('devuelve la ruta del fichero de sesiones', () => {
      const sessionStore = makeSessionStore()
      const credentialStore = makeCredentialStore()
      const namedCredentialStore = makeNamedCredentialStore()

      registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
      const handler = captureHandler('sessions:getFilePath')

      const result = handler() as IpcResult<string>
      expect(result.success).toBe(true)
      expect(result.data).toBe('/mock/sessions.json')
    })
  })
})
