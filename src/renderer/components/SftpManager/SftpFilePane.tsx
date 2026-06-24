import { useState } from 'react'
import type { SftpEntry, LocalEntry } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useConfirm } from '../../hooks/useConfirm'
import SftpBreadcrumb from './SftpBreadcrumb'
import SftpFileTable from './SftpFileTable'
import SftpContextMenu from './SftpContextMenu'
import styles from './SftpFilePane.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SftpFilePaneProps {
  type: 'local' | 'remote'
  path: string
  entries: (SftpEntry | LocalEntry)[]
  loading: boolean
  error: string | null
  selectedNames: Set<string>
  drives?: string[]
  onNavigate: (path: string) => void
  onSelect: (names: Set<string>) => void
  onRefresh: () => void
  onUpDir: () => void
  onMkdir: (name: string) => void
  onDelete: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onUpload?: () => void
  onDownload?: () => void
  onEdit?: (name: string) => void
  onChmod?: (name: string) => void
  onFileDrop?: (fileName: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  name: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpFilePane({
  type,
  path,
  entries,
  loading,
  error,
  selectedNames,
  drives,
  onNavigate,
  onSelect,
  onRefresh,
  onUpDir,
  onMkdir,
  onDelete,
  onRename,
  onUpload,
  onDownload,
  onEdit,
  onChmod,
  onFileDrop,
}: SftpFilePaneProps): JSX.Element {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [showMkdirInput, setShowMkdirInput] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const separator = type === 'local' ? '\\' : '/'
  const isRemote = type === 'remote'
  const acceptDropType = isRemote ? 'sftp-local-file' : 'sftp-remote-file'
  const dragDataType = isRemote ? 'sftp-remote-file' : 'sftp-local-file'

  const handleNavigateEntry = (name: string): void => {
    if (separator === '\\') {
      onNavigate(path.endsWith('\\') ? `${path}${name}` : `${path}\\${name}`)
    } else {
      onNavigate(path === '/' ? `/${name}` : `${path}/${name}`)
    }
  }

  const handleMkdirSubmit = (): void => {
    const trimmed = mkdirName.trim()
    if (trimmed) {
      onMkdir(trimmed)
    }
    setMkdirName('')
    setShowMkdirInput(false)
  }

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedNames.size === 0) return
    const names = [...selectedNames]
    const msg = names.length === 1
      ? t('sftp.deleteConfirm', { label: names[0] })
      : t('sftp.deleteConfirmMulti', { count: names.length })
    if (!(await confirmDialog(msg, true))) return
    for (const name of names) onDelete(name)
  }

  const firstSelected = selectedNames.size > 0 ? [...selectedNames][0] : null

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    const row = (e.target as HTMLElement).closest('tr[data-name]')
    const clickedName = row?.getAttribute('data-name') ?? null
    if (clickedName && !selectedNames.has(clickedName)) {
      onSelect(new Set([clickedName]))
    }
    const effectiveName = clickedName ?? (selectedNames.size > 0 ? [...selectedNames][0] : null)
    setContextMenu({ x: e.clientX, y: e.clientY, name: effectiveName })
  }

  const contextMenuItems = (targetName: string | null): { label: string; onClick: () => void; danger?: boolean }[] => {
    const items: { label: string; onClick: () => void; danger?: boolean }[] = []
    items.push({ label: t('sftp.context.refresh'), onClick: onRefresh })
    items.push({ label: t('sftp.context.newFolder'), onClick: () => setShowMkdirInput(true) })

    if (targetName) {
      if (isRemote && onDownload) {
        items.push({ label: selectedNames.size > 1 ? t('sftp.context.downloadN', { count: selectedNames.size }) : t('sftp.toolbar.download'), onClick: onDownload })
      }
      if (!isRemote && onUpload) {
        items.push({ label: selectedNames.size > 1 ? t('sftp.context.uploadN', { count: selectedNames.size }) : t('sftp.toolbar.upload'), onClick: onUpload })
      }
      if (onEdit && selectedNames.size <= 1) {
        const entry = entries.find((e) => e.name === targetName)
        if (entry && !entry.isDirectory) {
          items.push({ label: t('sftp.context.edit'), onClick: () => onEdit(targetName) })
        }
      }
      if (isRemote && onChmod && selectedNames.size <= 1) {
        items.push({ label: t('sftp.context.permissions'), onClick: () => onChmod(targetName) })
      }
      items.push({ label: selectedNames.size > 1 ? t('sftp.context.deleteN', { count: selectedNames.size }) : t('sftp.toolbar.delete'), onClick: handleDeleteSelected, danger: true })
    }
    return items
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Delete' && selectedNames.size > 0) {
      e.preventDefault()
      void handleDeleteSelected()
    } else if (e.key === 'F2' && selectedNames.size === 1) {
      e.preventDefault()
    } else if (e.key === 'F5') {
      e.preventDefault()
      onRefresh()
    } else if (e.key === 'F7') {
      e.preventDefault()
      setShowMkdirInput(true)
    }
  }

  return (
    <div
      className={`${styles.pane} ${dragOver ? styles.paneDragOver : ''}`}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(acceptDropType)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        const fileName = e.dataTransfer.getData(acceptDropType)
        if (fileName && onFileDrop) {
          e.preventDefault()
          onFileDrop(fileName)
        }
      }}
    >
      {/* Pane header */}
      <div className={styles.paneHeader}>
        <span className={styles.paneLabel}>{isRemote ? t('sftp.pane.remote') : t('sftp.pane.local')}</span>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={onUpDir} title={t('sftp.toolbar.upDir')}>
          [..]
        </button>
        <button className={styles.toolBtn} onClick={onRefresh} title={t('sftp.toolbar.refresh')}>
          {t('sftp.toolbar.refresh')}
        </button>
        <span className={styles.separator} />
        <button
          className={styles.toolBtn}
          onClick={() => setShowMkdirInput(true)}
          title={t('sftp.context.newFolder')}
        >
          {t('sftp.toolbar.newFolder')}
        </button>
        <button
          className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
          onClick={handleDeleteSelected}
          disabled={selectedNames.size === 0}
          title={t('sftp.toolbar.deleteSelected')}
        >
          {t('sftp.toolbar.delete')}
        </button>
        <span className={styles.separator} />
        {isRemote && onDownload && (
          <button
            className={`${styles.toolBtn} ${styles.toolBtnAccent}`}
            onClick={onDownload}
            disabled={selectedNames.size === 0}
            title={t('sftp.toolbar.download')}
          >
            {t('sftp.toolbar.download')}
          </button>
        )}
        {!isRemote && onUpload && (
          <button
            className={`${styles.toolBtn} ${styles.toolBtnAccent}`}
            onClick={onUpload}
            disabled={selectedNames.size === 0}
            title={t('sftp.toolbar.upload')}
          >
            {t('sftp.toolbar.upload')}
          </button>
        )}
        {isRemote && onChmod && (
          <button
            className={styles.toolBtn}
            onClick={() => firstSelected && onChmod(firstSelected)}
            disabled={selectedNames.size === 0}
            title={t('sftp.toolbar.chmod')}
          >
            chmod
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <SftpBreadcrumb
        path={path}
        separator={separator}
        drives={!isRemote ? drives : undefined}
        onNavigate={onNavigate}
      />

      {/* Mkdir inline input */}
      {showMkdirInput && (
        <div className={styles.toolbar} style={{ gap: 'var(--space-sm)' }}>
          <input
            autoFocus
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleMkdirSubmit()
              if (e.key === 'Escape') { setShowMkdirInput(false); setMkdirName('') }
            }}
            placeholder={t('sftp.toolbar.folderPlaceholder')}
            style={{ flex: 1, fontSize: 'var(--font-size-sm)' }}
          />
          <button className={styles.toolBtn} onClick={handleMkdirSubmit}>{t('sftp.toolbar.create')}</button>
          <button className={styles.toolBtn} onClick={() => { setShowMkdirInput(false); setMkdirName('') }}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>{t('sftp.pane.loading')}</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>{t('sftp.pane.emptyDir')}</div>
        ) : (
          <SftpFileTable
            entries={entries}
            selectedNames={selectedNames}
            showPermissions={isRemote}
            dragDataType={dragDataType}
            onSelect={onSelect}
            onNavigate={handleNavigateEntry}
            onRename={onRename}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <SftpContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems(contextMenu.name)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
