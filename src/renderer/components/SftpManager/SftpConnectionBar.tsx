import { useState } from 'react'
import type { SavedSessionWithStatus } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './SftpConnectionBar.module.css'

interface SftpConnectionBarProps {
  sessions: SavedSessionWithStatus[]
  connectedLabel: string | null
  connecting: boolean
  onConnect: (session: SavedSessionWithStatus) => void
  onDisconnect: () => void
}

export default function SftpConnectionBar({
  sessions,
  connectedLabel,
  connecting,
  onConnect,
  onDisconnect,
}: SftpConnectionBarProps): JSX.Element {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState('')

  const handleConnect = (): void => {
    const session = sessions.find((s) => s.id === selectedId)
    if (session) onConnect(session)
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>SFTP</span>

      <select
        className={styles.select}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={connecting}
      >
        <option value="">{t('sftp.selectSession')}</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.username}@{s.host}:{s.port})
          </option>
        ))}
      </select>

      <button
        className={styles.connectBtn}
        onClick={handleConnect}
        disabled={!selectedId || connecting}
      >
        {connecting ? t('sftp.connecting') : t('sftp.connect')}
      </button>

      {connectedLabel && (
        <button
          className={styles.disconnectBtn}
          onClick={onDisconnect}
          disabled={connecting}
        >
          {t('sftp.disconnect', { label: connectedLabel })}
        </button>
      )}

      <div className={styles.status}>
        <span
          className={`${styles.statusDot} ${
            connecting ? styles.statusConnecting : connectedLabel ? styles.statusConnected : styles.statusDisconnected
          }`}
        />
      </div>
    </div>
  )
}
