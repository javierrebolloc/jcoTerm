import { useState, useEffect, useCallback } from 'react'
import type { SftpEntry } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './FileExplorer.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreeNode extends SftpEntry {
  path: string
  children: TreeNode[] | 'loading' | 'error' | null
  expanded: boolean
}

interface FileExplorerProps {
  sshSessionId: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function joinPath(parent: string, name: string): string {
  if (parent === '/') return `/${name}`
  return `${parent}/${name}`
}

// Shell-safe single-quote escaping
function shellQuote(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`
}

function makeNode(entry: SftpEntry, parentPath: string): TreeNode {
  return {
    ...entry,
    path: joinPath(parentPath, entry.name),
    children: entry.isDirectory ? null : undefined as unknown as null,
    expanded: false,
  }
}

// ── FileNode ─────────────────────────────────────────────────────────────────

interface FileNodeProps {
  node: TreeNode
  depth: number
  sshSessionId: string
  onToggle: (path: string) => void
  onCd: (path: string) => void
}

function FileNode({ node, depth, sshSessionId, onToggle, onCd }: FileNodeProps): JSX.Element {
  const { t } = useTranslation()
  const indent = depth * 14

  return (
    <div>
      <div
        className={`${styles.node} ${node.isDirectory ? styles.nodeDir : styles.nodeFile}`}
        style={{ paddingLeft: 8 + indent }}
        title={node.path}
      >
        {node.isDirectory ? (
          <button
            className={styles.arrowBtn}
            onClick={() => onToggle(node.path)}
            aria-label={node.expanded ? 'Colapsar' : 'Expandir'}
          >
            {node.expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={styles.fileIcon}>·</span>
        )}
        <span
          className={`${styles.nodeName} ${node.isDirectory ? styles.nodeNameDir : ''}`}
          onClick={() => node.isDirectory && onCd(node.path)}
          role={node.isDirectory ? 'button' : undefined}
          tabIndex={node.isDirectory ? 0 : undefined}
          onKeyDown={node.isDirectory ? (e) => e.key === 'Enter' && onCd(node.path) : undefined}
          title={node.isDirectory ? `cd ${node.path}` : node.path}
        >
          {node.name}
        </span>
        {node.children === 'loading' && <span className={styles.spinner} />}
      </div>

      {node.expanded && node.isDirectory && (
        <div>
          {node.children === 'loading' && (
            <div className={styles.loadingRow} style={{ paddingLeft: 8 + indent + 14 }}>
              {t('fileExplorer.loading')}
            </div>
          )}
          {node.children === 'error' && (
            <div className={styles.errorRow} style={{ paddingLeft: 8 + indent + 14 }}>
              {t('fileExplorer.error')}
            </div>
          )}
          {Array.isArray(node.children) && node.children.length === 0 && (
            <div className={styles.emptyRow} style={{ paddingLeft: 8 + indent + 14 }}>
              {t('fileExplorer.empty')}
            </div>
          )}
          {Array.isArray(node.children) &&
            node.children.map((child) => (
              <FileNode
                key={child.path}
                node={child}
                depth={depth + 1}
                sshSessionId={sshSessionId}
                onToggle={onToggle}
                onCd={onCd}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ── FileExplorer ──────────────────────────────────────────────────────────────

export default function FileExplorer({ sshSessionId }: FileExplorerProps): JSX.Element {
  const { t } = useTranslation()
  const [rootNodes, setRootNodes] = useState<TreeNode[] | 'loading' | 'error'>('loading')
  const [homePath, setHomePath] = useState<string | null>(null)

  // Load root + resolve home on session change
  useEffect(() => {
    if (!sshSessionId) {
      setRootNodes('loading')
      setHomePath(null)
      return
    }
    setRootNodes('loading')

    const load = async (): Promise<void> => {
      // Resolve home path
      const homeResult = await window.electronAPI.sftp.realpath(sshSessionId, '.')
      if (homeResult.success && homeResult.data) setHomePath(homeResult.data)

      const result = await window.electronAPI.sftp.listDir(sshSessionId, '/')
      if (result.success && result.data) {
        setRootNodes(result.data.map((e) => makeNode(e, '/')))
      } else {
        setRootNodes('error')
      }
    }

    void load()
  }, [sshSessionId])

  const updateTree = useCallback(
    (nodes: TreeNode[], targetPath: string, updater: (n: TreeNode) => TreeNode): TreeNode[] =>
      nodes.map((n) => {
        if (n.path === targetPath) return updater(n)
        if (Array.isArray(n.children) && targetPath.startsWith(n.path + '/')) {
          return { ...n, children: updateTree(n.children, targetPath, updater) }
        }
        return n
      }),
    [],
  )

  const handleToggle = useCallback(
    async (path: string): Promise<void> => {
      if (!sshSessionId || !Array.isArray(rootNodes)) return

      // Find the node
      const findNode = (nodes: TreeNode[]): TreeNode | null => {
        for (const n of nodes) {
          if (n.path === path) return n
          if (Array.isArray(n.children)) {
            const found = findNode(n.children)
            if (found) return found
          }
        }
        return null
      }
      const node = findNode(rootNodes)
      if (!node || !node.isDirectory) return

      if (node.expanded) {
        // Collapse
        setRootNodes((prev) =>
          Array.isArray(prev) ? updateTree(prev, path, (n) => ({ ...n, expanded: false })) : prev,
        )
        return
      }

      // Expand — lazy-load if not yet loaded
      if (node.children === null) {
        setRootNodes((prev) =>
          Array.isArray(prev)
            ? updateTree(prev, path, (n) => ({ ...n, expanded: true, children: 'loading' }))
            : prev,
        )
        const result = await window.electronAPI.sftp.listDir(sshSessionId, path)
        setRootNodes((prev) =>
          Array.isArray(prev)
            ? updateTree(prev, path, (n) => ({
                ...n,
                children: result.success && result.data
                  ? result.data.map((e) => makeNode(e, path))
                  : 'error',
              }))
            : prev,
        )
      } else {
        // Already loaded — just expand
        setRootNodes((prev) =>
          Array.isArray(prev) ? updateTree(prev, path, (n) => ({ ...n, expanded: true })) : prev,
        )
      }
    },
    [sshSessionId, rootNodes, updateTree],
  )

  const handleCd = useCallback(
    (path: string): void => {
      if (!sshSessionId) return
      window.electronAPI.ssh.sendInput(sshSessionId, `cd ${shellQuote(path)}\n`)
    },
    [sshSessionId],
  )

  if (!sshSessionId) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>{t('fileExplorer.title')}</span>
        </div>
        <p className={styles.hint}>{t('fileExplorer.hint')}</p>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{t('fileExplorer.title')}</span>
        {homePath && <span className={styles.homePath} title={homePath}>~ {homePath}</span>}
      </div>

      <div className={styles.tree}>
        {rootNodes === 'loading' && <p className={styles.hint}>{t('fileExplorer.loading')}</p>}
        {rootNodes === 'error' && <p className={styles.hintError}>{t('fileExplorer.errorSftp')}</p>}
        {Array.isArray(rootNodes) &&
          rootNodes.map((node) => (
            <FileNode
              key={node.path}
              node={node}
              depth={0}
              sshSessionId={sshSessionId}
              onToggle={(p) => void handleToggle(p)}
              onCd={handleCd}
            />
          ))}
      </div>
    </div>
  )
}
