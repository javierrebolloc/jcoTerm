import { useState, useEffect, useCallback } from 'react'
import type { AppSettings, KnownHostEntry, CursorStyle } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './SettingsModal.module.css'

interface SettingsModalProps {
  onClose: () => void
}

type SettingsSection = 'general' | 'terminal' | 'ai' | 'connections' | 'about'

function getAnthropicModels(t: (k: string) => string) {
  return [
    { id: 'claude-sonnet-4-6', label: `Claude Sonnet 4.6 (${t('settings.ai.recommended')})` },
    { id: 'claude-haiku-4-5-20251001', label: `Claude Haiku 4.5 (${t('settings.ai.fast')})` },
    { id: 'claude-opus-4-8', label: `Claude Opus 4.8 (${t('settings.ai.maximum')})` },
  ]
}

function getGeminiModels(t: (k: string) => string) {
  return [
    { id: 'gemini-2.5-flash-lite', label: `Gemini 2.5 Flash-Lite (${t('settings.ai.recommended')})` },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ]
}

const FONT_FAMILIES = [
  { value: "'Cascadia Code', Consolas, 'Courier New', monospace", label: 'Cascadia Code' },
  { value: "Consolas, 'Courier New', monospace",                  label: 'Consolas' },
  { value: "'JetBrains Mono', monospace",                         label: 'JetBrains Mono' },
  { value: "'Fira Code', monospace",                              label: 'Fira Code' },
  { value: "monospace",                                           label: 'monospace' },
] as const

export default function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('')
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [knownHosts, setKnownHosts] = useState<KnownHostEntry[]>([])
  const [initialLanguage, setInitialLanguage] = useState<string | null>(null)
  const [exportImportMsg, setExportImportMsg] = useState<string | null>(null)

  const { t } = useTranslation()
  const trapRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const languageChanged = settings !== null && initialLanguage !== null && settings.language !== initialLanguage

  const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'general',     label: t('settings.general.title'),      icon: '⚙' },
    { id: 'terminal',    label: t('settings.terminal.title'),     icon: '▸' },
    { id: 'ai',          label: t('settings.ai.title'),           icon: '✦' },
    { id: 'connections', label: t('settings.connections.title'),   icon: '⛓' },
    { id: 'about',       label: t('settings.about.title'),        icon: 'ⓘ' },
  ]

  const CURSOR_STYLES: { value: CursorStyle; label: string }[] = [
    { value: 'block',     label: t('settings.terminal.cursorBlock') },
    { value: 'underline', label: t('settings.terminal.cursorUnderline') },
    { value: 'bar',       label: t('settings.terminal.cursorBar') },
  ]

  const refreshKnownHosts = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.ssh.listKnownHosts()
    if (result.success && result.data) setKnownHosts(result.data)
  }, [])

  useEffect(() => {
    void window.electronAPI.settings.get().then((result) => {
      if (result.success && result.data) {
        setSettings(result.data)
        setInitialLanguage(result.data.language)
      }
    })
    void refreshKnownHosts()
  }, [refreshKnownHosts])

  const handleDeleteHost = async (host: string, port: number): Promise<void> => {
    await window.electronAPI.ssh.deleteKnownHost(host, port)
    await refreshKnownHosts()
  }

  const handleSave = async (): Promise<void> => {
    if (!settings) return
    setSaving(true)

    const { anthropicApiKeySet: _a, geminiApiKeySet: _g, logFilePath: _l, appVersion: _v, ...patch } = settings
    const fullPatch = {
      ...patch,
      ...(anthropicKeyInput.trim() ? { anthropicApiKey: anthropicKeyInput.trim() } : {}),
      ...(geminiKeyInput.trim() ? { geminiApiKey: geminiKeyInput.trim() } : {}),
    }
    await window.electronAPI.settings.set(fullPatch)

    setSaving(false)
    setSaved(true)
    setAnthropicKeyInput('')
    setGeminiKeyInput('')
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) {
    return (
      <div className={styles.overlay} ref={trapRef} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <p className={styles.loading}>{t('settings.loading')}</p>
        </div>
      </div>
    )
  }

  // ── Section renderers ──────────────────────────────────────────────────────

  const renderGeneral = (): JSX.Element => (
    <>
      <h3 className={styles.sectionTitle}>{t('settings.general.title')}</h3>
      <div className={styles.field}>
        <label htmlFor="language">{t('settings.general.language')}</label>
        <select
          id="language"
          className={styles.select}
          value={settings.language}
          onChange={(e) => setSettings((prev) => prev && { ...prev, language: e.target.value as 'en' | 'es' })}
        >
          <option value="en">{t('settings.general.languageEn')}</option>
          <option value="es">{t('settings.general.languageEs')}</option>
        </select>
        {languageChanged && (
          <p className={styles.restartNotice}>
            {t('settings.general.restartNotice')}
          </p>
        )}
      </div>
    </>
  )

  const renderTerminal = (): JSX.Element => (
    <>
      <h3 className={styles.sectionTitle}>{t('settings.terminal.title')}</h3>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="fontSize">{t('settings.terminal.fontSize')}</label>
          <input
            id="fontSize"
            type="number"
            min="8"
            max="32"
            value={settings.fontSize}
            onChange={(e) =>
              setSettings((prev) => prev && { ...prev, fontSize: Number(e.target.value) })
            }
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="scrollback">{t('settings.terminal.scrollback')}</label>
          <input
            id="scrollback"
            type="number"
            min="100"
            max="50000"
            step="100"
            value={settings.scrollback}
            onChange={(e) =>
              setSettings((prev) => prev && { ...prev, scrollback: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="fontFamily">{t('settings.terminal.fontFamily')}</label>
        <select
          id="fontFamily"
          className={styles.select}
          value={settings.fontFamily}
          onChange={(e) =>
            setSettings((prev) => prev && { ...prev, fontFamily: e.target.value })
          }
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="cursorStyle">{t('settings.terminal.cursorStyle')}</label>
          <select
            id="cursorStyle"
            className={styles.select}
            value={settings.cursorStyle}
            onChange={(e) =>
              setSettings((prev) => prev && { ...prev, cursorStyle: e.target.value as CursorStyle })
            }
          >
            {CURSOR_STYLES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ justifyContent: 'flex-end' }}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.cursorBlink}
              onChange={(e) =>
                setSettings((prev) => prev && { ...prev, cursorBlink: e.target.checked })
              }
            />
            {t('settings.terminal.cursorBlink')}
          </label>
        </div>
      </div>
    </>
  )

  const renderAI = (): JSX.Element => (
    <>
      <h3 className={styles.sectionTitle}>{t('settings.ai.title')}</h3>

      <div className={styles.field}>
        <label>{t('settings.ai.provider')}</label>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="aiProvider"
              value="anthropic"
              checked={settings.aiProvider === 'anthropic'}
              onChange={() => setSettings((prev) => prev && { ...prev, aiProvider: 'anthropic' })}
            />
            <span>{t('settings.ai.anthropicClaude')}</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="aiProvider"
              value="gemini"
              checked={settings.aiProvider === 'gemini'}
              onChange={() => setSettings((prev) => prev && { ...prev, aiProvider: 'gemini' })}
            />
            <span>{t('settings.ai.geminiFreeTier')}</span>
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="aiContextLines">{t('settings.ai.contextLines')}</label>
        <input
          id="aiContextLines"
          type="number"
          min="10"
          max="2000"
          step="10"
          value={settings.aiContextLines}
          onChange={(e) =>
            setSettings((prev) => prev && { ...prev, aiContextLines: Number(e.target.value) })
          }
        />
        <p className={styles.note}>
          {t('settings.ai.contextNote')}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="aiHistoryLength">{t('settings.ai.historyLength')}</label>
        <input
          id="aiHistoryLength"
          type="number"
          min="0"
          max="100"
          step="2"
          value={settings.aiHistoryLength}
          onChange={(e) =>
            setSettings((prev) => prev && { ...prev, aiHistoryLength: Number(e.target.value) })
          }
        />
        <p className={styles.note}>
          {t('settings.ai.historyNote')}
        </p>
      </div>

      {/* ── Anthropic subsection ── */}
      <div className={styles.subsection}>
        <span className={styles.subsectionTitle}>Anthropic</span>
        <div className={styles.field}>
          <label htmlFor="anthropicKey">{t('settings.ai.apiKey')}</label>
          <input
            id="anthropicKey"
            type="password"
            value={anthropicKeyInput}
            onChange={(e) => setAnthropicKeyInput(e.target.value)}
            placeholder={settings.anthropicApiKeySet ? `••••••••  (${t('settings.ai.keySaved')})` : 'sk-ant-api03-...'}
            autoComplete="off"
          />
          <p className={styles.note}>
            {settings.anthropicApiKeySet
              ? t('settings.ai.anthropicKeySet')
              : t('settings.ai.anthropicKeyUnset')}
          </p>
        </div>
        <div className={styles.field}>
          <label htmlFor="anthropicModel">{t('settings.ai.model')}</label>
          <select
            id="anthropicModel"
            className={styles.select}
            value={settings.anthropicModel}
            onChange={(e) =>
              setSettings((prev) => prev && { ...prev, anthropicModel: e.target.value })
            }
          >
            {getAnthropicModels(t).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Gemini subsection ── */}
      <div className={styles.subsection}>
        <span className={styles.subsectionTitle}>Google Gemini</span>
        <div className={styles.field}>
          <label htmlFor="geminiKey">{t('settings.ai.geminiKeyLabel')}</label>
          <input
            id="geminiKey"
            type="password"
            value={geminiKeyInput}
            onChange={(e) => setGeminiKeyInput(e.target.value)}
            placeholder={settings.geminiApiKeySet ? `••••••••  (${t('settings.ai.keySaved')})` : 'AIza...'}
            autoComplete="off"
          />
          <p className={styles.note}>
            {settings.geminiApiKeySet
              ? t('settings.ai.geminiKeySet')
              : t('settings.ai.geminiKeyUnset')}
          </p>
        </div>
        <div className={styles.field}>
          <label htmlFor="geminiModel">{t('settings.ai.model')}</label>
          <select
            id="geminiModel"
            className={styles.select}
            value={settings.geminiModel}
            onChange={(e) =>
              setSettings((prev) => prev && { ...prev, geminiModel: e.target.value })
            }
          >
            {getGeminiModels(t).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.privacyNotice}>
          <p className={styles.privacyTitle}>{t('settings.ai.geminiPrivacyTitle')}</p>
          <p className={styles.privacyText}>
            {t('settings.ai.geminiPrivacyFree')}
          </p>
          <p className={styles.privacyText}>
            {t('settings.ai.geminiPrivacyData')}
          </p>
        </div>
      </div>
    </>
  )

  const handleExport = async (): Promise<void> => {
    setExportImportMsg(null)
    const result = await window.electronAPI.app.exportSessions()
    if (result.success && result.data) {
      setExportImportMsg(t('settings.connections.exported', { path: result.data.filePath }))
    }
  }

  const handleImport = async (): Promise<void> => {
    setExportImportMsg(null)
    const result = await window.electronAPI.app.importSessions()
    if (result.success && result.data) {
      setExportImportMsg(t('settings.connections.imported', { count: result.data.imported }))
    } else if (result.error && result.error !== 'Cancelled') {
      setExportImportMsg(t('settings.connections.importError', { error: result.error }))
    }
  }

  const renderConnections = (): JSX.Element => (
    <>
      <h3 className={styles.sectionTitle}>{t('settings.connections.title')}</h3>

      <div className={styles.field}>
        <label>{t('settings.connections.sessionsFile')}</label>
        <p className={styles.filePath}>{settings.sessionsFilePath}</p>
        <p className={styles.note}>
          {t('settings.connections.sessionsNote')}
        </p>
      </div>

      <div className={styles.field}>
        <label>{t('settings.connections.exportNote')}</label>
        <div className={styles.exportImportRow}>
          <button className={styles.openBtn} onClick={() => void handleExport()}>
            {t('settings.connections.export')}
          </button>
          <button className={styles.openBtn} onClick={() => void handleImport()}>
            {t('settings.connections.import')}
          </button>
        </div>
        {exportImportMsg && <p className={styles.note}>{exportImportMsg}</p>}
      </div>

      <div className={styles.field}>
        <label>{t('settings.connections.knownHosts')}</label>
        {knownHosts.length === 0 ? (
          <p className={styles.note}>{t('settings.connections.knownHostsEmpty')}</p>
        ) : (
          <div className={styles.knownHostsList}>
            {knownHosts.map((kh) => (
              <div key={`${kh.host}:${kh.port}`} className={styles.knownHostRow}>
                <div className={styles.knownHostInfo}>
                  <span className={styles.knownHostAddr}>{kh.host}:{kh.port}</span>
                  <span className={styles.knownHostFp}>{kh.fingerprint}</span>
                </div>
                <button
                  className={styles.knownHostDelete}
                  onClick={() => void handleDeleteHost(kh.host, kh.port)}
                  title={t('settings.connections.deleteHost')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  const renderAbout = (): JSX.Element => (
    <>
      <h3 className={styles.sectionTitle}>{t('settings.about.title')}</h3>

      <p className={styles.versionText}>jcoTerm v{settings.appVersion}</p>

      <div className={styles.field}>
        <label>{t('settings.about.createdBy')}</label>
        <p className={styles.note}>Javier Rebollo — j.rebolloc@gmail.com</p>
      </div>

      <div className={styles.field}>
        <label>{t('settings.about.license')}</label>
        <p className={styles.note}>{t('settings.about.licenseNote')}</p>
      </div>

      <div className={styles.field}>
        <label>{t('settings.about.logFile')}</label>
        <p className={styles.filePath}>{settings.logFilePath}</p>
        <p className={styles.note}>
          {t('settings.about.logNote')}
        </p>
        <button
          className={styles.openBtn}
          onClick={() => void window.electronAPI.app.openLog()}
        >
          {t('settings.about.openLog')}
        </button>
      </div>
    </>
  )

  const sectionContent: Record<SettingsSection, () => JSX.Element> = {
    general: renderGeneral,
    terminal: renderTerminal,
    ai: renderAI,
    connections: renderConnections,
    about: renderAbout,
  }

  return (
    <div className={styles.overlay} ref={trapRef} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ── Sidebar ── */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>{t('settings.title')}</h2>
          </div>
          <nav className={styles.sidebarNav}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <span className={styles.navIcon}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Content ── */}
        <div className={styles.contentArea}>
          <div className={styles.contentScroll}>
            {sectionContent[activeSection]()}
          </div>

          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onClose}>{t('common.cancel')}</button>
            <button className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving}>
              {saved ? t('common.saved') : saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
