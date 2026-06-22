import { useState } from 'react'
import type { SavedSessionWithStatus } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './SessionItem.module.css'

interface SessionItemProps {
  session: SavedSessionWithStatus
  connecting?: boolean
  onConnect: (session: SavedSessionWithStatus) => void
  onEdit: (session: SavedSessionWithStatus) => void
  onDelete: (id: string, name: string) => void
}

export default function SessionItem({
  session,
  connecting,
  onConnect,
  onEdit,
  onDelete,
}: SessionItemProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const { t } = useTranslation()

  return (
    <div
      className={`${styles.item} ${dragging ? styles.dragging : ''} ${connecting ? styles.connecting : ''}`}
      draggable={!connecting}
      onDragStart={(e) => {
        e.dataTransfer.setData('session-id', session.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onDoubleClick={() => !connecting && onConnect(session)}
      onContextMenu={(e) => e.stopPropagation()}
      title={connecting ? t('session.connecting') : t('session.tooltip', { user: session.username, host: session.host, port: session.port })}
    >
      <div className={styles.info}>
        <span className={styles.name}>
          {connecting ? (
            <span className={styles.spinner} />
          ) : (session.hasStoredCredential || session.namedCredential) ? (
            <span className={styles.lock}>🔑</span>
          ) : null}
          {session.name}
        </span>
        <span className={styles.host}>
          {connecting ? t('session.connecting') : `${session.username}@${session.host}:${session.port}`}
        </span>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={(e) => { e.stopPropagation(); onConnect(session) }}
          title={t('common.connect')}
          disabled={connecting}
        >
          ▶
        </button>
        <button
          className={styles.actionBtn}
          onClick={(e) => { e.stopPropagation(); onEdit(session) }}
          title={t('common.edit')}
          disabled={connecting}
        >
          ✎
        </button>
        <button
          className={`${styles.actionBtn} ${styles.deleteBtn}`}
          onClick={(e) => { e.stopPropagation(); onDelete(session.id, session.name) }}
          title={t('common.delete')}
          disabled={connecting}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
