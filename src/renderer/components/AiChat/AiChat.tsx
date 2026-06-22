import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, AiProviderType, QuotaInfo } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './AiChat.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatTab {
  id: string
  title: string
  messages: ChatMessage[]
  loading: boolean
  input: string
}

interface AiChatProps {
  contentRef: React.MutableRefObject<(() => string) | null>
  provider: AiProviderType
  providerReady: boolean
  aiContextLines: number
  aiHistoryLength: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFreshTab(n: number): ChatTab {
  return { id: crypto.randomUUID(), title: `Chat ${n}`, messages: [], loading: false, input: '' }
}

const PROVIDER_LABELS: Record<AiProviderType, string> = {
  anthropic: 'Claude',
  gemini: 'Gemini',
}

function formatResetTime(resetAt: string): string {
  try {
    return new Date(resetAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AiChat({ contentRef, provider, providerReady, aiContextLines, aiHistoryLength }: AiChatProps): JSX.Element {
  const { t } = useTranslation()
  const tabCounterRef = useRef(1)

  const [chatState, setChatState] = useState<{ tabs: ChatTab[]; activeTabId: string }>(() => {
    const first = makeFreshTab(1)
    return { tabs: [first], activeTabId: first.id }
  })
  const { tabs, activeTabId } = chatState
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const [open, setOpen] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Reset quota state when provider changes
  useEffect(() => {
    setQuotaInfo(null)
    setQuotaExhausted(false)
  }, [provider])

  // Auto-reactivate when daily quota resets (only if resetAt is within 24h)
  useEffect(() => {
    if (!quotaExhausted || !quotaInfo?.resetAt || quotaInfo.limitType !== 'daily') return
    const resetMs = new Date(quotaInfo.resetAt).getTime() - Date.now()
    if (resetMs <= 0 || resetMs > 24 * 60 * 60 * 1000) return
    const timer = setTimeout(() => {
      setQuotaExhausted(false)
      setQuotaInfo(null)
    }, resetMs)
    return () => clearTimeout(timer)
  }, [quotaExhausted, quotaInfo])

  // Scroll to bottom when active tab gets new messages
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatState, open])

  // ── Tab management ──────────────────────────────────────────────────────────

  const updateTab = useCallback((tabId: string, fn: (t: ChatTab) => ChatTab): void => {
    setChatState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === tabId ? fn(t) : t)),
    }))
  }, [])

  const addTab = useCallback((): void => {
    tabCounterRef.current++
    const t = makeFreshTab(tabCounterRef.current)
    setChatState((prev) => ({ tabs: [...prev.tabs, t], activeTabId: t.id }))
  }, [])

  const closeTab = useCallback((tabId: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    setChatState((prev) => {
      if (prev.tabs.length === 1) {
        tabCounterRef.current++
        const fresh = makeFreshTab(tabCounterRef.current)
        return { tabs: [fresh], activeTabId: fresh.id }
      }
      const idx = prev.tabs.findIndex((t) => t.id === tabId)
      const newTabs = prev.tabs.filter((t) => t.id !== tabId)
      const newActiveId =
        prev.activeTabId === tabId
          ? (newTabs[idx] ?? newTabs[idx - 1]).id
          : prev.activeTabId
      return { tabs: newTabs, activeTabId: newActiveId }
    })
  }, [])

  const selectTab = useCallback((tabId: string): void => {
    setChatState((prev) => ({ ...prev, activeTabId: tabId }))
  }, [])

  // ── Send flow ───────────────────────────────────────────────────────────────

  const inputDisabled = !providerReady || activeTab?.loading || quotaExhausted

  const streamAssistantIdRef = useRef<string | null>(null)

  // ── Stream listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI?.ai
    if (!api?.onStreamChunk || !api?.onStreamEnd || !api?.onStreamError) return

    const removeChunk = api.onStreamChunk((text) => {
      const msgId = streamAssistantIdRef.current
      if (!msgId) return
      setChatState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => {
          if (t.id !== prev.activeTabId) return t
          return {
            ...t,
            messages: t.messages.map((m) =>
              m.id === msgId ? { ...m, content: m.content + text } : m,
            ),
          }
        }),
      }))
    })

    const removeEnd = api.onStreamEnd((data) => {
      streamAssistantIdRef.current = null
      setChatState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === prev.activeTabId ? { ...t, loading: false } : t,
        ),
      }))
      if (data.quotaInfo) {
        setQuotaInfo(data.quotaInfo)
        const { remaining, limitType } = data.quotaInfo
        if (remaining !== null && remaining <= 0 && limitType === 'daily') {
          setQuotaExhausted(true)
        }
      }
    })

    const removeError = api.onStreamError((error) => {
      const msgId = streamAssistantIdRef.current
      streamAssistantIdRef.current = null
      setChatState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => {
          if (t.id !== prev.activeTabId) return t
          return {
            ...t,
            loading: false,
            messages: msgId
              ? t.messages.map((m) =>
                  m.id === msgId ? { ...m, content: m.content || error } : m,
                )
              : [...t.messages, { id: crypto.randomUUID(), role: 'assistant' as const, content: error, timestamp: Date.now() }],
          }
        }),
      }))
    })

    return () => { removeChunk(); removeEnd(); removeError() }
  }, [])

  const handleSend = useCallback(async (): Promise<void> => {
    if (!activeTab || !activeTab.input.trim() || activeTab.loading || quotaExhausted) return
    const tabId = activeTabId
    const userMessage = activeTab.input.trim()

    const fullSnapshot = contentRef.current?.() ?? ''
    const terminalSnapshot = fullSnapshot
      .split('\n')
      .slice(-aiContextLines)
      .join('\n')

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }

    streamAssistantIdRef.current = assistantId
    updateTab(tabId, (tab) => ({ ...tab, input: '', loading: true, messages: [...tab.messages, userMsg, assistantMsg] }))

    const history = aiHistoryLength > 0
      ? activeTab.messages
          .filter((m) => m.content.trim())
          .map((m) => ({ role: m.role, content: m.content }))
          .slice(-aiHistoryLength)
      : undefined

    const result = await window.electronAPI.ai.sendMessage({ userMessage, terminalSnapshot, history })

    if (!result.success) {
      streamAssistantIdRef.current = null
      updateTab(tabId, (tab) => ({
        ...tab,
        loading: false,
        messages: tab.messages.map((m) =>
          m.id === assistantId ? { ...m, content: result.error ?? t('ai.unknownError') } : m,
        ),
      }))
    }
  }, [activeTab, activeTabId, contentRef, aiContextLines, quotaExhausted, updateTab])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const totalMessages = tabs.reduce((s, t) => s + t.messages.length, 0)

  const providerLabel = PROVIDER_LABELS[provider]

  // ── Quota bar copy ──────────────────────────────────────────────────────────

  function renderQuotaBar(): JSX.Element | null {
    if (provider !== 'gemini') return null
    if (!providerReady) return null

    if (quotaExhausted && quotaInfo?.limitType === 'daily') {
      const resetNote = quotaInfo.resetAt ? t('ai.quotaResetAt', { time: formatResetTime(quotaInfo.resetAt) }) : ''
      return (
        <div className={styles.quotaExhausted}>
          ⚠ {t('ai.quotaExhausted', { resetNote })}
        </div>
      )
    }

    if (quotaInfo !== null && quotaInfo.remaining !== null) {
      return (
        <div className={styles.quotaBar}>
          {t('ai.quotaRemaining', { remaining: quotaInfo.remaining, estimate: quotaInfo.isEstimate ? t('ai.quotaEstimate') : '' })}
        </div>
      )
    }

    return null
  }

  // ── Empty hint copy ─────────────────────────────────────────────────────────

  function emptyHint(): string {
    if (!providerReady) {
      return provider === 'gemini'
        ? t('ai.hintGemini')
        : t('ai.hintAnthropic')
    }
    return t('ai.hintReady', { lines: aiContextLines, provider: providerLabel })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`}>
        {/* Toggle header */}
        <button className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={styles.toggleIcon}>{open ? '▼' : '▲'}</span>
          <span className={styles.toggleLabel}>{t('ai.panelTitle')}</span>
          <span className={`${styles.providerBadge} ${provider === 'gemini' ? styles.providerBadgeGemini : ''}`}>
            {providerLabel}
          </span>
          {!open && totalMessages > 0 && (
            <span className={styles.toggleBadge}>{totalMessages}</span>
          )}
        </button>

        {open && (
          <div className={styles.body}>
            {/* Chat tab bar */}
            <div className={styles.tabBar}>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
                  onClick={() => selectTab(tab.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectTab(tab.id)}
                >
                  {tab.loading && <span className={styles.tabSpinner} />}
                  <span className={styles.tabLabel}>{tab.title}</span>
                  <button
                    className={styles.tabClose}
                    onClick={(e) => closeTab(tab.id, e)}
                    title={t('tabBar.close') + ' ' + tab.title}
                    aria-label={t('tabBar.close') + ' ' + tab.title}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className={styles.addTab} onClick={addTab} title={t('ai.newChat')}>
                +
              </button>
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {activeTab.messages.length === 0 && !activeTab.loading && (
                <p className={styles.emptyHint}>{emptyHint()}</p>
              )}
              {activeTab.messages.map((m) => (
                <div
                  key={m.id}
                  className={`${styles.message} ${m.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
                >
                  <span className={styles.messageRole}>{m.role === 'user' ? t('ai.you') : providerLabel}</span>
                  <pre className={styles.messageContent}>{m.content}</pre>
                </div>
              ))}
              {activeTab.loading && !streamAssistantIdRef.current && (
                <div className={`${styles.message} ${styles.assistantMessage}`}>
                  <span className={styles.messageRole}>{providerLabel}</span>
                  <span className={styles.loadingDots}>···</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quota bar (Gemini only) */}
            {renderQuotaBar()}

            {/* Input area */}
            <div className={styles.inputArea}>
              <textarea
                className={styles.input}
                value={activeTab.input}
                onChange={(e) => updateTab(activeTabId, (tab) => ({ ...tab, input: e.target.value }))}
                onKeyDown={handleKeyDown}
                placeholder={
                  !providerReady
                    ? t('ai.placeholderNoKey')
                    : quotaExhausted
                    ? t('ai.placeholderQuotaReached')
                    : t('ai.placeholderReady')
                }
                disabled={inputDisabled}
                rows={2}
              />
              <button
                className={styles.sendBtn}
                onClick={() => void handleSend()}
                disabled={inputDisabled || !activeTab.input.trim()}
                title={t('ai.send')}
              >
                {t('ai.send')}
              </button>
            </div>
          </div>
        )}
    </div>
  )
}
