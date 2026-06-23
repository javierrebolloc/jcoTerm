import { app, session } from 'electron'
import path from 'path'
import { t } from '../shared/i18n'
import { isPortable } from './portable'

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    const n = parseInt(p, 10)
    return String(n) === p && n >= 0 && n <= 255
  })
}

const LOOKS_LIKE_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

export function isValidHost(host: unknown): host is string {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) return false
  if (LOOKS_LIKE_IPV4.test(host)) return isValidIPv4(host)
  return HOSTNAME_RE.test(host)
}

export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
}

export function isValidTerminalDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 500
}

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && UUID_V4_RE.test(id)
}

export function isValidUsername(username: unknown): username is string {
  return typeof username === 'string' && username.length > 0 && username.length <= 64
}

export function isValidSettingsPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 500) return false
  const resolved = path.resolve(filePath)
  if (isPortable) {
    const dataDir = path.resolve(app.getPath('userData'))
    return resolved.startsWith(dataDir)
  }
  const userHome = path.resolve(app.getPath('home'))
  return resolved.startsWith(userHome)
}

export function sanitizeSshError(message: string): string {
  if (/authentication/i.test(message) || /permission denied/i.test(message) || /login/i.test(message)) {
    return t('errors.ssh.authFailed')
  }
  if (/timeout/i.test(message) || /timed out/i.test(message)) {
    return t('errors.ssh.timeout')
  }
  if (/econnrefused/i.test(message) || /connection refused/i.test(message)) {
    return t('errors.ssh.refused')
  }
  if (/enotfound/i.test(message) || /getaddrinfo/i.test(message)) {
    return t('errors.ssh.hostNotFound')
  }
  if (/enetunreach/i.test(message) || /network/i.test(message)) {
    return t('errors.ssh.networkUnreachable')
  }
  if (/agent/i.test(message)) {
    return t('errors.ssh.agentError')
  }
  return t('errors.ssh.genericError', { detail: message })
}

export function sanitizeForLog(value: string, maxLength = 100): string {
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, maxLength)
}

export function configureCsp(): void {
  const csp = app.isPackaged
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self'"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

export class IpcRateLimiter {
  private readonly calls: number[] = []
  constructor(
    private readonly maxCalls: number,
    private readonly windowMs: number,
  ) {}

  check(): boolean {
    const now = Date.now()
    while (this.calls.length > 0 && this.calls[0] < now - this.windowMs) this.calls.shift()
    if (this.calls.length >= this.maxCalls) return false
    this.calls.push(now)
    return true
  }
}
