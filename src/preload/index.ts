import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  SshConnectRequest,
  SshConnectResult,
  SshOutputPayload,
  IpcResult,
  SavedSessionWithStatus,
  SaveSessionPayload,
  NamedCredential,
  SaveNamedCredentialPayload,
  SavedFolder,
  LogLevel,
  AiMessageRequest,
  AiMessageResponse,
  SftpEntry,
  SftpStatResult,
  LocalEntry,
  TransferProgress,
  AppSettings,
  KnownHostEntry,
  WindowState,
  ElectronAPI,
} from '../shared/types'

// No channel exists to route AI output back to SSH input — this is deliberate.
const api: ElectronAPI = {
  log: (level: LogLevel, message: string, ...args: unknown[]): void =>
    ipcRenderer.send(IPC.LOG.SEND, { level, message, args }),

  ssh: {
    connect: (params: SshConnectRequest): Promise<SshConnectResult> =>
      ipcRenderer.invoke(IPC.SSH.CONNECT, params),

    disconnect: (sessionId: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SSH.DISCONNECT, sessionId),

    sendInput: (sessionId: string, data: string): void =>
      ipcRenderer.send(IPC.SSH.INPUT, { sessionId, data }),

    resize: (sessionId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.SSH.RESIZE, { sessionId, cols, rows }),

    acceptHostKey: (host: string, port: number, fingerprint: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SSH.ACCEPT_HOST_KEY, { host, port, fingerprint }),

    listKnownHosts: (): Promise<IpcResult<KnownHostEntry[]>> =>
      ipcRenderer.invoke(IPC.SSH.LIST_KNOWN_HOSTS),

    deleteKnownHost: (host: string, port: number): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SSH.DELETE_KNOWN_HOST, { host, port }),

    onOutput: (cb: (sessionId: string, data: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, payload: SshOutputPayload): void =>
        cb(payload.sessionId, payload.data)
      ipcRenderer.on(IPC.SSH.OUTPUT, handler)
      return () => ipcRenderer.removeListener(IPC.SSH.OUTPUT, handler)
    },

    onClose: (cb: (sessionId: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, sessionId: string): void => cb(sessionId)
      ipcRenderer.on(IPC.SSH.CLOSE, handler)
      return () => ipcRenderer.removeListener(IPC.SSH.CLOSE, handler)
    },
  },

  sessions: {
    list: (): Promise<IpcResult<SavedSessionWithStatus[]>> =>
      ipcRenderer.invoke(IPC.SESSIONS.LIST),

    save: (payload: SaveSessionPayload): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SESSIONS.SAVE, payload),

    delete: (id: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SESSIONS.DELETE, id),

    getFilePath: (): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.SESSIONS.GET_FILE_PATH),
  },

  folders: {
    list: (): Promise<IpcResult<SavedFolder[]>> =>
      ipcRenderer.invoke(IPC.FOLDERS.LIST),

    save: (folder: SavedFolder): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.FOLDERS.SAVE, folder),

    delete: (id: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.FOLDERS.DELETE, id),
  },

  credentials: {
    list: (): Promise<IpcResult<NamedCredential[]>> =>
      ipcRenderer.invoke(IPC.CREDENTIALS.LIST),

    save: (payload: SaveNamedCredentialPayload): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.CREDENTIALS.SAVE, payload),

    delete: (id: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.CREDENTIALS.DELETE, id),
  },

  ai: {
    sendMessage: (req: AiMessageRequest): Promise<IpcResult<AiMessageResponse>> =>
      ipcRenderer.invoke(IPC.AI.SEND_MESSAGE, req),

    onStreamChunk: (cb: (text: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, text: string): void => cb(text)
      ipcRenderer.on(IPC.AI.STREAM_CHUNK, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_CHUNK, handler)
    },

    onStreamEnd: (cb: (data: { quotaInfo?: import('../shared/types').QuotaInfo }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: { quotaInfo?: import('../shared/types').QuotaInfo }): void => cb(data)
      ipcRenderer.on(IPC.AI.STREAM_END, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_END, handler)
    },

    onStreamError: (cb: (error: string) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, error: string): void => cb(error)
      ipcRenderer.on(IPC.AI.STREAM_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.AI.STREAM_ERROR, handler)
    },
  },

  app: {
    openLog: (): Promise<void> => ipcRenderer.invoke(IPC.APP.OPEN_LOG),
    saveWindowState: (state: WindowState): void =>
      ipcRenderer.send(IPC.APP.SAVE_WINDOW_STATE, state),
    getWindowState: (): Promise<WindowState | null> =>
      ipcRenderer.invoke(IPC.APP.GET_WINDOW_STATE),
    hasLockPassword: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.APP.HAS_LOCK_PASSWORD),
    setLockPassword: (password: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.APP.SET_LOCK_PASSWORD, password),
    verifyLockPassword: (password: string): Promise<IpcResult<{ valid: boolean }>> =>
      ipcRenderer.invoke(IPC.APP.VERIFY_LOCK_PASSWORD, password),
    exportSessions: (): Promise<IpcResult<{ filePath: string }>> =>
      ipcRenderer.invoke(IPC.APP.EXPORT_SESSIONS),
    importSessions: (): Promise<IpcResult<{ imported: number }>> =>
      ipcRenderer.invoke(IPC.APP.IMPORT_SESSIONS),
    onConfirmClose: (cb: (activeCount: number) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, count: number): void => cb(count)
      ipcRenderer.on(IPC.APP.CONFIRM_CLOSE, handler)
      return () => ipcRenderer.removeListener(IPC.APP.CONFIRM_CLOSE, handler)
    },
    respondConfirmClose: (confirmed: boolean): void =>
      ipcRenderer.send(IPC.APP.CONFIRM_CLOSE_RESPONSE, confirmed),
  },

  sftp: {
    listDir: (sshSessionId: string, path: string): Promise<IpcResult<SftpEntry[]>> =>
      ipcRenderer.invoke(IPC.SFTP.LIST_DIR, { sshSessionId, path }),

    realpath: (sshSessionId: string, path: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.SFTP.REALPATH, { sshSessionId, path }),

    stat: (sshSessionId: string, path: string): Promise<IpcResult<SftpStatResult>> =>
      ipcRenderer.invoke(IPC.SFTP.STAT, { sshSessionId, path }),

    mkdir: (sshSessionId: string, path: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SFTP.MKDIR, { sshSessionId, path }),

    rmdir: (sshSessionId: string, path: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SFTP.RMDIR, { sshSessionId, path }),

    unlink: (sshSessionId: string, path: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SFTP.UNLINK, { sshSessionId, path }),

    rename: (sshSessionId: string, oldPath: string, newPath: string): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SFTP.RENAME, { sshSessionId, oldPath, newPath }),

    chmod: (sshSessionId: string, path: string, mode: number): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SFTP.CHMOD, { sshSessionId, path, mode }),

    download: (sshSessionId: string, remotePath: string, localPath: string): Promise<IpcResult<{ transferId: string }>> =>
      ipcRenderer.invoke(IPC.SFTP.DOWNLOAD, { sshSessionId, remotePath, localPath }),

    upload: (sshSessionId: string, localPath: string, remotePath: string): Promise<IpcResult<{ transferId: string }>> =>
      ipcRenderer.invoke(IPC.SFTP.UPLOAD, { sshSessionId, localPath, remotePath }),

    onTransferProgress: (cb: (progress: TransferProgress) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, progress: TransferProgress): void => cb(progress)
      ipcRenderer.on(IPC.SFTP.TRANSFER_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.SFTP.TRANSFER_PROGRESS, handler)
    },
  },

  local: {
    listDir: (dirPath: string): Promise<IpcResult<LocalEntry[]>> =>
      ipcRenderer.invoke(IPC.LOCAL.LIST_DIR, dirPath),

    homePath: (): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IPC.LOCAL.HOME_PATH),

    drives: (): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke(IPC.LOCAL.DRIVES),
  },

  settings: {
    get: (): Promise<IpcResult<AppSettings>> =>
      ipcRenderer.invoke(IPC.SETTINGS.GET),

    set: (patch: Partial<Omit<AppSettings, 'anthropicApiKeySet' | 'geminiApiKeySet' | 'logFilePath'>>): Promise<IpcResult> =>
      ipcRenderer.invoke(IPC.SETTINGS.SET, patch),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
