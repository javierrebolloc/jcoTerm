import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './TabBar.module.css'

export interface Tab {
  sshSessionId: string
  label: string
  savedSessionId?: string
}

interface ContextMenuState {
  x: number
  y: number
  tabId: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (sshSessionId: string) => void
  onClose: (sshSessionId: string) => void
  onClone: (sshSessionId: string) => void
  onCloseOthers: (sshSessionId: string) => void
  onCloseAll: () => void
  onCloseToRight: (sshSessionId: string) => void
  onCloseToLeft: (sshSessionId: string) => void
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onClone,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onCloseToLeft,
}: TabBarProps): JSX.Element {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Horizontal scroll with mouse wheel
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const handler = (e: WheelEvent): void => {
      if (e.deltaY === 0) return
      e.preventDefault()
      bar.scrollLeft += e.deltaY
    }
    bar.addEventListener('wheel', handler, { passive: false })
    return () => bar.removeEventListener('wheel', handler)
  }, [])

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!menu) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu])

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  const runAndClose = useCallback((fn: () => void): void => {
    fn()
    setMenu(null)
  }, [])

  const menuTab = menu ? tabs.find((t) => t.sshSessionId === menu.tabId) : null
  const menuIdx = menu ? tabs.findIndex((t) => t.sshSessionId === menu.tabId) : -1

  if (tabs.length === 0) return <></>

  return (
    <>
      <div ref={barRef} className={styles.bar} role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.sshSessionId}
            className={`${styles.tab} ${tab.sshSessionId === activeTabId ? styles.active : ''}`}
            role="tab"
            aria-selected={tab.sshSessionId === activeTabId}
            tabIndex={tab.sshSessionId === activeTabId ? 0 : -1}
            onClick={() => onSelect(tab.sshSessionId)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(tab.sshSessionId) } }}
            onContextMenu={(e) => handleContextMenu(e, tab.sshSessionId)}
            title={tab.label}
          >
            <span className={styles.statusDot} />
            <span className={styles.label}>{tab.label}</span>
            <button
              className={styles.closeBtn}
              onClick={(e) => { e.stopPropagation(); onClose(tab.sshSessionId) }}
              aria-label={t('tabBar.close') + ' ' + tab.label}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {menu && menuTab && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ left: menu.x, top: menu.y }}
        >
          <button className={styles.contextItem} onClick={() => runAndClose(() => onClose(menu.tabId))}>
            {t('tabBar.close')}
          </button>
          {menuTab.savedSessionId && (
            <button className={styles.contextItem} onClick={() => runAndClose(() => onClone(menu.tabId))}>
              {t('tabBar.clone')}
            </button>
          )}
          <div className={styles.contextSep} />
          <button
            className={styles.contextItem}
            onClick={() => runAndClose(() => onCloseOthers(menu.tabId))}
            disabled={tabs.length <= 1}
          >
            {t('tabBar.closeOthers')}
          </button>
          <button
            className={styles.contextItem}
            onClick={() => runAndClose(() => onCloseToLeft(menu.tabId))}
            disabled={menuIdx === 0}
          >
            {t('tabBar.closeLeft')}
          </button>
          <button
            className={styles.contextItem}
            onClick={() => runAndClose(() => onCloseToRight(menu.tabId))}
            disabled={menuIdx === tabs.length - 1}
          >
            {t('tabBar.closeRight')}
          </button>
          <div className={styles.contextSep} />
          <button className={`${styles.contextItem} ${styles.contextItemDanger}`} onClick={() => runAndClose(onCloseAll)}>
            {t('tabBar.closeAll')}
          </button>
        </div>
      )}
    </>
  )
}
