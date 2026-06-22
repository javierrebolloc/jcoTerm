import { useEffect, useRef } from 'react'
import styles from './SftpContextMenu.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface SftpContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpContextMenu({ x, y, items, onClose }: SftpContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Clamp position to viewport
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - items.length * 30 - 16)

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <button
            key={i}
            className={`${styles.item} ${item.danger ? styles.itemDanger : ''}`}
            onClick={() => { item.onClick(); onClose() }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
