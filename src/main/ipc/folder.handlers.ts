import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { log } from '../logger'
import { IPC } from '../../shared/ipc-channels'
import type { SavedFolder, IpcResult } from '../../shared/types'
import type { FolderStore } from '../storage/FolderStore'
import { sanitizeForLog } from '../security'
import { t } from '../../shared/i18n'

export function registerFolderHandlers(folderStore: FolderStore): void {
  ipcMain.handle(IPC.FOLDERS.LIST, (): IpcResult<SavedFolder[]> => {
    try {
      const folders = folderStore.list()
      log.debug('folders:list count=%d', folders.length)
      return { success: true, data: folders }
    } catch (err) {
      log.error('folders:list error:', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.FOLDERS.SAVE, (_event, folder: SavedFolder): IpcResult => {
    try {
      if (!folder.id) folder.id = uuidv4()
      log.info('folders:save id=%s name=%s', folder.id, sanitizeForLog(folder.name))
      folderStore.save(folder)
      return { success: true }
    } catch (err) {
      log.error('folders:save error:', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.FOLDERS.DELETE, (_event, id: unknown): IpcResult => {
    if (typeof id !== 'string' || !id) {
      log.warn('folders:delete rejected: invalid id')
      return { success: false, error: t('errors.invalidId') }
    }
    try {
      log.info('folders:delete id=%s', id)
      folderStore.delete(id)
      return { success: true }
    } catch (err) {
      log.error('folders:delete error:', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })
}
