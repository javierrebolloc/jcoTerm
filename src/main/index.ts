import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import Store from 'electron-store'
import { initLogger, log } from './logger'
import { configureCsp } from './security'
import { registerSshHandlers, cleanupSshHandlers, manager as sshManager } from './ipc/ssh.handlers'
import { registerSessionHandlers } from './ipc/session.handlers'
import { registerSettingsHandlers } from './ipc/settings.handlers'
import { registerCredentialHandlers } from './ipc/credential.handlers'
import { registerFolderHandlers } from './ipc/folder.handlers'
import { registerAiHandlers } from './ipc/ai.handlers'
import { registerSftpHandlers } from './ipc/sftp.handlers'
import { registerLocalHandlers } from './ipc/local.handlers'
import { SessionStore } from './storage/SessionStore'
import { CredentialStore } from './storage/CredentialStore'
import { NamedCredentialStore } from './storage/NamedCredentialStore'
import { FolderStore } from './storage/FolderStore'
import { SettingsStore } from './storage/SettingsStore'
import { KnownHostsStore } from './storage/KnownHostsStore'
import { LockStore } from './storage/LockStore'
import { IPC } from '../shared/ipc-channels'
import { setLocale } from '../shared/i18n'
import type { LogLevel, WindowState, SavedSession, SavedFolder, IpcResult } from '../shared/types'

import { setupPortableMode } from './portable'

setupPortableMode()

// Must run before app.whenReady so renderer IPC logging is registered early
initLogger()


const VALID_LOG_LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error']

function registerLogHandler(): void {
  ipcMain.on(IPC.LOG.SEND, (_event, payload: { level: LogLevel; message: string; args: unknown[] }) => {
    const { level, message, args } = payload
    if (!VALID_LOG_LEVELS.includes(level)) return
    const prefix = '[renderer]'
    if (args && args.length > 0) {
      log[level](prefix, message, ...args)
    } else {
      log[level](prefix, message)
    }
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'jcoTerm',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const tags = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    const tag = tags[level] ?? 'LOG'
    const logFn = level >= 3 ? log.error : level >= 2 ? log.warn : log.debug
    logFn(`[renderer:${tag}] ${message} (${sourceId}:${line})`)
  })

  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    log.error(`[renderer] did-fail-load: ${code} ${desc} url=${url}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`[renderer] process gone: ${details.reason} exitCode=${details.exitCode}`)
  })

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    log.error(`[preload] error in ${preloadPath}: ${error.message}`)
  })

  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    log.info(`[window] Loading renderer URL: ${rendererUrl}`)
    win.loadURL(rendererUrl).catch((err) => {
      log.error(`[window] loadURL failed: ${(err as Error).message}, retrying...`)
      setTimeout(() => void win.loadURL(rendererUrl), 1500)
    })
  } else {
    const filePath = path.join(__dirname, '../renderer/index.html')
    log.info(`[window] Loading file: ${filePath}`)
    void win.loadFile(filePath)
  }

  return win
}

app.whenReady().then(() => {
  log.info('App ready')
  configureCsp()
  registerLogHandler()

  const settingsStore = new SettingsStore()
  const settings = settingsStore.get()
  setLocale(settings.language)
  const sessionsFilePath = settingsStore.getSessionsFilePath()
  log.info('Sessions file:', sessionsFilePath)

  const sessionStore = new SessionStore(sessionsFilePath)
  const credentialStore = new CredentialStore(app.getPath('userData'))
  const sessionsDir = path.dirname(sessionsFilePath)
  const namedCredentialStore = new NamedCredentialStore(sessionsDir)
  const folderStore = new FolderStore(sessionsDir)

  const knownHostsStore = new KnownHostsStore(app.getPath('userData'))
  registerSshHandlers(sessionStore, credentialStore, namedCredentialStore, knownHostsStore)
  registerSessionHandlers(sessionStore, credentialStore, namedCredentialStore)
  registerSettingsHandlers(settingsStore, sessionStore, credentialStore)
  registerCredentialHandlers(namedCredentialStore, credentialStore)
  registerFolderHandlers(folderStore)
  registerAiHandlers(credentialStore, settingsStore)
  registerSftpHandlers(sshManager)
  registerLocalHandlers()

  ipcMain.handle(IPC.APP.OPEN_LOG, (): void => {
    const logPath = path.join(app.getPath('userData'), 'logs', 'main.log')
    void shell.openPath(logPath)
  })

  const windowStateStore = new Store<{ windowState: WindowState | null }>({
    name: 'window-state',
    defaults: { windowState: null },
  })

  ipcMain.on(IPC.APP.SAVE_WINDOW_STATE, (_event, state: WindowState) => {
    windowStateStore.set('windowState', state)
  })

  ipcMain.handle(IPC.APP.GET_WINDOW_STATE, (): WindowState | null => {
    const state = windowStateStore.get('windowState')
    windowStateStore.set('windowState', null)
    return state
  })

  // ── Lock password ──────────────────────────────────────────────────────────
  const lockStore = new LockStore(app.getPath('userData'))

  ipcMain.handle(IPC.APP.HAS_LOCK_PASSWORD, (): boolean => {
    return lockStore.hasPassword()
  })

  ipcMain.handle(IPC.APP.SET_LOCK_PASSWORD, (_event, password: unknown): IpcResult => {
    if (typeof password !== 'string' || password.length < 4) {
      return { success: false, error: 'Invalid password' }
    }
    try {
      credentialStore.clearEncryptionKey()
      const encryptionKey = lockStore.setPassword(password)
      credentialStore.wipeCredentials()
      credentialStore.setEncryptionKey(encryptionKey)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.APP.VERIFY_LOCK_PASSWORD, (_event, password: unknown): IpcResult<{ valid: boolean }> => {
    if (typeof password !== 'string') {
      return { success: false, error: 'Invalid password' }
    }
    try {
      const result = lockStore.verify(password)
      if (result.valid && result.encryptionKey) {
        credentialStore.setEncryptionKey(result.encryptionKey)
      }
      return { success: true, data: { valid: result.valid } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Export / Import sessions ───────────────────────────────────────────────
  ipcMain.handle(IPC.APP.EXPORT_SESSIONS, async (): Promise<IpcResult<{ filePath: string }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, error: 'No active window' }
      const result = await dialog.showSaveDialog(win, {
        title: 'Export sessions',
        defaultPath: 'jcoterm-sessions.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }
      const sessions: SavedSession[] = sessionStore.list().map((s) => {
        const { namedCredentialId: _, ...rest } = s
        return rest
      })
      const folders: SavedFolder[] = folderStore.list()
      const exportData = { version: 1, exportedAt: new Date().toISOString(), sessions, folders }
      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return { success: true, data: { filePath: result.filePath } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.APP.IMPORT_SESSIONS, async (): Promise<IpcResult<{ imported: number }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, error: 'No active window' }
      const result = await dialog.showOpenDialog(win, {
        title: 'Import sessions',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'Cancelled' }
      const filePath = result.filePaths[0]
      const stat = fs.statSync(filePath)
      if (stat.size > 10 * 1024 * 1024) return { success: false, error: 'File too large (max 10MB)' }
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as { version?: number; sessions?: SavedSession[]; folders?: SavedFolder[] }
      if (!data.sessions || !Array.isArray(data.sessions)) {
        return { success: false, error: 'Invalid file format' }
      }
      const { v4: uuidv4 } = await import('uuid')
      const existingIds = new Set(sessionStore.list().map((s) => s.id))
      const folderIdMap = new Map<string, string>()
      if (data.folders && Array.isArray(data.folders)) {
        for (const folder of data.folders) {
          const newId = uuidv4()
          folderIdMap.set(folder.id, newId)
          folderStore.save({
            ...folder,
            id: newId,
            parentId: folder.parentId ? folderIdMap.get(folder.parentId) : undefined,
          })
        }
      }
      let imported = 0
      for (const session of data.sessions) {
        if (!session.host || !session.name) continue
        const newSession: SavedSession = {
          ...session,
          id: existingIds.has(session.id) ? uuidv4() : session.id,
          namedCredentialId: undefined,
          folderId: session.folderId ? folderIdMap.get(session.folderId) : undefined,
          createdAt: session.createdAt || Date.now(),
        }
        sessionStore.save(newSession)
        imported++
      }
      return { success: true, data: { imported } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  log.info('All windows closed, quitting')
  credentialStore.clearEncryptionKey()
  cleanupSshHandlers()
  app.quit()
})
