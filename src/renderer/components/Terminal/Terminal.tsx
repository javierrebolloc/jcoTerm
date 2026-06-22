import { useRef, useCallback, useEffect } from 'react'
import TabBar from './TabBar'
import type { Tab } from './TabBar'
import TerminalPane from './TerminalPane'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Terminal.module.css'

export type SplitCount = 0 | 2 | 4 | 8

interface TerminalProps {
  tabs: Tab[]
  activeTabId: string | null
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

  const multiExecTargets = inSplitMode && multiExec
    ? tabs.slice(0, splitCount).filter((tab) => !multiExecExcluded.has(tab.sshSessionId)).map((tab) => tab.sshSessionId)
    : []

  if (tabs.length === 0) {
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

      {/* Single container for all panes — never unmounts/remounts on mode switch */}
      <div
        className={inSplitMode ? styles.splitGrid : styles.panesContainer}
        data-count={inSplitMode ? String(splitCount) : undefined}
      >
        {tabs.map((tab, idx) => {
          const isInSplit = inSplitMode && idx < splitCount
          const isVisibleNormal = !inSplitMode && tab.sshSessionId === activeTabId
          const isActive = isInSplit || isVisibleNormal

          const isExcluded = multiExecExcluded.has(tab.sshSessionId)
          const pane = (
            <TerminalPane
              sshSessionId={tab.sshSessionId}
              label={tab.label}
              isActive={isActive}
              scrollback={scrollback}
              fontSize={fontSize}
              fontFamily={fontFamily}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
              multiExecTargets={multiExecTargets}
              multiExecExcluded={isExcluded}
              onToggleMultiExec={inSplitMode && multiExec ? () => onToggleMultiExecExclude(tab.sshSessionId) : undefined}
              onClose={onTabClose}
              onRegisterContent={handleRegisterContent}
            />
          )

          if (inSplitMode && isInSplit) {
            return (
              <div
                key={tab.sshSessionId}
                className={`${styles.splitCell} ${tab.sshSessionId === activeTabId ? styles.splitCellActive : ''}`}
                onClick={() => onTabSelect(tab.sshSessionId)}
              >
                {pane}
              </div>
            )
          }

          if (inSplitMode && !isInSplit) {
            return (
              <div key={tab.sshSessionId} className={styles.hiddenPane}>
                {pane}
              </div>
            )
          }

          return <div key={tab.sshSessionId} style={isActive ? undefined : { display: 'none' }}>{pane}</div>
        })}
      </div>
    </div>
  )
}
