import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './LockScreen.module.css'

interface LockScreenProps {
  onUnlocked: () => void
}

export default function LockScreen({ onUnlocked }: LockScreenProps): JSX.Element | null {
  const { t } = useTranslation()
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.electronAPI.app.hasLockPassword().then(setHasPassword)
  }, [])

  useEffect(() => {
    if (hasPassword !== null) inputRef.current?.focus()
  }, [hasPassword])

  if (hasPassword === null) return (
    <div className={styles.lockScreen}>
      <div className={styles.card}>
        <h1 className={styles.appName}>jcoTerm</h1>
      </div>
    </div>
  )

  const handleUnlock = async (): Promise<void> => {
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.app.verifyLockPassword(password)
      if (result.success && result.data?.valid) {
        onUnlocked()
      } else {
        setError(t('lock.wrongPassword'))
        setPassword('')
        inputRef.current?.focus()
      }
    } catch (err) {
      setError((err as Error).message || t('common.connectionError'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (): Promise<void> => {
    setError(null)
    if (password.length < 4) { setError(t('lock.tooShort')); return }
    if (password !== confirmPassword) { setError(t('lock.mismatch')); return }
    setLoading(true)
    try {
      const result = await window.electronAPI.app.setLockPassword(password)
      if (result.success) {
        onUnlocked()
      } else {
        setError(result.error ?? t('common.connectionError'))
      }
    } catch (err) {
      setError((err as Error).message || t('common.connectionError'))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      void (hasPassword ? handleUnlock() : handleCreate())
    }
  }

  return (
    <div className={styles.lockScreen}>
      <div className={styles.card}>
        <h1 className={styles.appName}>jcoTerm</h1>
        <h2 className={styles.title}>
          {hasPassword ? t('lock.title') : t('lock.createTitle')}
        </h2>

        {!hasPassword && (
          <p className={styles.hint}>{t('lock.createHint')}</p>
        )}

        <div className={styles.form} onKeyDown={handleKeyDown}>
          <div className={styles.field}>
            <label htmlFor="lockPassword">
              {hasPassword ? t('lock.password') : t('lock.newPassword')}
            </label>
            <input
              ref={inputRef}
              id="lockPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>

          {!hasPassword && (
            <div className={styles.field}>
              <label htmlFor="lockConfirm">{t('lock.confirmPassword')}</label>
              <input
                id="lockConfirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.submitBtn}
            onClick={() => void (hasPassword ? handleUnlock() : handleCreate())}
            disabled={loading}
          >
            {hasPassword ? t('lock.unlock') : t('lock.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
