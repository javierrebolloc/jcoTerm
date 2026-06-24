import { useState, useRef, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { getLocale } from '../../i18n'
import styles from './SftpFileTable.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: number
  permissions?: string
}

interface SftpFileTableProps {
  entries: FileEntry[]
  selectedNames: Set<string>
  showPermissions: boolean
  dragDataType?: string
  onSelect: (names: Set<string>) => void
  onNavigate: (name: string) => void
  onRename: (oldName: string, newName: string) => void
}

type SortField = 'name' | 'size' | 'modified' | 'permissions'
type SortDir = 'asc' | 'desc'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp * 1000)
  const locale = getLocale() === 'es' ? 'es-ES' : 'en-US'
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function compareEntries(a: FileEntry, b: FileEntry, field: SortField, dir: SortDir): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

  let cmp = 0
  switch (field) {
    case 'name':
      cmp = a.name.localeCompare(b.name, getLocale(), { sensitivity: 'base' })
      break
    case 'size':
      cmp = a.size - b.size
      break
    case 'modified':
      cmp = a.modified - b.modified
      break
    case 'permissions':
      cmp = (a.permissions ?? '').localeCompare(b.permissions ?? '')
      break
  }
  return dir === 'asc' ? cmp : -cmp
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpFileTable({
  entries,
  selectedNames,
  showPermissions,
  dragDataType,
  onSelect,
  onNavigate,
  onRename,
}: SftpFileTableProps): JSX.Element {
  const { t } = useTranslation()
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const lastClickedRef = useRef<string | null>(null)
  const searchBufferRef = useRef('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    if (renamingName && renameInputRef.current) {
      renameInputRef.current.focus()
      const entry = entries.find((e) => e.name === renamingName)
      if (entry && !entry.isDirectory) {
        const dotIdx = renamingName.lastIndexOf('.')
        if (dotIdx > 0) {
          renameInputRef.current.setSelectionRange(0, dotIdx)
        } else {
          renameInputRef.current.select()
        }
      } else {
        renameInputRef.current.select()
      }
    }
  }, [renamingName, entries])

  // ── Column resize ──────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null)
  const didResizeRef = useRef(false)

  const handleResizeStart = useCallback((col: string, e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).parentElement!
    resizeRef.current = { col, startX: e.clientX, startW: th.offsetWidth }
    didResizeRef.current = false
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handleResizeMove = useCallback((e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!resizeRef.current) return
    didResizeRef.current = true
    const { col, startX, startW } = resizeRef.current
    const newW = Math.max(40, startW + e.clientX - startX)
    setColWidths((prev) => ({ ...prev, [col]: newW }))
  }, [])

  const handleResizeEnd = useCallback((): void => {
    resizeRef.current = null
  }, [])

  const sorted = [...entries].sort((a, b) => compareEntries(a, b, sortField, sortDir))

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (renamingName) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1) return

      e.preventDefault()
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchBufferRef.current += e.key.toLowerCase()
      searchTimerRef.current = setTimeout(() => { searchBufferRef.current = '' }, 800)

      const query = searchBufferRef.current
      const match = sorted.find((entry) => entry.name.toLowerCase().startsWith(query))
      if (match) {
        onSelect(new Set([match.name]))
        lastClickedRef.current = match.name
        const row = table.querySelector(`[data-name="${CSS.escape(match.name)}"]`)
        if (row) row.scrollIntoView({ block: 'nearest' })
      }
    }
    table.addEventListener('keydown', handleKeyDown)
    return () => table.removeEventListener('keydown', handleKeyDown)
  }, [sorted, renamingName, onSelect])

  const handleSort = (field: SortField): void => {
    if (didResizeRef.current) { didResizeRef.current = false; return }
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleClick = useCallback((name: string, e: React.MouseEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedNames)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      onSelect(next)
    } else if (e.shiftKey && lastClickedRef.current) {
      const startIdx = sorted.findIndex((en) => en.name === lastClickedRef.current)
      const endIdx = sorted.findIndex((en) => en.name === name)
      if (startIdx >= 0 && endIdx >= 0) {
        const lo = Math.min(startIdx, endIdx)
        const hi = Math.max(startIdx, endIdx)
        const next = new Set(selectedNames)
        for (let i = lo; i <= hi; i++) next.add(sorted[i].name)
        onSelect(next)
      }
    } else {
      onSelect(new Set([name]))
    }
    lastClickedRef.current = name
  }, [selectedNames, sorted, onSelect])

  const commitRename = (): void => {
    if (renamingName && renameValue.trim() && renameValue.trim() !== renamingName) {
      onRename(renamingName, renameValue.trim())
    }
    setRenamingName(null)
    setRenameValue('')
  }

  const sortIndicator = (field: SortField): string => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' ^' : ' v'
  }

  const resizeHandle = (col: string): JSX.Element => (
    <div
      className={styles.resizeHandle}
      onPointerDown={(e) => handleResizeStart(col, e)}
      onPointerMove={handleResizeMove}
      onPointerUp={handleResizeEnd}
    />
  )

  return (
    <table className={styles.table} ref={tableRef} tabIndex={0}>
      <thead className={styles.thead}>
        <tr className={styles.headerRow}>
          <th className={`${styles.headerCell} ${styles.colIcon}`} />
          <th className={`${styles.headerCell} ${styles.colName}`} style={colWidths.name ? { width: colWidths.name } : undefined} onClick={() => handleSort('name')}>
            {t('sftp.table.name')}
            <span className={styles.sortIndicator}>{sortIndicator('name')}</span>
            {resizeHandle('name')}
          </th>
          <th className={`${styles.headerCell} ${styles.colSize}`} style={colWidths.size ? { width: colWidths.size } : undefined} onClick={() => handleSort('size')}>
            {t('sftp.table.size')}
            <span className={styles.sortIndicator}>{sortIndicator('size')}</span>
            {resizeHandle('size')}
          </th>
          <th className={`${styles.headerCell} ${styles.colDate}`} style={colWidths.modified ? { width: colWidths.modified } : undefined} onClick={() => handleSort('modified')}>
            {t('sftp.table.modified')}
            <span className={styles.sortIndicator}>{sortIndicator('modified')}</span>
            {resizeHandle('modified')}
          </th>
          {showPermissions && (
            <th className={`${styles.headerCell} ${styles.colPerms}`} style={colWidths.permissions ? { width: colWidths.permissions } : undefined} onClick={() => handleSort('permissions')}>
              {t('sftp.table.permissions')}
              <span className={styles.sortIndicator}>{sortIndicator('permissions')}</span>
              {resizeHandle('permissions')}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry) => {
          const isSelected = selectedNames.has(entry.name)
          return (
            <tr
              key={entry.name}
              data-name={entry.name}
              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
              draggable={!!dragDataType && !entry.isDirectory && isSelected}
              onDragStart={(e) => {
                if (dragDataType && !entry.isDirectory) {
                  const filesToDrag = selectedNames.size > 0 ? [...selectedNames] : [entry.name]
                  e.dataTransfer.setData(dragDataType, JSON.stringify(filesToDrag))
                  e.dataTransfer.effectAllowed = 'copy'
                }
              }}
              onClick={(e) => handleClick(entry.name, e)}
              onDoubleClick={() => {
                if (entry.isDirectory) onNavigate(entry.name)
                else { setRenamingName(entry.name); setRenameValue(entry.name) }
              }}
            >
              <td className={styles.cellIcon}>
                {entry.isDirectory ? '[D]' : ' '}
              </td>
              <td className={styles.cell}>
                {renamingName === entry.name ? (
                  <input
                    ref={renameInputRef}
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') { setRenamingName(null); setRenameValue('') }
                      e.stopPropagation()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={entry.isDirectory ? styles.nameDir : styles.nameFile}>
                    {entry.name}
                  </span>
                )}
              </td>
              <td className={`${styles.cell} ${styles.cellSize}`}>
                {entry.isDirectory ? '--' : formatSize(entry.size)}
              </td>
              <td className={`${styles.cell} ${styles.cellDate}`}>
                {formatDate(entry.modified)}
              </td>
              {showPermissions && (
                <td className={`${styles.cell} ${styles.cellPerms}`}>
                  {entry.permissions ?? ''}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export { type FileEntry }
