import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import path from 'path'
import {
  isValidHost,
  isValidTerminalDimension,
  isValidSettingsPath,
  sanitizeSshError,
  sanitizeForLog,
  IpcRateLimiter,
} from '../main/security'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── isValidHost ──────────────────────────────────────────────────────────────

describe('isValidHost', () => {
  it('accepts valid hostnames', () => {
    expect(isValidHost('example.com')).toBe(true)
    expect(isValidHost('my-server')).toBe(true)
    expect(isValidHost('db.internal.company.com')).toBe(true)
    expect(isValidHost('a')).toBe(true)
  })

  it('accepts valid IPv4 addresses', () => {
    expect(isValidHost('192.168.1.100')).toBe(true)
    expect(isValidHost('10.0.0.1')).toBe(true)
    expect(isValidHost('0.0.0.0')).toBe(true)
    expect(isValidHost('255.255.255.255')).toBe(true)
  })

  it('rejects invalid IPv4 addresses with octets > 255', () => {
    expect(isValidHost('999.999.999.999')).toBe(false)
    expect(isValidHost('256.0.0.1')).toBe(false)
    expect(isValidHost('192.168.1.300')).toBe(false)
  })

  it('rejects empty and non-string values', () => {
    expect(isValidHost('')).toBe(false)
    expect(isValidHost(null)).toBe(false)
    expect(isValidHost(undefined)).toBe(false)
    expect(isValidHost(123)).toBe(false)
  })

  it('rejects hostnames that are too long (> 253 chars)', () => {
    expect(isValidHost('a'.repeat(254))).toBe(false)
    expect(isValidHost('a'.repeat(253))).toBe(true)
  })

  it('rejects hostnames with invalid characters', () => {
    expect(isValidHost('host with spaces')).toBe(false)
    expect(isValidHost('host;rm -rf /')).toBe(false)
    expect(isValidHost('$(evil)')).toBe(false)
    expect(isValidHost('`evil`')).toBe(false)
  })
})

// ── isValidTerminalDimension ─────────────────────────────────────────────────

describe('isValidTerminalDimension', () => {
  it('accepts valid dimensions (1-500)', () => {
    expect(isValidTerminalDimension(1)).toBe(true)
    expect(isValidTerminalDimension(80)).toBe(true)
    expect(isValidTerminalDimension(500)).toBe(true)
    expect(isValidTerminalDimension(24)).toBe(true)
  })

  it('rejects zero', () => {
    expect(isValidTerminalDimension(0)).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidTerminalDimension(-1)).toBe(false)
    expect(isValidTerminalDimension(-100)).toBe(false)
  })

  it('rejects values above 500', () => {
    expect(isValidTerminalDimension(501)).toBe(false)
    expect(isValidTerminalDimension(1000)).toBe(false)
  })

  it('rejects non-integer numbers', () => {
    expect(isValidTerminalDimension(10.5)).toBe(false)
    expect(isValidTerminalDimension(79.9)).toBe(false)
  })

  it('rejects non-number types', () => {
    expect(isValidTerminalDimension('80')).toBe(false)
    expect(isValidTerminalDimension(null)).toBe(false)
    expect(isValidTerminalDimension(undefined)).toBe(false)
  })
})

// ── isValidSettingsPath ──────────────────────────────────────────────────────

describe('isValidSettingsPath', () => {
  // The electron mock in setup.ts returns '/tmp/test-userData' for ALL getPath calls,
  // including 'home'. We adjust expectations accordingly.

  it('accepts a path inside the home directory', () => {
    // The electron mock in setup.ts returns '/tmp/test-userData' for getPath('home').
    // On Windows, path.resolve turns that into e.g. 'C:\tmp\test-userData'.
    const home = path.resolve('/tmp/test-userData')
    expect(isValidSettingsPath(path.join(home, 'some', 'file.json'))).toBe(true)
    expect(isValidSettingsPath(path.join(home, '.config', 'settings'))).toBe(true)
  })

  it('rejects a path outside the home directory', () => {
    expect(isValidSettingsPath('C:\\Windows\\System32\\config.sys')).toBe(false)
    expect(isValidSettingsPath(path.resolve('/other/directory/file.json'))).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSettingsPath('')).toBe(false)
  })

  it('rejects paths that are too long (> 500 chars)', () => {
    const longPath = '/tmp/test-userData/' + 'a'.repeat(500)
    expect(isValidSettingsPath(longPath)).toBe(false)
  })

  it('rejects non-string types', () => {
    expect(isValidSettingsPath(null)).toBe(false)
    expect(isValidSettingsPath(undefined)).toBe(false)
    expect(isValidSettingsPath(42)).toBe(false)
  })
})

// ── sanitizeSshError ─────────────────────────────────────────────────────────

describe('sanitizeSshError', () => {
  beforeAll(() => { setLocale('es') })

  it('maps authentication errors', () => {
    expect(sanitizeSshError('Authentication failed for user root')).toBe(
      'Error de autenticación. Verifica usuario y credenciales.',
    )
    expect(sanitizeSshError('Permission denied (publickey)')).toBe(
      'Error de autenticación. Verifica usuario y credenciales.',
    )
    expect(sanitizeSshError('Login incorrect')).toBe(
      'Error de autenticación. Verifica usuario y credenciales.',
    )
  })

  it('maps timeout errors', () => {
    expect(sanitizeSshError('Connection timeout after 30s')).toBe(
      'Tiempo de conexión agotado. Verifica host y puerto.',
    )
    expect(sanitizeSshError('connect TIMED OUT')).toBe(
      'Tiempo de conexión agotado. Verifica host y puerto.',
    )
  })

  it('maps connection refused errors', () => {
    expect(sanitizeSshError('connect ECONNREFUSED 192.168.1.1:22')).toBe(
      'Conexión rechazada. Verifica que el servidor SSH esté activo.',
    )
    expect(sanitizeSshError('Connection refused')).toBe(
      'Conexión rechazada. Verifica que el servidor SSH esté activo.',
    )
  })

  it('maps host-not-found errors', () => {
    expect(sanitizeSshError('getaddrinfo ENOTFOUND bad.host')).toBe(
      'Host no encontrado. Verifica el nombre o dirección IP.',
    )
    expect(sanitizeSshError('ENOTFOUND')).toBe(
      'Host no encontrado. Verifica el nombre o dirección IP.',
    )
  })

  it('maps network unreachable errors', () => {
    expect(sanitizeSshError('connect ENETUNREACH 10.0.0.1:22')).toBe(
      'Red inalcanzable. Verifica tu conexión de red.',
    )
    expect(sanitizeSshError('Network is unreachable')).toBe(
      'Red inalcanzable. Verifica tu conexión de red.',
    )
  })

  it('returns a generic message for unrecognized errors', () => {
    expect(sanitizeSshError('some unknown error')).toBe(
      'Error de conexión SSH. Consulta el log para más detalles.',
    )
    expect(sanitizeSshError('unexpected EOF')).toBe(
      'Error de conexión SSH. Consulta el log para más detalles.',
    )
  })
})

// ── sanitizeForLog ───────────────────────────────────────────────────────────

describe('sanitizeForLog', () => {
  it('strips control characters', () => {
    expect(sanitizeForLog('hello\x00world\x1bfoo')).toBe('helloworldfoo')
  })

  it('leaves normal text unchanged', () => {
    expect(sanitizeForLog('normal text 123')).toBe('normal text 123')
  })

  it('truncates to default maxLength of 100', () => {
    const long = 'a'.repeat(150)
    expect(sanitizeForLog(long)).toBe('a'.repeat(100))
  })

  it('truncates to custom maxLength', () => {
    expect(sanitizeForLog('abcdefghij', 5)).toBe('abcde')
  })

  it('handles empty string', () => {
    expect(sanitizeForLog('')).toBe('')
  })
})

// ── IpcRateLimiter ───────────────────────────────────────────────────────────

describe('IpcRateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('allows calls within the limit', () => {
    const limiter = new IpcRateLimiter(5, 1000)
    for (let i = 0; i < 5; i++) {
      expect(limiter.check()).toBe(true)
    }
  })

  it('blocks calls that exceed the limit', () => {
    const limiter = new IpcRateLimiter(3, 1000)
    expect(limiter.check()).toBe(true)
    expect(limiter.check()).toBe(true)
    expect(limiter.check()).toBe(true)
    // 4th call should be blocked
    expect(limiter.check()).toBe(false)
  })

  it('allows calls again after the time window expires', () => {
    vi.useFakeTimers()
    const limiter = new IpcRateLimiter(2, 1000)

    expect(limiter.check()).toBe(true)
    expect(limiter.check()).toBe(true)
    expect(limiter.check()).toBe(false)

    // Advance time past the window
    vi.advanceTimersByTime(1001)

    expect(limiter.check()).toBe(true)
    vi.useRealTimers()
  })

  it('only removes expired calls from the window', () => {
    vi.useFakeTimers()
    const limiter = new IpcRateLimiter(2, 1000)

    expect(limiter.check()).toBe(true) // t=0
    vi.advanceTimersByTime(600)
    expect(limiter.check()).toBe(true) // t=600
    expect(limiter.check()).toBe(false) // still 2 in window

    vi.advanceTimersByTime(500) // t=1100 — first call expired, second still active
    expect(limiter.check()).toBe(true) // now only 1 old call + this new one = 2
    expect(limiter.check()).toBe(false) // 2 active calls in window

    vi.useRealTimers()
  })
})
