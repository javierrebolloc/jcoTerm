import { ipcMain, app, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { log } from '../logger'
import { IPC } from '../../shared/ipc-channels'
import type { LocalEntry, IpcResult } from '../../shared/types'
import { t } from '../../shared/i18n'

const LOCAL_PATH_FORBIDDEN = /\0/
const MAX_PATH_LENGTH = 4096

function isValidLocalPath(p: unknown): p is string {
  return typeof p === 'string' && p.length > 0 && p.length <= MAX_PATH_LENGTH && !LOCAL_PATH_FORBIDDEN.test(p)
}

export function registerLocalHandlers(): void {
  // local:listDir — list local directory with stats
  ipcMain.handle(IPC.LOCAL.LIST_DIR, async (_event, dirPath: unknown): Promise<IpcResult<LocalEntry[]>> => {
    if (!isValidLocalPath(dirPath)) return { success: false, error: t('errors.local.invalidPath') }
    try {
      const resolved = path.resolve(dirPath)
      const entries = await fs.readdir(resolved, { withFileTypes: true })
      const results: LocalEntry[] = []
      for (const entry of entries) {
        try {
          const fullPath = path.join(resolved, entry.name)
          const stat = await fs.stat(fullPath)
          results.push({
            name: entry.name,
            isDirectory: stat.isDirectory(),
            size: stat.size,
            modified: Math.floor(stat.mtimeMs / 1000),
          })
        } catch {
          // Skip entries we can't stat (permission denied, etc.)
        }
      }
      results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return { success: true, data: results }
    } catch (err) {
      const msg = (err as Error).message
      log.warn('[local] listDir error:', msg)
      if (/ENOENT/i.test(msg)) return { success: false, error: t('errors.local.notFound') }
      if (/EACCES|EPERM/i.test(msg)) return { success: false, error: t('errors.local.permissionDenied') }
      return { success: false, error: t('errors.local.readError', { message: msg }) }
    }
  })

  // local:homePath — return user home directory
  ipcMain.handle(IPC.LOCAL.HOME_PATH, (): IpcResult<string> => {
    return { success: true, data: os.homedir() }
  })

  // local:drives — list available drive letters (Windows)
  ipcMain.handle(IPC.LOCAL.DRIVES, async (): Promise<IpcResult<string[]>> => {
    if (process.platform !== 'win32') {
      return { success: true, data: ['/'] }
    }
    const drives: string[] = []
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code) + ':\\'
      try {
        await fs.access(letter)
        drives.push(letter)
      } catch {
        // Drive not available
      }
    }
    return { success: true, data: drives }
  })

  // local:openFile — open a local file with the default system application
  ipcMain.handle(IPC.LOCAL.OPEN_FILE, async (_event, filePath: unknown): Promise<IpcResult> => {
    if (!isValidLocalPath(filePath)) return { success: false, error: t('errors.local.invalidPath') }
    const resolved = path.resolve(filePath)
    const home = path.resolve(app.getPath('home'))
    if (!resolved.startsWith(home)) return { success: false, error: t('errors.local.invalidPath') }
    const errMsg = await shell.openPath(resolved)
    if (errMsg) return { success: false, error: errMsg }
    return { success: true }
  })
}
