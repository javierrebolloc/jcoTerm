import { useState, useEffect, useCallback, useRef } from 'react'
import type { SavedFolder, SavedSessionWithStatus } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useConfirm } from '../../hooks/useConfirm'
import SessionItem from './SessionItem'
import SaveSessionModal from './SaveSessionModal'
import styles from './SessionList.module.css'

const rlog = (level: 'info' | 'warn' | 'error' | 'debug', msg: string, ...args: unknown[]): void =>
  window.electronAPI.log(level, `[SessionList] ${msg}`, ...args)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the full set of descendant folder IDs (to prevent circular nesting). */
function getDescendantIds(folderId: string, allFolders: SavedFolder[]): Set<string> {
  const result = new Set<string>()
  const queue = [folderId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const f of allFolders) {
      if (f.parentId === cur) { result.add(f.id); queue.push(f.id) }
    }
  }
  return result
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number
  y: number
  folderId?: string
  folderName?: string
  onCreateSession: (folderId?: string) => void
  onCreateFolder: (parentId?: string) => void
  onClose: () => void
}

function ContextMenu({ x, y, folderId, folderName, onCreateSession, onCreateFolder, onClose }: ContextMenuProps): JSX.Element {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    const timer = setTimeout(() => window.addEventListener('mousedown', handleOutside), 0)
    window.addEventListener('keydown', handleKey)
    return () => { clearTimeout(timer); window.removeEventListener('mousedown', handleOutside); window.removeEventListener('keydown', handleKey) }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 210),
        top: Math.min(y, window.innerHeight - 80),
      }}
    >
      <button
        className={styles.contextItem}
        onMouseDown={(e) => { e.stopPropagation(); rlog('info', 'ctx: nueva sesión folderId=%s', folderId ?? 'root'); onCreateSession(folderId); onClose() }}
      >
        {folderName ? t('session.newSessionIn', { inFolder: ` en "${folderName}"` }) : t('session.newSessionIn', { inFolder: '' })}
      </button>
      <button
        className={styles.contextItem}
        onMouseDown={(e) => { e.stopPropagation(); rlog('info', 'ctx: nueva carpeta parentId=%s', folderId ?? 'root'); onCreateFolder(folderId); onClose() }}
      >
        {folderName ? t('session.newFolderIn', { inFolder: ` en "${folderName}"` }) : t('session.newFolderIn', { inFolder: '' })}
      </button>
    </div>
  )
}

// ── Drop zone hook ─────────────────────────────────────────────────────────────

interface DropHandlers {
  onDropSession: (id: string) => void
  onDropFolder: (id: string) => void
}

function useDropZone({ onDropSession, onDropFolder }: DropHandlers): {
  isDragOver: boolean
  dropProps: React.HTMLAttributes<HTMLElement>
} {
  const [isDragOver, setIsDragOver] = useState(false)
  const counter = useRef(0)

  const dropProps: React.HTMLAttributes<HTMLElement> = {
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' },
    onDragEnter: (e) => { e.preventDefault(); counter.current++; setIsDragOver(true) },
    onDragLeave: () => { counter.current--; if (counter.current <= 0) { counter.current = 0; setIsDragOver(false) } },
    onDrop: (e) => {
      e.preventDefault()
      counter.current = 0
      setIsDragOver(false)
      const sessionId = e.dataTransfer.getData('session-id')
      const folderId  = e.dataTransfer.getData('folder-id')
      if (sessionId) onDropSession(sessionId)
      else if (folderId) onDropFolder(folderId)
    },
  }
  return { isDragOver, dropProps }
}

// ── Recursive folder node ─────────────────────────────────────────────────────

interface FolderNodeProps {
  folder: SavedFolder
  depth: number
  allFolders: SavedFolder[]
  allSessions: SavedSessionWithStatus[]
  connectingSessionId: string | null
  activeSessionIds: Set<string>
  onConnect: (s: SavedSessionWithStatus) => void
  onEdit: (s: SavedSessionWithStatus) => void
  onDeleteSession: (id: string, name: string) => void
  onMoveSession: (sessionId: string, targetFolderId: string | undefined) => void
  onMoveFolder: (folderId: string, targetParentId: string | undefined) => void
  onReorder: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onContextMenu: (e: React.MouseEvent, folderId: string, folderName: string) => void
}

function FolderNode({
  folder, depth, allFolders, allSessions, connectingSessionId, activeSessionIds,
  onConnect, onEdit, onDeleteSession,
  onMoveSession, onMoveFolder, onReorder,
  onRenameFolder, onDeleteFolder, onContextMenu,
}: FolderNodeProps): JSX.Element {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(folder.name)
  const [draggingFolder, setDraggingFolder] = useState(false)

  const mySessions  = allSessions.filter((s) => s.folderId === folder.id)
  const myChildren  = allFolders.filter((f) => f.parentId === folder.id)

  const { isDragOver, dropProps } = useDropZone({
    onDropSession: (id) => onMoveSession(id, folder.id),
    onDropFolder:  (id) => onMoveFolder(id, folder.id),
  })

  const commitRename = (): void => {
    const t = draftName.trim()
    if (t && t !== folder.name) onRenameFolder(folder.id, t)
    else setDraftName(folder.name)
    setRenaming(false)
  }

  const indent = depth * 12

  return (
    <div className={`${styles.folderSection} ${draggingFolder ? styles.draggingFolder : ''}`}>
      {/* Header — draggable */}
      <div
        className={styles.folderHeader}
        style={{ paddingLeft: indent }}
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.setData('folder-id', folder.id)
          e.dataTransfer.effectAllowed = 'move'
          setDraggingFolder(true)
          rlog('debug', 'drag folder start: id=%s', folder.id)
        }}
        onDragEnd={() => setDraggingFolder(false)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          rlog('debug', 'ctx on folder: id=%s', folder.id)
          onContextMenu(e, folder.id, folder.name)
        }}
      >
        <button className={styles.folderToggle} onClick={() => !renaming && setOpen((o) => !o)}>
          <span className={styles.folderArrow}>{open ? '▼' : '▶'}</span>
          {renaming ? (
            <input
              className={styles.folderNameInput}
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setDraftName(folder.name); setRenaming(false) }
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={styles.folderName}>{folder.name}</span>
          )}
          <span className={styles.folderCount}>{mySessions.length + myChildren.length}</span>
        </button>

        <div className={styles.folderActions}>
          <button
            className={styles.folderActionBtn}
            onClick={(e) => { e.stopPropagation(); setRenaming(true); setDraftName(folder.name) }}
            title={t('common.rename')}
          >✎</button>
          <button
            className={`${styles.folderActionBtn} ${styles.folderDeleteBtn}`}
            onClick={(e) => {
              e.stopPropagation()
              void confirmDialog(t('session.deleteFolder', { name: folder.name }), true).then((ok) => {
                if (ok) { rlog('info', 'delete folder id=%s', folder.id); onDeleteFolder(folder.id) }
              })
            }}
            title={t('common.delete')}
          >✕</button>
        </div>
      </div>

      {/* Content — drop zone for sessions & child folders */}
      {open && (
        <div
          className={`${styles.folderItems} ${isDragOver ? styles.dragOver : ''}`}
          {...dropProps}
        >
          {mySessions.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              connecting={connectingSessionId === s.id}
              active={activeSessionIds.has(s.id)}
              onConnect={onConnect}
              onEdit={onEdit}
              onDelete={onDeleteSession}
              onReorder={onReorder}
            />
          ))}

          {myChildren.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              allFolders={allFolders}
              allSessions={allSessions}
              connectingSessionId={connectingSessionId}
              activeSessionIds={activeSessionIds}
              onConnect={onConnect}
              onEdit={onEdit}
              onDeleteSession={onDeleteSession}
              onMoveSession={onMoveSession}
              onMoveFolder={onMoveFolder}
              onReorder={onReorder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onContextMenu={onContextMenu}
            />
          ))}

          {mySessions.length === 0 && myChildren.length === 0 && (
            <p className={styles.emptyFolder} style={{ paddingLeft: indent + 12 }}>
              {isDragOver ? t('session.dropHere') : t('session.emptyFolder')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── SessionList ────────────────────────────────────────────────────────────────

interface SessionListProps {
  sessions: SavedSessionWithStatus[]
  connectingSessionId: string | null
  activeSessionIds: Set<string>
  onConnect: (session: SavedSessionWithStatus) => void
  onEdit: (session: SavedSessionWithStatus) => void
  onDelete: (id: string, name: string) => void
  onRefresh: () => void
}

interface ContextMenuState {
  x: number; y: number; folderId?: string; folderName?: string
}

export default function SessionList({
  sessions, connectingSessionId, activeSessionIds, onConnect, onEdit, onDelete, onRefresh,
}: SessionListProps): JSX.Element {
  const { t } = useTranslation()
  const [folders, setFolders] = useState<SavedFolder[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | undefined>(undefined)
  const [newFolderName, setNewFolderName] = useState('')
  const [sessionModalFolderId, setSessionModalFolderId] = useState<string | undefined>(undefined)
  const [showSessionModal, setShowSessionModal] = useState(false)

  const refreshFolders = useCallback(async (): Promise<void> => {
    const r = await window.electronAPI.folders.list()
    if (r.success && r.data) setFolders(r.data)
  }, [])

  useEffect(() => { void refreshFolders() }, [refreshFolders])

  // ── Move session ──

  const handleMoveSession = useCallback(async (sessionId: string, targetFolderId: string | undefined): Promise<void> => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) { rlog('warn', 'move session: not found id=%s', sessionId); return }
    if (session.folderId === targetFolderId) { rlog('debug', 'move session: no-op'); return }
    rlog('info', 'move session %s → folder %s', sessionId, targetFolderId ?? 'root')
    await window.electronAPI.sessions.save({ session: { ...session, folderId: targetFolderId } })
    onRefresh()
  }, [sessions, onRefresh])

  // ── Reorder session within same folder ──

  const handleReorder = useCallback(async (draggedId: string, targetId: string, position: 'before' | 'after'): Promise<void> => {
    const dragged = sessions.find((s) => s.id === draggedId)
    const target = sessions.find((s) => s.id === targetId)
    if (!dragged || !target) return

    if (dragged.folderId !== target.folderId) {
      rlog('info', 'reorder: cross-folder, moving %s → folder %s', draggedId, target.folderId ?? 'root')
    }

    const folderId = target.folderId
    const siblings = sessions
      .filter((s) => s.folderId === folderId && s.id !== draggedId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

    const targetIdx = siblings.findIndex((s) => s.id === targetId)
    if (targetIdx === -1) return
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1
    siblings.splice(insertIdx, 0, dragged)

    const saves: Promise<unknown>[] = []
    for (let i = 0; i < siblings.length; i++) {
      const s = siblings[i]
      if (s.sortOrder !== i || s.folderId !== folderId) {
        saves.push(window.electronAPI.sessions.save({ session: { ...s, folderId, sortOrder: i } }))
      }
    }
    if (saves.length > 0) {
      rlog('info', 'reorder: %d sessions updated in folder %s', saves.length, folderId ?? 'root')
      await Promise.all(saves)
      onRefresh()
    }
  }, [sessions, onRefresh])

  // ── Move folder ──

  const handleMoveFolder = useCallback(async (folderId: string, targetParentId: string | undefined): Promise<void> => {
    if (folderId === targetParentId) { rlog('warn', 'move folder: drop on itself'); return }
    // Prevent circular nesting: targetParent must not be a descendant of the dragged folder
    if (targetParentId) {
      const descendants = getDescendantIds(folderId, folders)
      if (descendants.has(targetParentId)) {
        rlog('warn', 'move folder %s → %s: circular, rejected', folderId, targetParentId)
        return
      }
    }
    const folder = folders.find((f) => f.id === folderId)
    if (!folder || folder.parentId === targetParentId) { rlog('debug', 'move folder: no-op'); return }
    rlog('info', 'move folder %s → parent %s', folderId, targetParentId ?? 'root')
    await window.electronAPI.folders.save({ ...folder, parentId: targetParentId })
    await refreshFolders()
  }, [folders, refreshFolders])

  // ── Root drop zone ──

  const { isDragOver: isRootDragOver, dropProps: rootDropProps } = useDropZone({
    onDropSession: (id) => void handleMoveSession(id, undefined),
    onDropFolder:  (id) => void handleMoveFolder(id, undefined),
  })

  // ── Folder CRUD ──

  const handleCreateFolder = async (): Promise<void> => {
    const name = newFolderName.trim()
    if (!name) { rlog('warn', 'create folder: empty name, cancelled'); setCreatingFolder(false); return }
    rlog('info', 'create folder name="%s" parentId=%s', name, creatingFolderParentId ?? 'root')
    const result = await window.electronAPI.folders.save({ id: '', name, parentId: creatingFolderParentId })
    if (!result.success) rlog('error', 'create folder failed: %s', result.error)
    setNewFolderName('')
    setCreatingFolder(false)
    setCreatingFolderParentId(undefined)
    await refreshFolders()
  }

  const handleRenameFolder = async (id: string, name: string): Promise<void> => {
    rlog('info', 'rename folder id=%s name="%s"', id, name)
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    await window.electronAPI.folders.save({ ...folder, name })
    await refreshFolders()
  }

  const handleDeleteFolder = async (id: string): Promise<void> => {
    // Recursively delete all descendant folders, unassign sessions
    const descendants = getDescendantIds(id, folders)
    const toDelete = [id, ...descendants]
    rlog('info', 'delete folder id=%s + %d descendants', id, descendants.size)
    for (const fid of toDelete) {
      await window.electronAPI.folders.delete(fid)
      const affected = sessions.filter((s) => s.folderId === fid)
      for (const s of affected) {
        await window.electronAPI.sessions.save({ session: { ...s, folderId: undefined } })
      }
    }
    await refreshFolders()
    onRefresh()
  }

  // ── Context menu ──

  const openContextMenu = (e: React.MouseEvent, folderId?: string, folderName?: string): void => {
    e.preventDefault()
    rlog('debug', 'ctx open folderId=%s at (%d,%d)', folderId ?? 'root', e.clientX, e.clientY)
    setContextMenu({ x: e.clientX, y: e.clientY, folderId, folderName })
  }

  const handleContextCreateFolder = (parentId?: string): void => {
    setTimeout(() => {
      setCreatingFolderParentId(parentId)
      setCreatingFolder(true)
      setNewFolderName('')
    }, 50)
  }

  // ── Tree root ──

  const rootSessions = sessions.filter((s) => !s.folderId)
  const rootFolders  = folders.filter((f) => !f.parentId)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>{t('session.title')}</span>
        <button
          className={styles.newBtn}
          onClick={() => { setCreatingFolderParentId(undefined); setCreatingFolder(true); setNewFolderName('') }}
          title={t('session.newFolder')}
        >📁</button>
      </div>

      <div
        className={styles.list}
        onContextMenu={(e) => { if (!e.defaultPrevented) openContextMenu(e) }}
      >
        {sessions.length === 0 && folders.length === 0 && (
          <p className={styles.hint}>{t('session.emptyHint')}</p>
        )}

        {/* Root drop zone */}
        <div
          className={`${styles.rootZone} ${isRootDragOver ? styles.dragOver : ''}`}
          {...rootDropProps}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openContextMenu(e) }}
        >
          {rootSessions.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((s) => (
            <SessionItem key={s.id} session={s} connecting={connectingSessionId === s.id} active={activeSessionIds.has(s.id)} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onReorder={(...args) => void handleReorder(...args)} />
          ))}
        </div>

        {/* Top-level folders (recursive) */}
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            allFolders={folders}
            allSessions={sessions}
            connectingSessionId={connectingSessionId}
            activeSessionIds={activeSessionIds}
            onConnect={onConnect}
            onEdit={onEdit}
            onDeleteSession={onDelete}
            onMoveSession={(...args) => void handleMoveSession(...args)}
            onMoveFolder={(...args) => void handleMoveFolder(...args)}
            onReorder={(...args) => void handleReorder(...args)}
            onRenameFolder={(...args) => void handleRenameFolder(...args)}
            onDeleteFolder={(...args) => void handleDeleteFolder(...args)}
            onContextMenu={openContextMenu}
          />
        ))}

        {/* New folder inline input */}
        {creatingFolder && (
          <div className={styles.newFolderRow}>
            <span style={{ paddingLeft: 4 }}>📁</span>
            <input
              className={styles.newFolderInput}
              value={newFolderName}
              autoFocus
              placeholder={creatingFolderParentId
                ? t('session.subfolderPlaceholder', { folder: folders.find(f => f.id === creatingFolderParentId)?.name ?? '' })
                : t('session.folderNamePlaceholder')}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder()
                if (e.key === 'Escape') { rlog('debug', 'new folder: cancelled'); setCreatingFolder(false) }
              }}
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          folderId={contextMenu.folderId}
          folderName={contextMenu.folderName}
          onCreateSession={(folderId) => { setSessionModalFolderId(folderId); setShowSessionModal(true) }}
          onCreateFolder={handleContextCreateFolder}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showSessionModal && (
        <SaveSessionModal
          defaultFolderId={sessionModalFolderId}
          onSaved={() => { onRefresh(); setShowSessionModal(false) }}
          onClose={() => setShowSessionModal(false)}
        />
      )}
    </div>
  )
}
