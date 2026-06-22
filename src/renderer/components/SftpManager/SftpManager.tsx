import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  SavedSessionWithStatus,
  LocalEntry,
  SftpEntry,
  TransferItem,
  TransferProgress,
} from '../../../shared/types'
import SftpConnectionBar from './SftpConnectionBar'
import SftpFilePane from './SftpFilePane'
import SftpTransferQueue from './SftpTransferQueue'
import SftpChmodDialog from './SftpChmodDialog'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './SftpManager.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const rlog = (level: 'info' | 'warn' | 'error' | 'debug', msg: string, ...args: unknown[]): void =>
  window.electronAPI.log(level, `[SftpManager] ${msg}`, ...args)

function localJoin(base: string, name: string): string {
  return base.endsWith('\\') ? `${base}${name}` : `${base}\\${name}`
}

function remoteJoin(base: string, name: string): string {
  return base === '/' ? `/${name}` : `${base}/${name}`
}

function localParent(p: string): string {
  const sep = p.lastIndexOf('\\')
  if (sep <= 2) return p.slice(0, 3)
  return p.slice(0, sep)
}

function remoteParent(p: string): string {
  if (p === '/') return '/'
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p
  const sep = trimmed.lastIndexOf('/')
  return sep <= 0 ? '/' : trimmed.slice(0, sep)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RemoteTab {
  id: string
  sshSessionId: string
  label: string
  path: string
  entries: SftpEntry[]
  loading: boolean
  error: string | null
  selectedNames: Set<string>
}

interface SftpManagerProps {
  sessions: SavedSessionWithStatus[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpManager({ sessions }: SftpManagerProps): JSX.Element {
  const { t } = useTranslation()
  const [connecting, setConnecting] = useState(false)
  const [credentialPrompt, setCredentialPrompt] = useState<SavedSessionWithStatus | null>(null)
  const [credUsername, setCredUsername] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [credError, setCredError] = useState<string | null>(null)

  // Local pane (shared across all tabs)
  const [localPath, setLocalPath] = useState('')
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set())
  const [localDrives, setLocalDrives] = useState<string[]>([])

  // Remote tabs
  const [remoteTabs, setRemoteTabs] = useState<RemoteTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const tabCounterRef = useRef(0)

  const activeTab = remoteTabs.find((t) => t.id === activeTabId) ?? null

  // Transfers & chmod
  const [transfers, setTransfers] = useState<TransferItem[]>([])
  const [showQueue, setShowQueue] = useState(false)
  const [chmodTarget, setChmodTarget] = useState<{ path: string; mode: number } | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  useEffect(() => {
    if (!errorToast) return
    const timer = setTimeout(() => setErrorToast(null), 8000)
    return () => clearTimeout(timer)
  }, [errorToast])

  // ── Update active tab helper ───────────────────────────────────────────────

  const updateTab = useCallback((tabId: string, fn: (t: RemoteTab) => RemoteTab): void => {
    setRemoteTabs((prev) => prev.map((tab) => (tab.id === tabId ? fn(tab) : tab)))
  }, [])

  // ── Load local directory ───────────────────────────────────────────────────

  const loadLocalDir = useCallback(async (path: string): Promise<void> => {
    setLocalLoading(true)
    setLocalError(null)
    setSelectedLocal(new Set())
    rlog('debug', 'loadLocalDir: %s', path)
    const result = await window.electronAPI.local.listDir(path)
    if (result.success && result.data) {
      setLocalEntries(result.data)
      setLocalPath(path)
    } else {
      setLocalError(result.error ?? t('errors.localReadError'))
      setLocalEntries([])
    }
    setLocalLoading(false)
  }, [])

  // ── Load remote directory ──────────────────────────────────────────────────

  const loadRemoteDir = useCallback(async (tabId: string, sessionId: string, path: string): Promise<void> => {
    updateTab(tabId, (t) => ({ ...t, loading: true, error: null, selectedNames: new Set() }))
    rlog('debug', 'loadRemoteDir: %s', path)
    const result = await window.electronAPI.sftp.listDir(sessionId, path)
    if (result.success && result.data) {
      updateTab(tabId, (t) => ({ ...t, path, entries: result.data!, loading: false }))
    } else {
      updateTab(tabId, (tab) => ({ ...tab, entries: [], loading: false, error: result.error ?? t('common.error') }))
    }
  }, [updateTab])

  // ── On mount: local home + drives ──────────────────────────────────────────

  useEffect(() => {
    void (async (): Promise<void> => {
      const homeResult = await window.electronAPI.local.homePath()
      if (homeResult.success && homeResult.data) void loadLocalDir(homeResult.data)
      const drivesResult = await window.electronAPI.local.drives()
      if (drivesResult.success && drivesResult.data) setLocalDrives(drivesResult.data)
    })()
  }, [loadLocalDir])

  // ── Transfer progress ──────────────────────────────────────────────────────

  useEffect(() => {
    const cleanup = window.electronAPI.sftp.onTransferProgress((progress: TransferProgress & { error?: string }) => {
      setTransfers((prev) =>
        prev.map((tr) => {
          if (tr.id !== progress.transferId) return tr
          if (progress.transferred === -1) {
            if (progress.total === -1) return { ...tr, status: 'error' as const, error: progress.error ?? 'Unknown error' }
            return { ...tr, status: 'completed' as const, transferred: tr.size }
          }
          return { ...tr, transferred: progress.transferred, status: 'active' as const }
        }),
      )
    })
    return cleanup
  }, [])

  // ── Connect / Disconnect ───────────────────────────────────────────────────

  const handleConnect = useCallback(async (session: SavedSessionWithStatus): Promise<void> => {
    setConnecting(true)
    rlog('info', 'Connecting SFTP to %s', session.name)
    const result = await window.electronAPI.ssh.connect({ savedSessionId: session.id })
    if (result.success && result.sessionId) {
      tabCounterRef.current++
      const tabId = `sftp-${tabCounterRef.current}`
      const newTab: RemoteTab = {
        id: tabId,
        sshSessionId: result.sessionId,
        label: session.name,
        path: '/',
        entries: [],
        loading: true,
        error: null,
        selectedNames: new Set(),
      }
      setRemoteTabs((prev) => [...prev, newTab])
      setActiveTabId(tabId)

      const homeResult = await window.electronAPI.sftp.realpath(result.sessionId, '.')
      const homePath = homeResult.success && homeResult.data ? homeResult.data : '/'
      void loadRemoteDir(tabId, result.sessionId, homePath)
    } else if (result.credentialRequired) {
      setCredentialPrompt(session)
      setCredUsername(session.username)
      setCredPassword('')
      setCredError(null)
    } else {
      rlog('error', 'Connection failed: %s', result.error)
    }
    setConnecting(false)
  }, [loadRemoteDir])

  const handleDisconnectTab = useCallback(async (tabId: string): Promise<void> => {
    const tab = remoteTabs.find((t) => t.id === tabId)
    if (!tab) return
    rlog('info', 'Disconnecting SFTP tab %s sessionId=%s', tabId, tab.sshSessionId)
    await window.electronAPI.ssh.disconnect(tab.sshSessionId)
    setRemoteTabs((prev) => prev.filter((t) => t.id !== tabId))
    if (activeTabId === tabId) {
      setActiveTabId((prev) => {
        const remaining = remoteTabs.filter((t) => t.id !== tabId)
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null
      })
    }
  }, [remoteTabs, activeTabId])

  // ── Upload / Download (use active tab) ─────────────────────────────────────

  const uploadFile = useCallback(async (fileName: string): Promise<void> => {
    if (!activeTab) return
    const local = localJoin(localPath, fileName)
    const remote = remoteJoin(activeTab.path, fileName)
    rlog('info', 'Upload: %s -> %s', local, remote)
    const result = await window.electronAPI.sftp.upload(activeTab.sshSessionId, local, remote)
    if (result.success && result.data) {
      const entry = localEntries.find((e) => e.name === fileName)
      setTransfers((prev) => [{
        id: result.data!.transferId, type: 'upload' as const,
        localPath: local, remotePath: remote, fileName,
        size: entry?.size ?? 0, transferred: 0, status: 'active' as const,
        sshSessionId: activeTab.sshSessionId,
      }, ...prev])
      setShowQueue(true)
    }
  }, [activeTab, localPath, localEntries])

  const handleUpload = useCallback(async (): Promise<void> => {
    if (!activeTab || selectedLocal.size === 0) return
    const files = [...selectedLocal].filter((n) => !localEntries.find((e) => e.name === n)?.isDirectory)
    for (const f of files) await uploadFile(f)
  }, [activeTab, selectedLocal, localEntries, uploadFile])

  const downloadFile = useCallback(async (fileName: string): Promise<void> => {
    if (!activeTab) return
    const remote = remoteJoin(activeTab.path, fileName)
    const local = localJoin(localPath, fileName)
    rlog('info', 'Download: %s -> %s', remote, local)
    const result = await window.electronAPI.sftp.download(activeTab.sshSessionId, remote, local)
    if (result.success && result.data) {
      const entry = activeTab.entries.find((e) => e.name === fileName)
      setTransfers((prev) => [{
        id: result.data!.transferId, type: 'download' as const,
        localPath: local, remotePath: remote, fileName,
        size: entry?.size ?? 0, transferred: 0, status: 'active' as const,
        sshSessionId: activeTab.sshSessionId,
      }, ...prev])
      setShowQueue(true)
    }
  }, [activeTab, localPath])

  const handleDownload = useCallback(async (): Promise<void> => {
    if (!activeTab) return
    const files = [...activeTab.selectedNames].filter((n) => !activeTab.entries.find((e) => e.name === n)?.isDirectory)
    for (const f of files) await downloadFile(f)
  }, [activeTab, downloadFile])

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  const handleDropOnRemote = useCallback(async (dragData: string): Promise<void> => {
    if (!activeTab) return
    try { for (const f of JSON.parse(dragData) as string[]) await uploadFile(f) }
    catch { await uploadFile(dragData) }
  }, [activeTab, uploadFile])

  const handleDropOnLocal = useCallback(async (dragData: string): Promise<void> => {
    if (!activeTab) return
    try { for (const f of JSON.parse(dragData) as string[]) await downloadFile(f) }
    catch { await downloadFile(dragData) }
  }, [activeTab, downloadFile])

  // ── Mkdir / Delete / Rename / Chmod ─────────────────────────────────────────

  const handleMkdir = useCallback(async (side: 'local' | 'remote', name: string): Promise<void> => {
    if (side !== 'remote' || !activeTab) return
    const fullPath = remoteJoin(activeTab.path, name)
    const result = await window.electronAPI.sftp.mkdir(activeTab.sshSessionId, fullPath)
    if (result.success) void loadRemoteDir(activeTab.id, activeTab.sshSessionId, activeTab.path)
  }, [activeTab, loadRemoteDir])

  const handleDelete = useCallback(async (side: 'local' | 'remote', name: string): Promise<void> => {
    if (side !== 'remote' || !activeTab) return
    const entry = activeTab.entries.find((e) => e.name === name)
    const fullPath = remoteJoin(activeTab.path, name)
    const result = entry?.isDirectory
      ? await window.electronAPI.sftp.rmdir(activeTab.sshSessionId, fullPath)
      : await window.electronAPI.sftp.unlink(activeTab.sshSessionId, fullPath)
    if (result.success) {
      void loadRemoteDir(activeTab.id, activeTab.sshSessionId, activeTab.path)
      updateTab(activeTab.id, (t) => { const next = new Set(t.selectedNames); next.delete(name); return { ...t, selectedNames: next } })
    }
  }, [activeTab, loadRemoteDir, updateTab])

  const handleRename = useCallback(async (side: 'local' | 'remote', oldName: string, newName: string): Promise<void> => {
    if (side !== 'remote' || !activeTab) return
    const result = await window.electronAPI.sftp.rename(activeTab.sshSessionId, remoteJoin(activeTab.path, oldName), remoteJoin(activeTab.path, newName))
    if (result.success) void loadRemoteDir(activeTab.id, activeTab.sshSessionId, activeTab.path)
  }, [activeTab, loadRemoteDir])

  const handleChmodOpen = useCallback(async (name: string): Promise<void> => {
    if (!activeTab) return
    const result = await window.electronAPI.sftp.stat(activeTab.sshSessionId, remoteJoin(activeTab.path, name))
    if (result.success && result.data) setChmodTarget({ path: remoteJoin(activeTab.path, name), mode: result.data.mode })
  }, [activeTab])

  const handleChmodApply = useCallback(async (mode: number): Promise<void> => {
    if (!activeTab || !chmodTarget) return
    const result = await window.electronAPI.sftp.chmod(activeTab.sshSessionId, chmodTarget.path, mode)
    if (result.success) {
      void loadRemoteDir(activeTab.id, activeTab.sshSessionId, activeTab.path)
    } else {
      setErrorToast(result.error ?? 'chmod failed')
    }
    setChmodTarget(null)
  }, [activeTab, chmodTarget, loadRemoteDir])

  const handleClearTransfers = useCallback((): void => {
    setTransfers((prev) => prev.filter((t) => t.status === 'active' || t.status === 'pending'))
  }, [])

  const handleCredentialConnect = useCallback(async (): Promise<void> => {
    if (!credentialPrompt || !credPassword) return
    setConnecting(true)
    setCredError(null)
    const result = await window.electronAPI.ssh.connect({
      host: credentialPrompt.host,
      port: credentialPrompt.port,
      username: credUsername.trim(),
      authMethod: 'password',
      password: credPassword,
    })
    if (result.success && result.sessionId) {
      tabCounterRef.current++
      const tabId = `sftp-${tabCounterRef.current}`
      const newTab: RemoteTab = {
        id: tabId, sshSessionId: result.sessionId, label: credentialPrompt.name,
        path: '/', entries: [], loading: true, error: null, selectedNames: new Set(),
      }
      setRemoteTabs((prev) => [...prev, newTab])
      setActiveTabId(tabId)
      setCredentialPrompt(null)
      setCredPassword('')

      const homeResult = await window.electronAPI.sftp.realpath(result.sessionId, '.')
      const homePath = homeResult.success && homeResult.data ? homeResult.data : '/'
      void loadRemoteDir(tabId, result.sessionId, homePath)
    } else {
      setCredError(result.error ?? t('common.connectionError'))
    }
    setConnecting(false)
  }, [credentialPrompt, credUsername, credPassword, loadRemoteDir, t])

  const activeCount = transfers.filter((t) => t.status === 'active' || t.status === 'pending').length
  const connectedSessionId = activeTab?.sshSessionId ?? null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Connection bar */}
      <SftpConnectionBar
        sessions={sessions}
        connectedLabel={activeTab?.label ?? null}
        connecting={connecting}
        onConnect={handleConnect}
        onDisconnect={() => activeTab && void handleDisconnectTab(activeTab.id)}
      />

      {/* Remote tabs */}
      {remoteTabs.length > 0 && (
        <div className={styles.tabBar}>
          {remoteTabs.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className={styles.tabLabel}>{tab.label}</span>
              <button
                className={styles.tabClose}
                onClick={(e) => { e.stopPropagation(); void handleDisconnectTab(tab.id) }}
                title={t('sftp.disconnectTab')}
              >x</button>
            </div>
          ))}
        </div>
      )}

      {/* Dual panes */}
      <div className={styles.panes}>
        <div className={styles.pane}>
          <SftpFilePane
            type="local"
            path={localPath}
            entries={localEntries}
            loading={localLoading}
            error={localError}
            selectedNames={selectedLocal}
            drives={localDrives}
            onNavigate={(p) => void loadLocalDir(p)}
            onSelect={setSelectedLocal}
            onRefresh={() => void loadLocalDir(localPath)}
            onUpDir={() => void loadLocalDir(localParent(localPath))}
            onMkdir={() => {}}
            onDelete={() => {}}
            onRename={() => {}}
            onUpload={connectedSessionId ? () => void handleUpload() : undefined}
            onFileDrop={connectedSessionId ? (d) => void handleDropOnLocal(d) : undefined}
          />
        </div>
        <div className={styles.pane}>
          <SftpFilePane
            type="remote"
            path={activeTab?.path ?? '/'}
            entries={activeTab?.entries ?? []}
            loading={activeTab?.loading ?? false}
            error={activeTab ? activeTab.error : t('sftp.pane.notConnected')}
            selectedNames={activeTab?.selectedNames ?? new Set()}
            onNavigate={(p) => activeTab && void loadRemoteDir(activeTab.id, activeTab.sshSessionId, p)}
            onSelect={(names) => activeTab && updateTab(activeTab.id, (t) => ({ ...t, selectedNames: names }))}
            onRefresh={() => activeTab && void loadRemoteDir(activeTab.id, activeTab.sshSessionId, activeTab.path)}
            onUpDir={() => activeTab && void loadRemoteDir(activeTab.id, activeTab.sshSessionId, remoteParent(activeTab.path))}
            onMkdir={(name) => void handleMkdir('remote', name)}
            onDelete={(name) => void handleDelete('remote', name)}
            onRename={(o, n) => void handleRename('remote', o, n)}
            onDownload={connectedSessionId ? () => void handleDownload() : undefined}
            onChmod={(name) => void handleChmodOpen(name)}
            onFileDrop={connectedSessionId ? (d) => void handleDropOnRemote(d) : undefined}
          />
        </div>
      </div>

      {/* Transfer queue */}
      <button className={styles.queueToggle} onClick={() => setShowQueue((v) => !v)}>
        <span className={styles.queueArrow}>{showQueue ? 'v' : '>'}</span>
        {t('sftp.transfers.title')}
        {activeCount > 0 && <span className={styles.queueBadge}>{activeCount}</span>}
      </button>
      {showQueue && <SftpTransferQueue transfers={transfers} onClear={handleClearTransfers} />}

      {chmodTarget && (
        <SftpChmodDialog
          currentMode={chmodTarget.mode}
          onApply={(mode) => void handleChmodApply(mode)}
          onClose={() => setChmodTarget(null)}
        />
      )}

      {credentialPrompt && (
        <div className={styles.credOverlay} onClick={() => setCredentialPrompt(null)}>
          <div className={styles.credDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.credHeader}>
              <div>
                <p className={styles.credName}>{credentialPrompt.name}</p>
                <p className={styles.credHost}>{credentialPrompt.host}:{credentialPrompt.port}</p>
              </div>
              <button className={styles.credClose} onClick={() => setCredentialPrompt(null)}>x</button>
            </div>
            <form
              className={styles.credForm}
              onSubmit={(e) => { e.preventDefault(); void handleCredentialConnect() }}
            >
              <label className={styles.credLabel}>
                {t('session.connect.user')}
                <input
                  className={styles.credInput}
                  type="text"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <label className={styles.credLabel}>
                {t('session.connect.password')}
                <input
                  className={styles.credInput}
                  type="password"
                  value={credPassword}
                  onChange={(e) => { setCredPassword(e.target.value); setCredError(null) }}
                  placeholder="••••••••"
                />
              </label>
              {credError && <p className={styles.credError}>{credError}</p>}
              <div className={styles.credActions}>
                <button type="button" className={styles.credCancelBtn} onClick={() => setCredentialPrompt(null)}>{t('common.cancel')}</button>
                <button type="submit" className={styles.credConnectBtn} disabled={connecting || !credPassword}>
                  {connecting ? t('sftp.connecting') : t('common.connect')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {errorToast && (
        <div className={styles.errorToast}>
          <span>{errorToast}</span>
          <button className={styles.errorToastClose} onClick={() => setErrorToast(null)}>x</button>
        </div>
      )}
    </div>
  )
}
