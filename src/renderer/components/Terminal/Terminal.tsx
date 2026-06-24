import { useRef, useCallback, useEffect, useState } from 'react'
import TabBar from './TabBar'
import type { Tab } from './TabBar'
import TerminalPane from './TerminalPane'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Terminal.module.css'

export type SplitCount = 0 | 2 | 4 | 8

interface TerminalProps {
  tabs: Tab[]
  activeTabId: string | null
  fitKey: number
  splitCount: SplitCount
  multiExec: boolean
  multiExecExcluded: Set<string>
  onToggleMultiExecExclude: (sshSessionId: string) => void
  scrollback: number
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  onTabSelect: (sshSessionId: string) => void
  onTabClose: (sshSessionId: string) => void
  onTabClone: (sshSessionId: string) => void
  onTabCloseOthers: (sshSessionId: string) => void
  onTabCloseAll: () => void
  onTabCloseToRight: (sshSessionId: string) => void
  onTabCloseToLeft: (sshSessionId: string) => void
  contentRef: React.MutableRefObject<(() => string) | null>
}

export default function Terminal({
  tabs,
  activeTabId,
  fitKey,
  splitCount,
  multiExec,
  multiExecExcluded,
  onToggleMultiExecExclude,
  scrollback,
  fontSize,
  fontFamily,
  cursorStyle,
  cursorBlink,
  onTabSelect,
  onTabClose,
  onTabClone,
  onTabCloseOthers,
  onTabCloseAll,
  onTabCloseToRight,
  onTabCloseToLeft,
  contentRef,
}: TerminalProps): JSX.Element {
  const { t } = useTranslation()
  const contentFns = useRef<Map<string, () => string>>(new Map())

  const handleRegisterContent = useCallback((sshSessionId: string, fn: () => string): void => {
    contentFns.current.set(sshSessionId, fn)
  }, [])

  useEffect(() => {
    contentRef.current = activeTabId ? (contentFns.current.get(activeTabId) ?? null) : null
  }, [activeTabId, contentRef])

  const inSplitMode = splitCount > 0

  // ── Split cell assignments ───────────────────────────────────────────────
  const [splitAssignments, setSplitAssignments] = useState<string[]>([])

  useEffect(() => {
    if (!inSplitMode) { setSplitAssignments([]); return }
    setSplitAssignments((prev) => {
      const validPrev = prev.map((id) => (id && tabs.some((t) => t.sshSessionId === id) ? id : ''))
      const result = validPrev.length >= splitCount
        ? validPrev.slice(0, splitCount)
        : [...validPrev, ...Array(splitCount - validPrev.length).fill('') as string[]]
      const used = new Set(result.filter(Boolean))
      const available = tabs.filter((t) => !used.has(t.sshSessionId))
      let ai = 0
      for (let i = 0; i < result.length; i++) {
        if (!result[i] && ai < available.length) {
          result[i] = available[ai++].sshSessionId
        }
      }
      return result
    })
  }, [inSplitMode, splitCount, tabs])

  const handleCellAssign = useCallback((cellIndex: number, sshSessionId: string): void => {
    setSplitAssignments((prev) => {
      const next = [...prev]
      if (sshSessionId === '') {
        next[cellIndex] = ''
        return next
      }
      const otherIdx = next.indexOf(sshSessionId)
      if (otherIdx !== -1 && otherIdx !== cellIndex) {
        next[otherIdx] = next[cellIndex]
      }
      next[cellIndex] = sshSessionId
      return next
    })
  }, [])

  const multiExecTargets = inSplitMode && multiExec
    ? splitAssignments.filter((id) => id && !multiExecExcluded.has(id))
    : []

  if (tabs.length === 0 && !inSplitMode) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <p className={styles.emptyHint}>{t('terminal.emptyHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {!inSplitMode && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onTabSelect}
          onClose={onTabClose}
          onClone={onTabClone}
          onCloseOthers={onTabCloseOthers}
          onCloseAll={onTabCloseAll}
          onCloseToRight={onTabCloseToRight}
          onCloseToLeft={onTabCloseToLeft}
        />
      )}

      {/* All panes always mounted, keyed by sshSessionId so they never remount */}
      <div
        className={inSplitMode ? styles.splitGrid : styles.panesContainer}
        data-count={inSplitMode ? String(splitCount) : undefined}
      >
        {/* Empty cell placeholders for split slots without a session */}
        {inSplitMode && splitAssignments.map((assignedId, cellIdx) => {
          if (assignedId) return null
          return (
            <div key={`empty-${cellIdx}`} className={styles.splitCell} style={{ order: cellIdx }}>
              <div className={styles.splitCellHeader}>
                <select
                  className={styles.splitSelect}
                  value=""
                  onChange={(e) => handleCellAssign(cellIdx, e.target.value)}
                >
                  <option value="">{t('terminal.emptyCell')}</option>
                  {tabs.map((t) => (
                    <option key={t.sshSessionId} value={t.sshSessionId}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.emptyCell}>
                <span className={styles.emptyCellHint}>{t('terminal.emptyCellHint')}</span>
              </div>
            </div>
          )
        })}
        {tabs.map((tab) => {
          const cellIdx = inSplitMode ? splitAssignments.indexOf(tab.sshSessionId) : -1
          const isVisibleSplit = inSplitMode && cellIdx !== -1
          const isVisibleNormal = !inSplitMode && tab.sshSessionId === activeTabId
          const isActive = isVisibleSplit || isVisibleNormal
          const isHidden = !isActive

          const isExcluded = multiExecExcluded.has(tab.sshSessionId)

          return (
            <div
              key={tab.sshSessionId}
              className={`${inSplitMode && isVisibleSplit ? styles.splitCell : ''} ${isVisibleSplit && tab.sshSessionId === activeTabId ? styles.splitCellActive : ''} ${isHidden ? styles.hiddenPane : ''}`}
              style={isVisibleSplit ? { order: cellIdx } : undefined}
              onClick={isVisibleSplit ? () => onTabSelect(tab.sshSessionId) : undefined}
            >
              {isVisibleSplit && (
                <div className={styles.splitCellHeader}>
                  <select
                    className={styles.splitSelect}
                    value={tab.sshSessionId}
                    onChange={(e) => handleCellAssign(cellIdx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">{t('terminal.emptyCell')}</option>
                    {tabs.map((t) => (
                      <option key={t.sshSessionId} value={t.sshSessionId}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {multiExec && (
                    <button
                      className={`${styles.splitMultiExecBtn} ${isExcluded ? styles.splitMultiExecExcluded : ''}`}
                      onClick={(e) => { e.stopPropagation(); onToggleMultiExecExclude(tab.sshSessionId) }}
                      title={isExcluded ? t('app.multiExecInclude') : t('app.multiExecExclude')}
                    >
                      {isExcluded ? '⊘' : '>>'}
                    </button>
                  )}
                </div>
              )}
              <TerminalPane
                sshSessionId={tab.sshSessionId}
                label={tab.label}
                isActive={isActive}
                fitKey={fitKey}
                scrollback={scrollback}
                fontSize={fontSize}
                fontFamily={fontFamily}
                cursorStyle={cursorStyle}
                cursorBlink={cursorBlink}
                multiExecTargets={isVisibleSplit ? multiExecTargets : []}
                multiExecExcluded={isExcluded}
                onToggleMultiExec={isVisibleSplit && multiExec ? () => onToggleMultiExecExclude(tab.sshSessionId) : undefined}
                onClose={onTabClose}
                onRegisterContent={handleRegisterContent}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
