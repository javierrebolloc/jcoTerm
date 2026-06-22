import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SshManager } from '../main/ssh/SshManager'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock SshSession ──────────────────────────────────────────────────────────
// SshSession's default clientFactory does require('ssh2'), which we don't want
// in unit tests. We mock the module so SshManager gets lightweight stubs.

const { MockSshSession } = vi.hoisted(() => {
  class MockSshSession {
    readonly id: string
    private _connected = false
    disconnectCalled = false

    constructor(id: string) {
      this.id = id
    }

    get connected(): boolean {
      return this._connected
    }

    /** Test helper — mark as connected so removeSession exercises disconnect path */
    _setConnected(value: boolean): void {
      this._connected = value
    }

    disconnect(): void {
      this.disconnectCalled = true
      this._connected = false
    }
  }

  return { MockSshSession }
})

vi.mock('../main/ssh/SshSession', () => ({
  SshSession: MockSshSession,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SshManager', () => {
  let manager: SshManager

  beforeEach(() => {
    manager = new SshManager()
  })

  // ── createSession ──────────────────────────────────────────────────────────

  describe('createSession()', () => {
    it('crea una sesión con el id proporcionado', () => {
      const session = manager.createSession('sess-1')
      expect(session).toBeDefined()
      expect(session.id).toBe('sess-1')
    })

    it('almacena la sesión internamente y puede recuperarse', () => {
      manager.createSession('sess-1')
      const retrieved = manager.getSession('sess-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('sess-1')
    })

    it('incrementa activeCount al crear sesiones', () => {
      expect(manager.activeCount).toBe(0)
      manager.createSession('sess-1')
      expect(manager.activeCount).toBe(1)
      manager.createSession('sess-2')
      expect(manager.activeCount).toBe(2)
    })

    it('sobrescribe una sesión existente con el mismo id', () => {
      const first = manager.createSession('sess-1')
      const second = manager.createSession('sess-1')
      expect(first).not.toBe(second)
      expect(manager.activeCount).toBe(1)
      expect(manager.getSession('sess-1')).toBe(second)
    })
  })

  // ── getSession ─────────────────────────────────────────────────────────────

  describe('getSession()', () => {
    it('devuelve la sesión existente por id', () => {
      const session = manager.createSession('sess-1')
      expect(manager.getSession('sess-1')).toBe(session)
    })

    it('devuelve undefined para un id inexistente', () => {
      expect(manager.getSession('no-existe')).toBeUndefined()
    })
  })

  // ── removeSession ──────────────────────────────────────────────────────────

  describe('removeSession()', () => {
    it('elimina una sesión no conectada', () => {
      manager.createSession('sess-1')
      expect(manager.activeCount).toBe(1)
      manager.removeSession('sess-1')
      expect(manager.activeCount).toBe(0)
      expect(manager.getSession('sess-1')).toBeUndefined()
    })

    it('llama a disconnect cuando la sesión está conectada', () => {
      const session = manager.createSession('sess-connected')
      // Mark as connected using the mock helper
      ;(session as unknown as InstanceType<typeof MockSshSession>)._setConnected(true)
      expect(session.connected).toBe(true)

      manager.removeSession('sess-connected')
      expect((session as unknown as InstanceType<typeof MockSshSession>).disconnectCalled).toBe(true)
      expect(manager.getSession('sess-connected')).toBeUndefined()
    })

    it('no llama a disconnect cuando la sesión no está conectada', () => {
      const session = manager.createSession('sess-idle')
      expect(session.connected).toBe(false)

      manager.removeSession('sess-idle')
      expect((session as unknown as InstanceType<typeof MockSshSession>).disconnectCalled).toBe(false)
    })

    it('no falla al eliminar un id inexistente', () => {
      expect(() => manager.removeSession('fantasma')).not.toThrow()
      expect(manager.activeCount).toBe(0)
    })

    it('no afecta otras sesiones al eliminar una', () => {
      manager.createSession('sess-1')
      manager.createSession('sess-2')
      manager.createSession('sess-3')
      expect(manager.activeCount).toBe(3)

      manager.removeSession('sess-2')
      expect(manager.activeCount).toBe(2)
      expect(manager.getSession('sess-1')).toBeDefined()
      expect(manager.getSession('sess-2')).toBeUndefined()
      expect(manager.getSession('sess-3')).toBeDefined()
    })
  })

  // ── closeAll ───────────────────────────────────────────────────────────────

  describe('closeAll()', () => {
    it('elimina todas las sesiones', () => {
      manager.createSession('sess-1')
      manager.createSession('sess-2')
      manager.createSession('sess-3')
      expect(manager.activeCount).toBe(3)

      manager.closeAll()
      expect(manager.activeCount).toBe(0)
      expect(manager.getSession('sess-1')).toBeUndefined()
      expect(manager.getSession('sess-2')).toBeUndefined()
      expect(manager.getSession('sess-3')).toBeUndefined()
    })

    it('desconecta sesiones conectadas al cerrar todo', () => {
      const s1 = manager.createSession('sess-1')
      const s2 = manager.createSession('sess-2')
      ;(s1 as unknown as InstanceType<typeof MockSshSession>)._setConnected(true)

      manager.closeAll()
      expect((s1 as unknown as InstanceType<typeof MockSshSession>).disconnectCalled).toBe(true)
      expect((s2 as unknown as InstanceType<typeof MockSshSession>).disconnectCalled).toBe(false)
      expect(manager.activeCount).toBe(0)
    })

    it('no falla cuando no hay sesiones', () => {
      expect(() => manager.closeAll()).not.toThrow()
      expect(manager.activeCount).toBe(0)
    })

    it('funciona correctamente tras múltiples closeAll consecutivos', () => {
      manager.createSession('sess-1')
      manager.closeAll()
      manager.closeAll()
      expect(manager.activeCount).toBe(0)
    })
  })

  // ── activeCount ────────────────────────────────────────────────────────────

  describe('activeCount', () => {
    it('es 0 inicialmente', () => {
      expect(manager.activeCount).toBe(0)
    })

    it('refleja el número de sesiones tras crear y eliminar', () => {
      manager.createSession('a')
      manager.createSession('b')
      expect(manager.activeCount).toBe(2)

      manager.removeSession('a')
      expect(manager.activeCount).toBe(1)

      manager.createSession('c')
      expect(manager.activeCount).toBe(2)

      manager.closeAll()
      expect(manager.activeCount).toBe(0)
    })
  })
})
