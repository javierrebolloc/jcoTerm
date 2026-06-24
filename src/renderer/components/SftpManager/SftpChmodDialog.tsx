import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './SftpChmodDialog.module.css'

interface SftpChmodDialogProps {
  currentMode: number
  onApply: (mode: number) => void
  onClose: () => void
}

function modeToBits(mode: number): boolean[] {
  const bits: boolean[] = []
  for (let shift = 8; shift >= 0; shift--) {
    bits.push(Boolean(mode & (1 << shift)))
  }
  return bits
}

function bitsToMode(bits: boolean[]): number {
  let mode = 0
  for (let i = 0; i < 9; i++) {
    if (bits[i]) mode |= 1 << (8 - i)
  }
  return mode
}

function modeToString(mode: number): string {
  const chars = ['r', 'w', 'x']
  let result = ''
  for (let shift = 8; shift >= 0; shift--) {
    result += (mode & (1 << shift)) ? chars[(8 - shift) % 3] : '-'
  }
  return result
}

function modeToOctal(mode: number): string {
  return mode.toString(8).padStart(3, '0')
}

function parseOctal(s: string): number {
  if (!/^[0-7]{1,3}$/.test(s)) return -1
  return parseInt(s, 8)
}

export default function SftpChmodDialog({ currentMode, onApply, onClose }: SftpChmodDialogProps): JSX.Element {
  const { t } = useTranslation()
  const ROW_LABELS = [t('sftp.chmod.owner'), t('sftp.chmod.group'), t('sftp.chmod.others')]
  const COL_LABELS = [t('sftp.chmod.read'), t('sftp.chmod.write'), t('sftp.chmod.execute')]

  const permBits = currentMode & 0o777
  const [bits, setBits] = useState<boolean[]>(() => modeToBits(permBits))
  const [octalText, setOctalText] = useState(() => modeToOctal(permBits))
  const octalEditingRef = useRef(false)

  const mode = bitsToMode(bits)

  useEffect(() => {
    if (!octalEditingRef.current) setOctalText(modeToOctal(mode))
  }, [mode])

  const handleBitToggle = (index: number): void => {
    octalEditingRef.current = false
    const next = [...bits]
    next[index] = !next[index]
    setBits(next)
  }

  const handleOctalChange = (value: string): void => {
    const filtered = value.replace(/[^0-7]/g, '').slice(0, 3)
    octalEditingRef.current = true
    setOctalText(filtered)
    const parsed = parseOctal(filtered)
    if (parsed >= 0) setBits(modeToBits(parsed))
  }

  const handleOctalBlur = (): void => {
    octalEditingRef.current = false
    setOctalText(modeToOctal(mode))
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t('sftp.chmod.title')}</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            <div />
            {COL_LABELS.map((col) => (
              <div key={col} className={styles.gridHeader}>{col}</div>
            ))}

            {ROW_LABELS.map((row, rowIdx) => (
              <div key={`row-${rowIdx}`} className={styles.gridRow}>
                <div className={styles.gridLabel}>{row}</div>
                {[0, 1, 2].map((colIdx) => {
                  const bitIndex = rowIdx * 3 + colIdx
                  return (
                    <div key={bitIndex} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={bits[bitIndex]}
                        onChange={() => handleBitToggle(bitIndex)}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className={styles.octalRow}>
            <span className={styles.octalLabel}>{t('sftp.chmod.octal')}</span>
            <input
              className={styles.octalInput}
              value={octalText}
              onChange={(e) => handleOctalChange(e.target.value)}
              onBlur={handleOctalBlur}
              maxLength={3}
              placeholder="755"
            />
          </div>

          <div className={styles.preview}>{modeToString(mode)}</div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('common.cancel')}</button>
          <button className={styles.applyBtn} onClick={() => onApply(mode)}>{t('sftp.chmod.apply')}</button>
        </div>
      </div>
    </div>
  )
}
