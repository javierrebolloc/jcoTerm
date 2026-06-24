export type Locale = 'en' | 'es'

// ── Session types ────────────────────────────────────────────────────────────

export type AuthMethod = 'password' | 'privateKey' | 'agent'

export interface SavedFolder {
  id: string
  name: string
  parentId?: string
}

/** A reusable named credential (username + encrypted password). Non-sensitive fields only. */
export interface NamedCredential {
  id: string
  label: string
  username: string
}

export interface SaveNamedCredentialPayload {
  credential: NamedCredential
  /** Omit to update only label/username without changing the encrypted password. */
  password?: string
}

export interface SavedSession {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  createdAt: number
  /** References a NamedCredential for authentication. Takes priority over per-session credentials. */
  namedCredentialId?: string
  folderId?: string
  sortOrder?: number
}

/** Extends SavedSession with runtime status that only main knows about. */
export interface SavedSessionWithStatus extends SavedSession {
  hasStoredCredential: boolean
  namedCredential?: NamedCredential
}

export interface SaveSessionPayload {
  session: SavedSession
  saveCredential?: boolean
  credentials?: {
    password?: string
    privateKey?: string
    passphrase?: string
  }
}

// Params sent over IPC for a new connection (credentials cleared after use in main)
export interface SshConnectRequest {
  /** If provided, loads session + credentials from store (no credentials in IPC). */
  savedSessionId?: string
  // Direct connection fields — only used when savedSessionId is absent
  host?: string
  port?: number
  username?: string
  authMethod?: AuthMethod
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface SshConnectResult {
  success: boolean
  sessionId?: string
  error?: string
  /** True when savedSessionId was given but no credentials are stored yet. */
  credentialRequired?: boolean
  /** True when the server's host key is unknown and needs user confirmation. */
  hostKeyUnknown?: boolean
  /** True when the server's host key has changed (possible MITM). */
  hostKeyMismatch?: boolean
  /** SHA-256 fingerprint of the server's host key. */
  fingerprint?: string
}

export interface SshInputPayload {
  sessionId: string
  data: string
}

export interface SshResizePayload {
  sessionId: string
  cols: number
  rows: number
}

export interface SshOutputPayload {
  sessionId: string
  data: string
}

// ── Known Hosts types ────────────────────────────────────────────────────────

export interface KnownHostEntry {
  host: string
  port: number
  fingerprint: string
  addedAt: string
}

// ── SFTP types ────────────────────────────────────────────────────────────────

export interface SftpEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: number
  permissions?: string
}

export interface SftpStatResult {
  mode: number
  uid: number
  gid: number
  size: number
  atime: number
  mtime: number
  isDirectory: boolean
  isSymlink: boolean
  permissions: string
}

// ── Local file types ─────────────────────────────────────────────────────────

export interface LocalEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: number
}

// ── Transfer types ───────────────────────────────────────────────────────────

export interface TransferItem {
  id: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  fileName: string
  size: number
  transferred: number
  status: 'pending' | 'active' | 'completed' | 'error'
  error?: string
  sshSessionId: string
}

export interface TransferProgress {
  transferId: string
  transferred: number
  total: number
}

// ── Settings types ────────────────────────────────────────────────────────────

export type AiProviderType = 'anthropic' | 'gemini'

export type CursorStyle = 'block' | 'underline' | 'bar'

export interface AppSettings {
  aiProvider: AiProviderType
  anthropicModel: string
  geminiModel: string
  aiContextLines: number
  aiHistoryLength: number
  anthropicApiKeySet: boolean
  geminiApiKeySet: boolean
  fontSize: number
  fontFamily: string
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  sessionsFilePath: string
  language: Locale
  appVersion: string
  /** Read-only — derived from app.getPath('userData'), never persisted. */
  logFilePath: string
  /** Write-only — never returned from settings:get. Include to update the stored Anthropic API key. */
  anthropicApiKey?: string
  /** Write-only — never returned from settings:get. Include to update the stored Gemini API key. */
  geminiApiKey?: string
}

// ── AI types ─────────────────────────────────────────────────────────────────

export type LimitType = 'daily' | 'rpm' | 'tpm'

export interface QuotaInfo {
  remaining: number | null
  isEstimate: boolean
  resetAt?: string // ISO-8601 UTC
  limitType: LimitType
}

export interface AiMessageRequest {
  userMessage: string
  terminalSnapshot: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export interface AiMessageResponse {
  reply: string
  redactedContext: string
  quotaInfo?: QuotaInfo
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ── Window state (for crash recovery) ────────────────────────────────────────

export interface SavedTabState {
  savedSessionId: string
  label: string
}

export interface WindowState {
  tabs: SavedTabState[]
  activeIndex: number
}

// ── Generic IPC envelope ──────────────────────────────────────────────────────

export interface IpcResult<T = undefined> {
  success: boolean
  data?: T
  error?: string
  /** Quota metadata from Gemini; present on ai:sendMessage responses (success or quota error). */
  quotaInfo?: QuotaInfo
}

// ── ElectronAPI exposed via contextBridge ─────────────────────────────────────

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface ElectronAPI {
  log(level: LogLevel, message: string, ...args: unknown[]): void
  ssh: {
    connect(params: SshConnectRequest): Promise<SshConnectResult>
    disconnect(sessionId: string): Promise<IpcResult>
    sendInput(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    acceptHostKey(host: string, port: number, fingerprint: string): Promise<IpcResult>
    listKnownHosts(): Promise<IpcResult<KnownHostEntry[]>>
    deleteKnownHost(host: string, port: number): Promise<IpcResult>
    onOutput(cb: (sessionId: string, data: string) => void): () => void
    onClose(cb: (sessionId: string) => void): () => void
  }
  sessions: {
    list(): Promise<IpcResult<SavedSessionWithStatus[]>>
    save(payload: SaveSessionPayload): Promise<IpcResult>
    delete(id: string): Promise<IpcResult>
    getFilePath(): Promise<IpcResult<string>>
  }
  credentials: {
    list(): Promise<IpcResult<NamedCredential[]>>
    save(payload: SaveNamedCredentialPayload): Promise<IpcResult>
    delete(id: string): Promise<IpcResult>
  }
  folders: {
    list(): Promise<IpcResult<SavedFolder[]>>
    save(folder: SavedFolder): Promise<IpcResult>
    delete(id: string): Promise<IpcResult>
  }
  ai: {
    sendMessage(req: AiMessageRequest): Promise<IpcResult<AiMessageResponse>>
    onStreamChunk(cb: (text: string) => void): () => void
    onStreamEnd(cb: (data: { quotaInfo?: QuotaInfo }) => void): () => void
    onStreamError(cb: (error: string) => void): () => void
  }
  app: {
    openLog(): Promise<void>
    saveWindowState(state: WindowState): void
    getWindowState(): Promise<WindowState | null>
    hasLockPassword(): Promise<boolean>
    setLockPassword(password: string): Promise<IpcResult>
    verifyLockPassword(password: string): Promise<IpcResult<{ valid: boolean }>>
    exportSessions(): Promise<IpcResult<{ filePath: string }>>
    importSessions(): Promise<IpcResult<{ imported: number }>>
    onConfirmClose(cb: (activeCount: number) => void): () => void
    respondConfirmClose(confirmed: boolean): void
    onMenuOpenSettings(cb: () => void): () => void
    onMenuOpenAbout(cb: () => void): () => void
  }
  sftp: {
    listDir(sshSessionId: string, path: string): Promise<IpcResult<SftpEntry[]>>
    realpath(sshSessionId: string, path: string): Promise<IpcResult<string>>
    stat(sshSessionId: string, path: string): Promise<IpcResult<SftpStatResult>>
    mkdir(sshSessionId: string, path: string): Promise<IpcResult>
    rmdir(sshSessionId: string, path: string): Promise<IpcResult>
    unlink(sshSessionId: string, path: string): Promise<IpcResult>
    rename(sshSessionId: string, oldPath: string, newPath: string): Promise<IpcResult>
    chmod(sshSessionId: string, path: string, mode: number): Promise<IpcResult>
    download(sshSessionId: string, remotePath: string, localPath: string): Promise<IpcResult<{ transferId: string }>>
    upload(sshSessionId: string, localPath: string, remotePath: string): Promise<IpcResult<{ transferId: string }>>
    editRemote(sshSessionId: string, remotePath: string): Promise<IpcResult>
    onEditSaveError(cb: (data: { remotePath: string; error: string }) => void): () => void
    onTransferProgress(cb: (progress: TransferProgress) => void): () => void
  }
  local: {
    listDir(dirPath: string): Promise<IpcResult<LocalEntry[]>>
    homePath(): Promise<IpcResult<string>>
    drives(): Promise<IpcResult<string[]>>
    openFile(filePath: string): Promise<IpcResult>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    set(patch: Partial<Omit<AppSettings, 'anthropicApiKeySet' | 'geminiApiKeySet' | 'logFilePath'>>): Promise<IpcResult>
  }
}
