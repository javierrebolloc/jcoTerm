import type { TransferItem } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './SftpTransferQueue.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SftpTransferQueueProps {
  transfers: TransferItem[]
  onClear: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const STATUS_KEYS: Record<TransferItem['status'], string> = {
  pending: 'sftp.transfers.pending',
  active: 'sftp.transfers.active',
  completed: 'sftp.transfers.completed',
  error: 'sftp.transfers.error',
}

function getStatusClass(status: TransferItem['status']): string {
  switch (status) {
    case 'pending': return styles.statusPending
    case 'active': return styles.statusActive
    case 'completed': return styles.statusCompleted
    case 'error': return styles.statusError
  }
}

function getProgressClass(status: TransferItem['status']): string {
  switch (status) {
    case 'active': return styles.progressActive
    case 'completed': return styles.progressCompleted
    case 'error': return styles.progressError
    default: return styles.progressActive
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpTransferQueue({ transfers, onClear }: SftpTransferQueueProps): JSX.Element {
  const { t } = useTranslation()
  const percent = (tr: TransferItem): number =>
    tr.size > 0 ? Math.min(100, Math.round((tr.transferred / tr.size) * 100)) : 0

  return (
    <div className={styles.queue}>
      <div className={styles.header}>
        <span className={styles.title}>{t('sftp.transfers.title')}</span>
        {transfers.length > 0 && (
          <button className={styles.clearBtn} onClick={onClear}>
            {t('sftp.transfers.clearCompleted')}
          </button>
        )}
      </div>

      {transfers.length === 0 ? (
        <div className={styles.empty}>{t('sftp.transfers.empty')}</div>
      ) : (
        <div className={styles.list}>
          {transfers.map((tr) => (
            <div key={tr.id} className={styles.item}>
              {/* Type icon */}
              <span className={`${styles.typeIcon} ${tr.type === 'upload' ? styles.typeUpload : styles.typeDownload}`}>
                {tr.type === 'upload' ? 'U' : 'D'}
              </span>

              {/* File name */}
              <span className={styles.fileName} title={tr.type === 'upload' ? tr.localPath : tr.remotePath}>
                {tr.fileName}
              </span>

              {/* Progress bar */}
              <div className={styles.progressWrap}>
                <div
                  className={`${styles.progressBar} ${getProgressClass(tr.status)}`}
                  style={{ width: `${tr.status === 'completed' ? 100 : percent(tr)}%` }}
                />
              </div>

              {/* Status */}
              <span className={`${styles.statusText} ${getStatusClass(tr.status)}`}>
                {tr.status === 'active'
                  ? `${formatSize(tr.transferred)} / ${formatSize(tr.size)}`
                  : tr.status === 'error'
                    ? tr.error ?? t('sftp.transfers.error')
                    : t(STATUS_KEYS[tr.status])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
