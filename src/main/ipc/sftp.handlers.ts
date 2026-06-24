import { app, ipcMain, shell, type WebContents } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { log } from '../logger'
import { IPC } from '../../shared/ipc-channels'
import { isValidSessionId } from '../security'
import type { SftpEntry, SftpStatResult, IpcResult } from '../../shared/types'
import type { SshManager } from '../ssh/SshManager'
import type { SshSession } from '../ssh/SshSession'
import { t } from '../../shared/i18n'

const SFTP_PATH_FORBIDDEN = /\0/

function isValidSftpPath(p: unknown): p is string {
  return typeof p === 'string' && p.length > 0 && p.length <= 4096 && !SFTP_PATH_FORBIDDEN.test(p)
}

function isValidLocalPath(p: unknown): p is string {
  if (!isValidSftpPath(p)) return false
  const resolved = path.resolve(p)
  const home = path.resolve(app.getPath('home'))
  return resolved.startsWith(home)
}

async function withSftpSession<T>(
  sshManager: SshManager,
  sshSessionId: string,
  sftpPath: string | undefined,
  operation: (session: SshSession) => Promise<T>,
): Promise<IpcResult<T>> {
  if (!isValidSessionId(sshSessionId)) return { success: false, error: t('errors.sftp.invalidSessionId') }
  if (sftpPath !== undefined && !isValidSftpPath(sftpPath)) return { success: false, error: t('errors.sftp.invalidPath') }
  const session = sshManager.getSession(sshSessionId)
  if (!session) return { success: false, error: t('errors.sftp.sessionNotActive') }
  try {
    const data = await operation(session)
    return { success: true, data }
  } catch (err) {
    const rawMsg = (err as Error).message
    log.warn('[sftp] error:', rawMsg)
    const pathHint = sftpPath ? ` (ruta: ${sftpPath})` : ''
    let userMsg: string
    if (/no such file/i.test(rawMsg)) {
      userMsg = t('errors.sftp.notFound', { hint: pathHint })
    } else if (/permission denied/i.test(rawMsg)) {
      userMsg = t('errors.sftp.permissionDenied', { hint: pathHint })
    } else if (/eof/i.test(rawMsg)) {
      userMsg = t('errors.sftp.connectionClosed', { hint: pathHint })
    } else {
      userMsg = t('errors.sftp.generic', { hint: pathHint, message: rawMsg })
    }
    return { success: false, error: userMsg }
  }
}

const UNSAFE_WIN_CHARS = /[<>:"|?*\x00-\x1f]/g

function sanitizeFileName(name: string): string {
  return name.replace(UNSAFE_WIN_CHARS, '_') || 'file'
}

const activeEditCleanups = new Set<() => void>()

export function cleanupEditWatchers(): void {
  for (const fn of activeEditCleanups) fn()
  activeEditCleanups.clear()
}

export function registerSftpHandlers(sshManager: SshManager): void {
  ipcMain.handle(
    IPC.SFTP.LIST_DIR,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult<SftpEntry[]>> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, async (session) => {
        const entries = await session.listDir(payload.path)
        log.debug('[sftp] listDir → %d entries', entries.length)
        return entries
      })
    },
  )

  ipcMain.handle(
    IPC.SFTP.REALPATH,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult<string>> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, (session) =>
        session.realpath(payload.path),
      )
    },
  )

  // sftp:stat — get file/directory stats
  ipcMain.handle(
    IPC.SFTP.STAT,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult<SftpStatResult>> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, (session) =>
        session.sftpStat(payload.path),
      )
    },
  )

  // sftp:mkdir — create remote directory
  ipcMain.handle(
    IPC.SFTP.MKDIR,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, async (session) => {
        await session.sftpMkdir(payload.path)
        return undefined
      })
    },
  )

  // sftp:rmdir — remove remote directory
  ipcMain.handle(
    IPC.SFTP.RMDIR,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, async (session) => {
        await session.sftpRmdir(payload.path)
        return undefined
      })
    },
  )

  // sftp:unlink — delete remote file
  ipcMain.handle(
    IPC.SFTP.UNLINK,
    async (_event, payload: { sshSessionId: string; path: string }): Promise<IpcResult> => {
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, async (session) => {
        await session.sftpUnlink(payload.path)
        return undefined
      })
    },
  )

  // sftp:rename — rename/move remote file or directory
  ipcMain.handle(
    IPC.SFTP.RENAME,
    async (
      _event,
      payload: { sshSessionId: string; oldPath: string; newPath: string },
    ): Promise<IpcResult> => {
      if (!isValidSftpPath(payload.oldPath)) return { success: false, error: t('errors.sftp.invalidSourcePath') }
      if (!isValidSftpPath(payload.newPath)) return { success: false, error: t('errors.sftp.invalidDestPath') }
      return withSftpSession(sshManager, payload.sshSessionId, undefined, async (session) => {
        await session.sftpRename(payload.oldPath, payload.newPath)
        return undefined
      })
    },
  )

  // sftp:chmod — change remote file permissions
  ipcMain.handle(
    IPC.SFTP.CHMOD,
    async (
      _event,
      payload: { sshSessionId: string; path: string; mode: number },
    ): Promise<IpcResult> => {
      if (typeof payload.mode !== 'number' || !Number.isInteger(payload.mode) || payload.mode < 0 || payload.mode > 0o7777) {
        return { success: false, error: t('errors.sftp.invalidPermissions') }
      }
      return withSftpSession(sshManager, payload.sshSessionId, payload.path, async (session) => {
        await session.sftpChmod(payload.path, payload.mode)
        return undefined
      })
    },
  )

  // sftp:download — download remote file to local path (stream runs in background)
  ipcMain.handle(
    IPC.SFTP.DOWNLOAD,
    async (
      event,
      payload: { sshSessionId: string; remotePath: string; localPath: string },
    ): Promise<IpcResult<{ transferId: string }>> => {
      if (!isValidSftpPath(payload.remotePath)) return { success: false, error: t('errors.sftp.invalidRemotePath') }
      if (!isValidLocalPath(payload.localPath)) return { success: false, error: t('errors.sftp.invalidLocalPath') }
      if (!isValidSessionId(payload.sshSessionId)) return { success: false, error: t('errors.sftp.invalidSessionId') }
      const session = sshManager.getSession(payload.sshSessionId)
      if (!session) return { success: false, error: t('errors.sftp.sessionNotActive') }

      const transferId = uuidv4()
      const sender: WebContents = event.sender

      void session.sftpDownload(payload.remotePath, payload.localPath, (transferred: number, total: number) => {
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred, total })
      }).then(() => {
        log.info('[sftp] Download completed: %s', payload.remotePath)
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred: -1, total: 0, error: undefined })
      }).catch((err) => {
        log.error('[sftp] Download error: %s', (err as Error).message)
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred: -1, total: -1, error: (err as Error).message })
      })

      return { success: true, data: { transferId } }
    },
  )

  // sftp:upload — upload local file to remote path (stream runs in background)
  ipcMain.handle(
    IPC.SFTP.UPLOAD,
    async (
      event,
      payload: { sshSessionId: string; localPath: string; remotePath: string },
    ): Promise<IpcResult<{ transferId: string }>> => {
      if (!isValidLocalPath(payload.localPath)) return { success: false, error: t('errors.sftp.invalidLocalPath') }
      if (!isValidSftpPath(payload.remotePath)) return { success: false, error: t('errors.sftp.invalidRemotePath') }
      if (!isValidSessionId(payload.sshSessionId)) return { success: false, error: t('errors.sftp.invalidSessionId') }
      const session = sshManager.getSession(payload.sshSessionId)
      if (!session) return { success: false, error: t('errors.sftp.sessionNotActive') }

      const transferId = uuidv4()
      const sender: WebContents = event.sender

      void session.sftpUpload(payload.localPath, payload.remotePath, (transferred: number, total: number) => {
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred, total })
      }).then(() => {
        log.info('[sftp] Upload completed: %s', payload.remotePath)
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred: -1, total: 0, error: undefined })
      }).catch((err) => {
        log.error('[sftp] Upload error: %s', (err as Error).message)
        if (!sender.isDestroyed()) sender.send(IPC.SFTP.TRANSFER_PROGRESS, { transferId, transferred: -1, total: -1, error: (err as Error).message })
      })

      return { success: true, data: { transferId } }
    },
  )

  // sftp:editRemote — download to temp, open in default editor, watch & re-upload on save
  ipcMain.handle(
    IPC.SFTP.EDIT_REMOTE,
    async (
      event,
      payload: { sshSessionId: string; remotePath: string },
    ): Promise<IpcResult> => {
      if (!isValidSftpPath(payload.remotePath)) return { success: false, error: t('errors.sftp.invalidRemotePath') }
      if (!isValidSessionId(payload.sshSessionId)) return { success: false, error: t('errors.sftp.invalidSessionId') }
      const session = sshManager.getSession(payload.sshSessionId)
      if (!session) return { success: false, error: t('errors.sftp.sessionNotActive') }

      const fileName = sanitizeFileName(path.basename(payload.remotePath))
      const tempDir = path.join(app.getPath('temp'), 'jcoterm-edit')
      fs.mkdirSync(tempDir, { recursive: true })
      const localPath = path.join(tempDir, `${uuidv4().slice(0, 8)}_${fileName}`)

      try {
        await session.sftpDownload(payload.remotePath, localPath, () => {})
      } catch (err) {
        const rawMsg = (err as Error).message
        const userMsg = /permission denied/i.test(rawMsg) ? t('errors.sftp.permissionDenied', { hint: '' })
          : /no such file/i.test(rawMsg) ? t('errors.sftp.notFound', { hint: '' })
          : t('errors.sftp.generic', { hint: '', message: rawMsg })
        return { success: false, error: userMsg }
      }

      void shell.openPath(localPath)

      const sender: WebContents = event.sender
      let debounce: ReturnType<typeof setTimeout> | null = null
      let uploading = false
      let pendingReupload = false

      const doUpload = (): void => {
        const currentSession = sshManager.getSession(payload.sshSessionId)
        if (!currentSession) { cleanup(); return }
        if (!fs.existsSync(localPath)) { cleanup(); return }
        uploading = true
        log.info('[sftp] Re-uploading edited file: %s', payload.remotePath)
        currentSession.sftpUpload(localPath, payload.remotePath, () => {}).then(() => {
          log.info('[sftp] Edit re-upload completed: %s', payload.remotePath)
        }).catch((err) => {
          const msg = (err as Error).message
          log.error('[sftp] Edit re-upload failed: %s', msg)
          if (!sender.isDestroyed()) {
            sender.send(IPC.SFTP.EDIT_SAVE_ERROR, { remotePath: payload.remotePath, error: msg })
          }
        }).finally(() => {
          uploading = false
          if (pendingReupload) { pendingReupload = false; doUpload() }
        })
      }

      const watcher = fs.watch(localPath, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          if (!fs.existsSync(localPath)) return
          if (uploading) { pendingReupload = true; return }
          doUpload()
        }, 500)
      })

      let maxTimer: ReturnType<typeof setTimeout> | null = null

      const cleanup = (): void => {
        if (debounce) clearTimeout(debounce)
        if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
        watcher.close()
        activeEditCleanups.delete(cleanup)
        try { fs.unlinkSync(localPath) } catch { /* already deleted */ }
      }

      activeEditCleanups.add(cleanup)
      maxTimer = setTimeout(cleanup, 3_600_000)

      return { success: true }
    },
  )
}
