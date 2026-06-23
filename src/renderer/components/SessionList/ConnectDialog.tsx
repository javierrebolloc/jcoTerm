import { useState, useEffect } from 'react'
import type { SavedSessionWithStatus } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './ConnectDialog.module.css'

interface ConnectDialogProps {
  session: SavedSessionWithStatus
  onConnected: (sshSessionId: string, label: string) => void
  onClose: () => void
}

/** Shown only when a session has no stored credential — user must enter credentials manually. */
export default function ConnectDialog({ session, onConnected, onClose }: ConnectDialogProps): JSX.Element {
  const { t } = useTranslation()
  const trapRef = useFocusTrap<HTMLDivElement>()

  const [username, setUsername] = useState(session.username)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !connecting) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, connecting])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!password) { setError(t('session.connect.passwordRequired')); return }

    setConnecting(true)
    setError(null)

    try {
      const result = await window.electronAPI.ssh.connect({
        host: session.host,
        port: session.port,
        username: username.trim(),
        authMethod: 'password',
        password,
      })

      if (result.success && result.sessionId) {
        onConnected(result.sessionId, session.name)
        onClose()
      } else {
        setError(result.error ?? t('common.connectionError'))
      }
    } catch (err) {
      setError((err as Error).message || t('common.connectionError'))
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className={styles.overlay} ref={trapRef} onClick={connecting ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <p className={styles.sessionName}>{session.name}</p>
            <p className={styles.sessionHost}>{session.host}:{session.port}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} disabled={connecting}>✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
          <label className={styles.label}>
            {t('session.connect.user')}
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>

          <label className={styles.label}>
            {t('session.connect.password')}
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          {connecting && (
            <div className={styles.connectingBar}>
              <span className={styles.spinner} />
              <span>{t('session.connect.connecting')}</span>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={connecting}>{t('common.cancel')}</button>
            <button type="submit" className={styles.connectBtn} disabled={connecting}>
              {connecting ? t('session.connect.connecting') : t('common.connect')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
