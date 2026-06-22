import { useEffect } from 'react'
import { useTerminal } from './useTerminal'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './TerminalPane.module.css'

interface TerminalPaneProps {
  sshSessionId: string
  label: string
  isActive: boolean
  scrollback: number
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  multiExecTargets?: string[]
  multiExecExcluded?: boolean
  onToggleMultiExec?: () => void
  onClose: (sshSessionId: string) => void
  onRegisterContent: (sshSessionId: string, fn: () => string) => void
}

export default function TerminalPane({
  sshSessionId,
  label,
  isActive,
  scrollback,
  fontSize,
  fontFamily,
  cursorStyle,
  cursorBlink,
  multiExecTargets,
  multiExecExcluded,
  onToggleMultiExec,
  onClose,
  onRegisterContent,
}: TerminalPaneProps): JSX.Element {
  const { t } = useTranslation()
  const { containerRef, getVisibleContent } = useTerminal({
    sessionId: sshSessionId,
    isActive,
    scrollback,
    fontSize,
    fontFamily,
    cursorStyle,
    cursorBlink,
    multiExecTargets,
    onClose: () => onClose(sshSessionId),
  })

  useEffect(() => {
    onRegisterContent(sshSessionId, getVisibleContent)
  }, [sshSessionId, getVisibleContent, onRegisterContent])

  return (
    <div className={`${styles.pane} ${isActive ? '' : styles.hidden}`}>
      <div className={styles.statusBar}>
        <span className={styles.connected}>● {label}</span>
        {onToggleMultiExec && (
          <button
            className={`${styles.multiExecBtn} ${multiExecExcluded ? styles.multiExecOff : styles.multiExecOn}`}
            onClick={onToggleMultiExec}
            title={multiExecExcluded ? t('app.multiExecInclude') : t('app.multiExecExclude')}
          >
            {multiExecExcluded ? '>>' : '>>'}
          </button>
        )}
        <button
          className={styles.disconnectBtn}
          onClick={() => void window.electronAPI.ssh.disconnect(sshSessionId)}
          title={t('terminal.disconnect')}
        >
          {t('terminal.disconnect')}
        </button>
      </div>
      <div ref={containerRef} className={styles.terminal} />
    </div>
  )
}
