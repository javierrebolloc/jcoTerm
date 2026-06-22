import { ipcMain, WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { log } from '../logger'
import { IPC } from '../../shared/ipc-channels'
import type {
  SshConnectRequest,
  SshConnectResult,
  SshInputPayload,
  SshResizePayload,
  IpcResult,
} from '../../shared/types'
import { isValidHost, isValidPort, isValidUsername, isValidSessionId, isValidTerminalDimension, sanitizeSshError, IpcRateLimiter } from '../security'
import { t } from '../../shared/i18n'
import { SshManager } from '../ssh/SshManager'
import type { SshConnectConfig } from '../ssh/SshSession'
import { HostKeyUnknownError, HostKeyMismatchError } from '../ssh/SshSession'
import type { SessionStore } from '../storage/SessionStore'
import type { CredentialStore } from '../storage/CredentialStore'
import type { NamedCredentialStore } from '../storage/NamedCredentialStore'
import type { KnownHostsStore } from '../storage/KnownHostsStore'

export const manager = new SshManager()
const connectLimiter = new IpcRateLimiter(10, 60_000)

function buildDirectConfig(params: SshConnectRequest): SshConnectConfig {
  const host = params.host ?? ''
  const port = params.port ?? 22
  const username = params.username ?? ''
  const authMethod = params.authMethod ?? 'password'

  if (!isValidHost(host)) throw new Error(t('errors.ssh.invalidHost'))
  if (!isValidPort(port)) throw new Error(t('errors.ssh.invalidPort'))
  if (!isValidUsername(username)) throw new Error(t('errors.ssh.invalidUser'))

  if (authMethod === 'password') {
    if (!params.password) throw new Error(t('errors.ssh.passwordRequired'))
    return { host, port, username, authMethod, password: params.password }
  }
  if (authMethod === 'agent') {
    return { host, port, username, authMethod }
  }
  if (!params.privateKey) throw new Error(t('errors.ssh.privateKeyRequired'))
  return { host, port, username, authMethod, privateKey: params.privateKey, passphrase: params.passphrase }
}

export function registerSshHandlers(
  sessionStore?: SessionStore,
  credentialStore?: CredentialStore,
  namedCredentialStore?: NamedCredentialStore,
  knownHostsStore?: KnownHostsStore,
): void {
  ipcMain.handle(
    IPC.SSH.CONNECT,
    async (event, params: SshConnectRequest): Promise<SshConnectResult> => {
      const sender: WebContents = event.sender

      if (!connectLimiter.check()) {
        return { success: false, error: t('errors.ssh.tooManyAttempts') }
      }

      let connectHost = ''
      let connectPort = 22

      try {
        let config: SshConnectConfig

        if (params.savedSessionId) {
          // ── Saved session path ──────────────────────────────────────────────
          log.info('SSH connect request: savedSessionId=%s', params.savedSessionId)
          if (!isValidSessionId(params.savedSessionId)) {
            log.warn('SSH connect rejected: invalid session ID')
            return { success: false, error: t('errors.ssh.invalidSessionId') }
          }
          const saved = sessionStore?.findById(params.savedSessionId)
          if (!saved) {
            log.warn('SSH connect rejected: session not found id=%s', params.savedSessionId)
            return { success: false, error: t('errors.ssh.sessionNotFound') }
          }

          // Agent auth: no credential needed
          if (saved.authMethod === 'agent') {
            config = { host: saved.host, port: saved.port, username: saved.username, authMethod: 'agent' }
          } else if (saved.namedCredentialId) {
            const namedCred = namedCredentialStore?.findById(saved.namedCredentialId)
            const credential = credentialStore?.getCredential(saved.namedCredentialId)
            if (!namedCred || !credential) {
              return { success: false, error: t('errors.ssh.credentialNotFound') }
            }
            if (credential.type !== 'password') {
              return { success: false, error: t('errors.ssh.unsupportedCredType') }
            }
            config = { host: saved.host, port: saved.port, username: namedCred.username, authMethod: 'password', password: credential.password }
          } else {
            const credential = credentialStore?.getCredential(params.savedSessionId)
            if (!credential) {
              return { success: false, credentialRequired: true, error: t('errors.ssh.passwordRequired') }
            }
            if (credential.type === 'password') {
              config = { host: saved.host, port: saved.port, username: saved.username, authMethod: 'password', password: credential.password }
            } else {
              config = { host: saved.host, port: saved.port, username: saved.username, authMethod: 'privateKey', privateKey: credential.privateKey, passphrase: credential.passphrase }
            }
          }
        } else {
          // ── Direct connection path ──────────────────────────────────────────
          config = buildDirectConfig(params)
        }

        const sessionId = uuidv4()
        const session = manager.createSession(sessionId)

        session.on('output', ({ sessionId: id, data }: { sessionId: string; data: string }) => {
          if (!sender.isDestroyed()) sender.send(IPC.SSH.OUTPUT, { sessionId: id, data })
        })

        session.on('close', (id: string) => {
          if (!sender.isDestroyed()) sender.send(IPC.SSH.CLOSE, id)
          manager.removeSession(id)
        })

        connectHost = config.host
        connectPort = config.port

        if (knownHostsStore) {
          config.hostKeyVerifier = (fp: string) => knownHostsStore.verify(connectHost, connectPort, fp)
        }

        log.info('SSH connecting: %s@%s:%d', config.username, connectHost, connectPort)
        await session.connect(config)
        log.info('SSH connected: sessionId=%s host=%s', sessionId, connectHost)
        return { success: true, sessionId }
      } catch (err) {
        if (err instanceof HostKeyUnknownError) {
          log.warn('SSH connect: unknown host key for %s', connectHost)
          return { success: false, hostKeyUnknown: true, fingerprint: err.fingerprint, error: t('errors.ssh.hostKeyUnknown') }
        }
        if (err instanceof HostKeyMismatchError) {
          log.warn('SSH connect: host key MISMATCH for %s', connectHost)
          return { success: false, hostKeyMismatch: true, fingerprint: err.fingerprint, error: t('errors.ssh.hostKeyMismatch') }
        }
        const rawMessage = (err as Error).message
        log.error('SSH connect error:', rawMessage)
        return { success: false, error: sanitizeSshError(rawMessage) }
      }
    },
  )

  ipcMain.handle(IPC.SSH.DISCONNECT, async (_event, sessionId: unknown): Promise<IpcResult> => {
    if (!isValidSessionId(sessionId)) return { success: false, error: t('errors.ssh.invalidSessionId') }
    manager.removeSession(sessionId)
    return { success: true }
  })

  ipcMain.on(IPC.SSH.INPUT, (_event, { sessionId, data }: SshInputPayload) => {
    if (!isValidSessionId(sessionId)) return
    manager.getSession(sessionId)?.write(data)
  })

  ipcMain.handle(
    IPC.SSH.ACCEPT_HOST_KEY,
    (_event, payload: { host: string; port: number; fingerprint: string }): IpcResult => {
      if (!knownHostsStore) return { success: false, error: 'KnownHostsStore no disponible' }
      if (!isValidHost(payload.host) || !isValidPort(payload.port)) {
        return { success: false, error: 'Host o puerto inválido' }
      }
      if (typeof payload.fingerprint !== 'string' || !payload.fingerprint.startsWith('SHA256:')) {
        return { success: false, error: 'Fingerprint inválido' }
      }
      knownHostsStore.add(payload.host, payload.port, payload.fingerprint)
      return { success: true }
    },
  )

  ipcMain.handle(IPC.SSH.LIST_KNOWN_HOSTS, (): IpcResult<import('../../shared/types').KnownHostEntry[]> => {
    if (!knownHostsStore) return { success: false, error: 'KnownHostsStore no disponible' }
    return { success: true, data: knownHostsStore.list() }
  })

  ipcMain.handle(
    IPC.SSH.DELETE_KNOWN_HOST,
    (_event, payload: { host: string; port: number }): IpcResult => {
      if (!knownHostsStore) return { success: false, error: 'KnownHostsStore no disponible' }
      if (!isValidHost(payload.host) || !isValidPort(payload.port)) {
        return { success: false, error: 'Host o puerto inválido' }
      }
      knownHostsStore.delete(payload.host, payload.port)
      return { success: true }
    },
  )

  ipcMain.on(IPC.SSH.RESIZE, (_event, { sessionId, cols, rows }: SshResizePayload) => {
    if (!isValidSessionId(sessionId)) return
    if (!isValidTerminalDimension(cols) || !isValidTerminalDimension(rows)) return
    manager.getSession(sessionId)?.resize(cols, rows)
  })
}

export function cleanupSshHandlers(): void {
  manager.closeAll()
}
