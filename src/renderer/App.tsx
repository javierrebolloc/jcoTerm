import { useReducer, useState, useEffect, useCallback, useRef } from 'react'
import SessionList from './components/SessionList/SessionList'
import Terminal, { type SplitCount } from './components/Terminal/Terminal'
import AiChat from './components/AiChat/AiChat'
import FileExplorer from './components/FileExplorer/FileExplorer'
import SftpManager from './components/SftpManager/SftpManager'
import SaveSessionModal from './components/SessionList/SaveSessionModal'
import ConnectDialog from './components/SessionList/ConnectDialog'
import CredentialsModal from './components/Credentials/CredentialsModal'
import SettingsModal from './components/Settings/SettingsModal'
import SplashScreen from './components/SplashScreen/SplashScreen'
import LockScreen from './components/LockScreen/LockScreen'
import { LanguageProvider } from './hooks/LanguageContext'
import { useTranslation } from './hooks/useTranslation'
import { ConfirmProvider, useConfirm } from './hooks/useConfirm'
import type { SavedSessionWithStatus, AiProviderType, WindowState } from '../shared/types'
import styles from './App.module.css'

// ── Tab state ─────────────────────────────────────────────────────────────────

interface TabSession {
  sshSessionId: string
  label: string
  savedSessionId?: string
}

interface TabState { tabs: TabSession[]; activeTabId: string | null }

type TabAction =
  | { type: 'ADD_TAB'; tab: TabSession }
  | { type: 'REMOVE_TAB'; sshSessionId: string }
  | { type: 'REMOVE_TABS'; sshSessionIds: string[] }
  | { type: 'SET_ACTIVE'; sshSessionId: string }

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'ADD_TAB': {
      const exists = state.tabs.some((t) => t.sshSessionId === action.tab.sshSessionId)
      if (exists) return { ...state, activeTabId: action.tab.sshSessionId }
      return { tabs: [...state.tabs, action.tab], activeTabId: action.tab.sshSessionId }
    }
    case 'REMOVE_TAB': {
      if (!state.tabs.find((t) => t.sshSessionId === action.sshSessionId)) return state
      const newTabs = state.tabs.filter((t) => t.sshSessionId !== action.sshSessionId)
      let newActive = state.activeTabId
      if (state.activeTabId === action.sshSessionId) {
        const idx = state.tabs.findIndex((t) => t.sshSessionId === action.sshSessionId)
        newActive = newTabs[idx]?.sshSessionId ?? newTabs[idx - 1]?.sshSessionId ?? null
      }
      return { tabs: newTabs, activeTabId: newActive }
    }
    case 'REMOVE_TABS': {
      const removing = new Set(action.sshSessionIds)
      const newTabs = state.tabs.filter((t) => !removing.has(t.sshSessionId))
      const newActive = removing.has(state.activeTabId ?? '')
        ? (newTabs[0]?.sshSessionId ?? null)
        : state.activeTabId
      return { tabs: newTabs, activeTabId: newActive }
    }
    case 'SET_ACTIVE':
      return { ...state, activeTabId: action.sshSessionId }
    default:
      return state
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

function AppContent(): JSX.Element {
  const confirm = useConfirm()
  const [tabState, dispatch] = useReducer(tabReducer, { tabs: [], activeTabId: null })
  const [sessions, setSessions] = useState<SavedSessionWithStatus[]>([])
  const [showNewSession, setShowNewSession] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showExplorer, setShowExplorer] = useState(false)
  const [viewMode, setViewMode] = useState<'terminal' | 'sftp'>('terminal')
  const [splitCount, setSplitCount] = useState<SplitCount>(0)
  const [showSplitMenu, setShowSplitMenu] = useState(false)
  const [multiExec, setMultiExec] = useState(false)
  const [multiExecExcluded, setMultiExecExcluded] = useState<Set<string>>(new Set())
  const [editingSession, setEditingSession] = useState<SavedSessionWithStatus | null>(null)
  const [connectingSession, setConnectingSession] = useState<SavedSessionWithStatus | null>(null)
  const [aiProvider, setAiProvider] = useState<AiProviderType>('anthropic')
  const [providerReady, setProviderReady] = useState(false)
  const [aiContextLines, setAiContextLines] = useState(100)
  const [aiHistoryLength, setAiHistoryLength] = useState(20)
  const [scrollback, setScrollback] = useState(5000)
  const [fontSize, setFontSize] = useState(14)
  const [fontFamily, setFontFamily] = useState("'Cascadia Code', Consolas, 'Courier New', monospace")
  const [cursorStyle, setCursorStyle] = useState<'block' | 'underline' | 'bar'>('block')
  const [cursorBlink, setCursorBlink] = useState(true)
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connectingSessionId, setConnectingSessionId] = useState<string | null>(null)

  const terminalContentRef = useRef<(() => string) | null>(null)

  const { t } = useTranslation()

  const confirmRef = useRef(confirm)
  confirmRef.current = confirm
  const tRef = useRef(t)
  tRef.current = t

  const refreshSessions = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.sessions.list()
    if (result.success && result.data) setSessions(result.data)
  }, [])

  const providerAbortRef = useRef<AbortController | null>(null)

  const refreshProviderStatus = useCallback(async (): Promise<void> => {
    providerAbortRef.current?.abort()
    const controller = new AbortController()
    providerAbortRef.current = controller

    const result = await window.electronAPI.settings.get()
    if (controller.signal.aborted) return
    if (result.success && result.data) {
      const d = result.data
      setAiProvider(d.aiProvider)
      setProviderReady(d.aiProvider === 'anthropic' ? d.anthropicApiKeySet : d.geminiApiKeySet)
      setAiContextLines(d.aiContextLines)
      setAiHistoryLength(d.aiHistoryLength)
      setScrollback(d.scrollback)
      setFontSize(d.fontSize)
      setFontFamily(d.fontFamily)
      setCursorStyle(d.cursorStyle)
      setCursorBlink(d.cursorBlink)
      setLanguage(d.language ?? 'en')
    }
  }, [])

  useEffect(() => {
    void refreshSessions()
    void refreshProviderStatus()
  }, [refreshSessions, refreshProviderStatus])

  // ── Save tab state for crash recovery ──────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.app?.saveWindowState) return
    const recoverableTabs = tabState.tabs.filter((t) => t.savedSessionId)
    const state: WindowState = {
      tabs: recoverableTabs.map((t) => ({ savedSessionId: t.savedSessionId!, label: t.label })),
      activeIndex: recoverableTabs.findIndex((t) => t.sshSessionId === tabState.activeTabId),
    }
    window.electronAPI.app.saveWindowState(state)
  }, [tabState])

  useEffect(() => {
    if (!connectionError) return
    const t = setTimeout(() => setConnectionError(null), 8000)
    return () => clearTimeout(t)
  }, [connectionError])

  // ── Connect helpers ─────────────────────────────────────────────────────────

  const handleConnect = useCallback(async (session: SavedSessionWithStatus): Promise<void> => {
    const hasCredential = session.hasStoredCredential || !!session.namedCredential
    if (hasCredential) {
      setConnectingSessionId(session.id)
      try {
        const result = await window.electronAPI.ssh.connect({ savedSessionId: session.id })
        if (result.success && result.sessionId) {
          dispatch({ type: 'ADD_TAB', tab: { sshSessionId: result.sessionId, label: session.name, savedSessionId: session.id } })
        } else if (result.hostKeyUnknown && result.fingerprint) {
          setConnectingSessionId(null)
          const accepted = await confirmRef.current(
            tRef.current('app.hostKeyConfirm', { host: session.host, port: session.port, fingerprint: result.fingerprint }),
          )
          if (accepted) {
            await window.electronAPI.ssh.acceptHostKey(session.host, session.port, result.fingerprint)
            await handleConnect(session)
            return
          }
        } else if (result.hostKeyMismatch && result.fingerprint) {
          setConnectionError(tRef.current('app.hostKeyChanged', { host: session.host, fingerprint: result.fingerprint }))
        } else if (result.credentialRequired) {
          setConnectingSession(session)
        } else {
          setConnectionError(result.error ?? tRef.current('common.connectionError'))
        }
      } finally {
        setConnectingSessionId((prev) => prev === session.id ? null : prev)
      }
    } else {
      setConnectingSession(session)
    }
  }, [])

  const handleConnected = useCallback((sshSessionId: string, label: string) => {
    dispatch({ type: 'ADD_TAB', tab: { sshSessionId, label } })
  }, [])

  // ── Restore tabs on startup (must be after handleConnect) ──────────────────
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!window.electronAPI?.app?.getWindowState) return
    void window.electronAPI.app.getWindowState().then(async (state) => {
      if (!state || state.tabs.length === 0) return
      await refreshSessions()
      const currentSessions = await window.electronAPI.sessions.list()
      if (!currentSessions.success || !currentSessions.data) return
      for (const tab of state.tabs) {
        const session = currentSessions.data.find((s) => s.id === tab.savedSessionId)
        if (session) void handleConnect(session)
      }
    })
  }, [refreshSessions, handleConnect])

  // ── Tab single-tab operations ───────────────────────────────────────────────

  const handleTabClose = useCallback((sshSessionId: string) => {
    void window.electronAPI.ssh.disconnect(sshSessionId)
    dispatch({ type: 'REMOVE_TAB', sshSessionId })
    // Exit split if remaining sessions drop below split count
    setSplitCount((prev) => (prev > 0 && tabState.tabs.length - 1 < prev ? 0 : prev))
  }, [tabState.tabs.length])

  const handleTabSelect = useCallback((sshSessionId: string) => {
    dispatch({ type: 'SET_ACTIVE', sshSessionId })
  }, [])

  const handleTabClone = useCallback(async (sshSessionId: string): Promise<void> => {
    const tab = tabState.tabs.find((t) => t.sshSessionId === sshSessionId)
    if (!tab?.savedSessionId) return
    const session = sessions.find((s) => s.id === tab.savedSessionId)
    if (!session) return
    await handleConnect(session)
  }, [tabState.tabs, sessions, handleConnect])

  // ── Tab bulk operations ─────────────────────────────────────────────────────

  const disconnectAll = useCallback((ids: string[]): void => {
    ids.forEach((id) => void window.electronAPI.ssh.disconnect(id))
  }, [])

  const exitSplitIfNeeded = useCallback((remainingCount: number): void => {
    setSplitCount((prev) => (prev > 0 && remainingCount < prev ? 0 : prev))
  }, [])

  const handleCloseOthers = useCallback((sshSessionId: string): void => {
    const toClose = tabState.tabs.filter((t) => t.sshSessionId !== sshSessionId).map((t) => t.sshSessionId)
    disconnectAll(toClose)
    dispatch({ type: 'REMOVE_TABS', sshSessionIds: toClose })
    dispatch({ type: 'SET_ACTIVE', sshSessionId })
    exitSplitIfNeeded(1)
  }, [tabState.tabs, disconnectAll, exitSplitIfNeeded])

  const handleCloseAll = useCallback((): void => {
    disconnectAll(tabState.tabs.map((t) => t.sshSessionId))
    dispatch({ type: 'REMOVE_TABS', sshSessionIds: tabState.tabs.map((t) => t.sshSessionId) })
    setSplitCount(0)
  }, [tabState.tabs, disconnectAll])

  const handleCloseToRight = useCallback((sshSessionId: string): void => {
    const idx = tabState.tabs.findIndex((t) => t.sshSessionId === sshSessionId)
    const toClose = tabState.tabs.slice(idx + 1).map((t) => t.sshSessionId)
    disconnectAll(toClose)
    dispatch({ type: 'REMOVE_TABS', sshSessionIds: toClose })
    exitSplitIfNeeded(tabState.tabs.length - toClose.length)
  }, [tabState.tabs, disconnectAll, exitSplitIfNeeded])

  const handleCloseToLeft = useCallback((sshSessionId: string): void => {
    const idx = tabState.tabs.findIndex((t) => t.sshSessionId === sshSessionId)
    const toClose = tabState.tabs.slice(0, idx).map((t) => t.sshSessionId)
    disconnectAll(toClose)
    dispatch({ type: 'REMOVE_TABS', sshSessionIds: toClose })
    dispatch({ type: 'SET_ACTIVE', sshSessionId })
    exitSplitIfNeeded(tabState.tabs.length - toClose.length)
  }, [tabState.tabs, disconnectAll, exitSplitIfNeeded])

  // ── Session management ──────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string, name: string): Promise<void> => {
    if (!(await confirmRef.current(tRef.current('session.deleteConfirm', { name }), true))) return
    await window.electronAPI.sessions.delete(id)
    await refreshSessions()
  }, [refreshSessions])

  const handleSettingsClose = useCallback((): void => {
    setShowSettings(false)
    void refreshProviderStatus()
  }, [refreshProviderStatus])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <LanguageProvider initialLocale={language}>
    <div className={styles.layout}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <button className={styles.topBtn} onClick={() => setShowNewSession(true)}>
          {t('app.newSession')}
        </button>
        <button className={styles.topBtn} onClick={() => setShowCredentials(true)}>
          {t('app.credentials')}
        </button>

        {/* ── Split button ── */}
        <div
          className={styles.splitWrapper}
          onMouseEnter={() => setShowSplitMenu(true)}
          onMouseLeave={() => setShowSplitMenu(false)}
        >
          <button className={`${styles.topBtn} ${splitCount > 0 ? styles.topBtnActive : ''}`}>
            {splitCount > 0 ? `Split ${splitCount} ▾` : 'Split ▾'}
          </button>
          {showSplitMenu && (
            <div className={styles.splitMenu}>
              {([2, 4, 8] as const).map((n) => {
                const enough = tabState.tabs.length >= n
                return (
                  <button
                    key={n}
                    className={`${styles.splitOption} ${splitCount === n ? styles.splitOptionActive : ''}`}
                    disabled={!enough}
                    onClick={() => { setSplitCount(splitCount === n ? 0 : n); setShowSplitMenu(false) }}
                  >
                    <span>Split {n}</span>
                    <span className={`${styles.splitHint} ${!enough ? styles.splitHintWarn : ''}`}>
                      {tabState.tabs.length}/{n}
                    </span>
                  </button>
                )
              })}
              {splitCount > 0 && (
                <>
                  <div className={styles.splitSep} />
                  <button
                    className={`${styles.splitOption} ${multiExec ? styles.splitOptionActive : ''}`}
                    onClick={() => { setMultiExec(!multiExec); setMultiExecExcluded(new Set()) }}
                  >
                    {multiExec ? '>> ' : ''}{t('app.multiExec')}
                  </button>
                  <div className={styles.splitSep} />
                  <button
                    className={styles.splitOption}
                    onClick={() => { setSplitCount(0); setMultiExec(false); setShowSplitMenu(false) }}
                  >
                    ✕ {t('app.splitDisable')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <button
          className={`${styles.topBtn} ${viewMode === 'terminal' ? styles.topBtnActive : ''}`}
          onClick={() => setViewMode('terminal')}
        >
          SSH
        </button>
        <button
          className={`${styles.topBtn} ${viewMode === 'sftp' ? styles.topBtnActive : ''}`}
          onClick={() => setViewMode('sftp')}
        >
          SFTP
        </button>

        <div className={styles.topSpacer} />
        <button
          className={`${styles.settingsBtn} ${showExplorer ? styles.settingsBtnActive : ''}`}
          onClick={() => setShowExplorer((v) => !v)}
          title={t('app.explorerTitle')}
        >
          📁
        </button>
        <button className={styles.settingsBtn} onClick={() => setShowSettings(true)} title={t('app.settings')}>
          ⚙
        </button>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <SessionList
            sessions={sessions}
            connectingSessionId={connectingSessionId}
            onConnect={(s) => void handleConnect(s)}
            onEdit={setEditingSession}
            onDelete={(id, name) => void handleDelete(id, name)}
            onRefresh={() => void refreshSessions()}
          />
        </aside>

        <main className={styles.main}>
          <div style={{ display: viewMode === 'terminal' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Terminal
              tabs={tabState.tabs}
              activeTabId={tabState.activeTabId}
              splitCount={splitCount}
              multiExec={multiExec}
              multiExecExcluded={multiExecExcluded}
              onToggleMultiExecExclude={(id) => setMultiExecExcluded((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
              scrollback={scrollback}
              fontSize={fontSize}
              fontFamily={fontFamily}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
              onTabClone={(id) => void handleTabClone(id)}
              onTabCloseOthers={handleCloseOthers}
              onTabCloseAll={handleCloseAll}
              onTabCloseToRight={handleCloseToRight}
              onTabCloseToLeft={handleCloseToLeft}
              contentRef={terminalContentRef}
            />
            <AiChat contentRef={terminalContentRef} provider={aiProvider} providerReady={providerReady} aiContextLines={aiContextLines} aiHistoryLength={aiHistoryLength} />
          </div>
          <div style={{ display: viewMode === 'sftp' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <SftpManager sessions={sessions} />
          </div>
        </main>

        {viewMode === 'terminal' && showExplorer && (
          <aside className={styles.rightPanel}>
            <FileExplorer sshSessionId={tabState.activeTabId} />
          </aside>
        )}
      </div>

      {/* ── Modals ── */}
      {showNewSession && (
        <SaveSessionModal
          onSaved={() => void refreshSessions()}
          onClose={() => setShowNewSession(false)}
        />
      )}
      {editingSession && (
        <SaveSessionModal
          initialSession={editingSession}
          onSaved={() => { void refreshSessions(); setEditingSession(null) }}
          onClose={() => setEditingSession(null)}
        />
      )}
      {connectingSession && (
        <ConnectDialog
          session={connectingSession}
          onConnected={handleConnected}
          onClose={() => setConnectingSession(null)}
        />
      )}
      {showCredentials && <CredentialsModal onClose={() => setShowCredentials(false)} />}
      {showSettings && <SettingsModal onClose={handleSettingsClose} />}

      {connectionError && (
        <div className={styles.errorToast} role="alert">
          <span className={styles.errorToastMsg}>⚠ {connectionError}</span>
          <button
            className={styles.errorToastClose}
            onClick={() => setConnectionError(null)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
    </LanguageProvider>
  )
}

type AppPhase = 'splash' | 'lock' | 'ready'

export default function App(): JSX.Element {
  const [phase, setPhase] = useState<AppPhase>('splash')
  const [initialLocale, setInitialLocale] = useState<'en' | 'es'>('en')

  useEffect(() => {
    if (phase !== 'splash') return
    void window.electronAPI.settings.get().then((result) => {
      if (result.success && result.data?.language) {
        setInitialLocale(result.data.language)
      }
    })
    const timer = setTimeout(() => setPhase('lock'), 5000)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'splash') return <SplashScreen />

  return (
    <LanguageProvider initialLocale={initialLocale}>
      {phase === 'lock' ? (
        <LockScreen onUnlocked={() => setPhase('ready')} />
      ) : (
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      )}
    </LanguageProvider>
  )
}
