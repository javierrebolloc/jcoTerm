import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../shared/ipc-channels'
import type { NamedCredential, SaveNamedCredentialPayload, IpcResult } from '../../shared/types'
import type { NamedCredentialStore } from '../storage/NamedCredentialStore'
import type { CredentialStore } from '../storage/CredentialStore'
import { isValidSessionId } from '../security'
import { t } from '../../shared/i18n'

export function registerCredentialHandlers(
  namedCredentialStore: NamedCredentialStore,
  credentialStore: CredentialStore,
): void {
  ipcMain.handle(IPC.CREDENTIALS.LIST, (): IpcResult<NamedCredential[]> => {
    try {
      return { success: true, data: namedCredentialStore.list() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CREDENTIALS.SAVE, (_event, payload: SaveNamedCredentialPayload): IpcResult => {
    try {
      if (!payload.credential.id) {
        payload.credential.id = uuidv4()
      } else if (!isValidSessionId(payload.credential.id)) {
        return { success: false, error: t('errors.invalidCredentialId') }
      }
      namedCredentialStore.save(payload.credential)
      // Only update the encrypted password if one was provided
      if (payload.password) credentialStore.savePassword(payload.credential.id, payload.password)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CREDENTIALS.DELETE, (_event, id: unknown): IpcResult => {
    if (!isValidSessionId(id)) return { success: false, error: t('errors.invalidId') }
    try {
      namedCredentialStore.delete(id)
      credentialStore.deleteCredential(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
