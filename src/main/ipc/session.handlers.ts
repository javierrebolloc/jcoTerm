import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../shared/ipc-channels'
import type { SaveSessionPayload, SavedSessionWithStatus, IpcResult } from '../../shared/types'
import type { SessionStore } from '../storage/SessionStore'
import type { CredentialStore } from '../storage/CredentialStore'
import type { NamedCredentialStore } from '../storage/NamedCredentialStore'
import { t } from '../../shared/i18n'

export function registerSessionHandlers(
  sessionStore: SessionStore,
  credentialStore: CredentialStore,
  namedCredentialStore: NamedCredentialStore,
): void {
  ipcMain.handle(IPC.SESSIONS.LIST, (): IpcResult<SavedSessionWithStatus[]> => {
    try {
      const sessions = sessionStore.list()
      const withStatus: SavedSessionWithStatus[] = sessions.map((s) => ({
        ...s,
        hasStoredCredential: credentialStore.hasCredential(s.id),
        namedCredential: s.namedCredentialId
          ? namedCredentialStore.findById(s.namedCredentialId)
          : undefined,
      }))
      return { success: true, data: withStatus }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.SESSIONS.SAVE, (_event, payload: SaveSessionPayload): IpcResult => {
    try {
      // Generate an id for new sessions
      if (!payload.session.id) payload.session.id = uuidv4()
      if (!payload.session.createdAt) payload.session.createdAt = Date.now()

      sessionStore.save(payload.session)

      if (payload.saveCredential && payload.credentials) {
        const { password, privateKey, passphrase } = payload.credentials
        if (payload.session.authMethod === 'password' && password) {
          credentialStore.savePassword(payload.session.id, password)
        } else if (payload.session.authMethod === 'privateKey' && privateKey) {
          credentialStore.savePrivateKey(payload.session.id, privateKey, passphrase)
        }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.SESSIONS.DELETE, (_event, id: unknown): IpcResult => {
    if (typeof id !== 'string' || !id) return { success: false, error: t('errors.session.invalidSessionId') }
    try {
      sessionStore.delete(id)
      credentialStore.deleteCredential(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.SESSIONS.GET_FILE_PATH, (): IpcResult<string> => {
    return { success: true, data: sessionStore.getFilePath() }
  })
}
