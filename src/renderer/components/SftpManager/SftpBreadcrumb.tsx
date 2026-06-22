import { useRef, useEffect } from 'react'
import styles from './SftpBreadcrumb.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SftpBreadcrumbProps {
  path: string
  separator: '/' | '\\'
  drives?: string[]
  onNavigate: (path: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitPath(path: string, separator: '/' | '\\'): { drive?: string; segments: string[] } {
  if (separator === '\\') {
    // Windows: C:\Users\foo -> drive="C:", segments=["Users","foo"]
    const match = path.match(/^([A-Za-z]:)(.*)$/)
    if (match) {
      const drive = match[1]
      const rest = match[2].replace(/\\/g, '/').replace(/^\/+/, '')
      const segments = rest ? rest.split('/').filter(Boolean) : []
      return { drive, segments }
    }
    // Fallback: split by backslash
    const parts = path.split('\\').filter(Boolean)
    return { segments: parts }
  }
  // Unix: /home/user -> segments=["home","user"]
  const parts = path.split('/').filter(Boolean)
  return { segments: parts }
}

function buildPath(drive: string | undefined, segments: string[], upTo: number, separator: '/' | '\\'): string {
  const selected = segments.slice(0, upTo + 1)
  if (separator === '\\') {
    const base = drive ? `${drive}\\` : '\\'
    return selected.length > 0 ? `${base}${selected.join('\\')}` : base
  }
  return `/${selected.join('/')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SftpBreadcrumb({ path, separator, drives, onNavigate }: SftpBreadcrumbProps): JSX.Element {
  const { drive, segments } = splitPath(path, separator)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollLeft = containerRef.current.scrollWidth
  }, [path])

  const handleDriveChange = (newDrive: string): void => {
    onNavigate(`${newDrive}\\`)
  }

  const handleRootClick = (): void => {
    if (separator === '\\' && drive) {
      onNavigate(`${drive}\\`)
    } else {
      onNavigate('/')
    }
  }

  return (
    <div className={styles.breadcrumb} ref={containerRef} title={path}>
      {/* Drive selector (Windows local only) */}
      {separator === '\\' && drives && drives.length > 0 ? (
        <select
          className={styles.driveSelect}
          value={drive ?? drives[0]}
          onChange={(e) => handleDriveChange(e.target.value)}
        >
          {drives.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      ) : (
        <button
          className={styles.segment}
          onClick={handleRootClick}
        >
          {separator === '\\' && drive ? drive : '/'}
        </button>
      )}

      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <span className={styles.separator}>{separator === '\\' ? '\\' : '/'}</span>
            <button
              className={`${styles.segment} ${isLast ? styles.segmentCurrent : ''}`}
              onClick={isLast ? undefined : () => onNavigate(buildPath(drive, segments, i, separator))}
              disabled={isLast}
            >
              {seg}
            </button>
          </span>
        )
      })}
    </div>
  )
}
