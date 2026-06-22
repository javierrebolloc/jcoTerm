import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { isValidHost, isValidPort, isValidSessionId, isValidUsername } from '../main/security'
import { setLocale } from '../shared/i18n'

beforeAll(() => { setLocale('es') })

// ── security.ts validators ────────────────────────────────────────────────────

describe('isValidHost', () => {
  it('accepts valid hostnames', () => {
    expect(isValidHost('example.com')).toBe(true)
    expect(isValidHost('my-server')).toBe(true)
    expect(isValidHost('db.internal.company.com')).toBe(true)
  })

  it('accepts valid IPv4 addresses', () => {
    expect(isValidHost('192.168.1.100')).toBe(true)
    expect(isValidHost('10.0.0.1')).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isValidHost('')).toBe(false)
    expect(isValidHost(null)).toBe(false)
    expect(isValidHost(123)).toBe(false)
    expect(isValidHost('host with spaces')).toBe(false)
    // Command injection attempts
    expect(isValidHost('host; rm -rf /')).toBe(false)
    expect(isValidHost('$(evil)')).toBe(false)
    expect(isValidHost('`evil`')).toBe(false)
  })

  it('rejects hostnames that are too long', () => {
    expect(isValidHost('a'.repeat(254))).toBe(false)
  })
})

describe('isValidPort', () => {
  it('accepts valid port numbers', () => {
    expect(isValidPort(22)).toBe(true)
    expect(isValidPort(443)).toBe(true)
    expect(isValidPort(1)).toBe(true)
    expect(isValidPort(65535)).toBe(true)
  })

  it('rejects invalid ports', () => {
    expect(isValidPort(0)).toBe(false)
    expect(isValidPort(65536)).toBe(false)
    expect(isValidPort(-1)).toBe(false)
    expect(isValidPort(22.5)).toBe(false)
    expect(isValidPort('22')).toBe(false)
    expect(isValidPort(null)).toBe(false)
  })
})

describe('isValidSessionId', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidSessionId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
  })

  it('rejects non-UUID strings', () => {
    expect(isValidSessionId('')).toBe(false)
    expect(isValidSessionId('not-a-uuid')).toBe(false)
    expect(isValidSessionId('../../../etc/passwd')).toBe(false)
    expect(isValidSessionId(null)).toBe(false)
    expect(isValidSessionId(123)).toBe(false)
    // UUID v1 (not v4) should be rejected
    expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false)
  })
})

describe('isValidUsername', () => {
  it('accepts valid usernames', () => {
    expect(isValidUsername('root')).toBe(true)
    expect(isValidUsername('john.doe')).toBe(true)
    expect(isValidUsername('user123')).toBe(true)
  })

  it('rejects invalid usernames', () => {
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername('a'.repeat(65))).toBe(false)
    expect(isValidUsername(null)).toBe(false)
    expect(isValidUsername(42)).toBe(false)
  })
})

// ── IPC handler input validation (integration-style) ─────────────────────────

describe('SSH handler input validation (via security guards)', () => {
  it('rejects connection attempts with invalid host', () => {
    // The handler calls isValidHost before connecting
    expect(isValidHost('malicious; cat /etc/passwd')).toBe(false)
    expect(isValidHost('')).toBe(false)
  })

  it('rejects input with invalid sessionId to prevent forged IDs', () => {
    expect(isValidSessionId('../../secret')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
  })

  it('a valid UUID passes all checks needed for SSH input routing', () => {
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    expect(isValidSessionId(id)).toBe(true)
  })

  it('validates that the mock ipcMain.handle was set up (setup.ts integration)', async () => {
    // Confirms the electron mock in setup.ts is active
    const electron = await import('electron')
    expect(electron.ipcMain.handle).toBeDefined()
  })
})
