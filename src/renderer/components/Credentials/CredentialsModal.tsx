import { useState, useEffect } from 'react'
import type { NamedCredential } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useConfirm } from '../../hooks/useConfirm'
import styles from './CredentialsModal.module.css'

// ── Credential form (create / edit) ──────────────────────────────────────────

interface CredentialFormProps {
  initial?: NamedCredential
  onSaved: () => void
  onBack: () => void
}

function CredentialForm({ initial, onSaved, onBack }: CredentialFormProps): JSX.Element {
  const { t } = useTranslation()
  const isEdit = Boolean(initial)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!label.trim()) { setError(t('credentials.form.nameRequired')); return }
    if (!username.trim()) { setError(t('credentials.form.userRequired')); return }
    if (!isEdit && !password) { setError(t('credentials.form.passwordRequired')); return }

    setSaving(true)
    setError(null)
    const result = await window.electronAPI.credentials.save({
      credential: { id: initial?.id ?? '', label: label.trim(), username: username.trim() },
      password: password || undefined,
    })
    setSaving(false)

    if (result.success) {
      onSaved()
    } else {
      setError(result.error ?? t('credentials.form.saveError'))
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
      <label className={styles.fieldLabel}>
        {t('credentials.form.name')}
        <input
          className={styles.input}
          type="text"
          value={label}
          onChange={(e) => { setLabel(e.target.value); setError(null) }}
          placeholder={t('credentials.form.namePlaceholder')}
          autoFocus
        />
      </label>

      <label className={styles.fieldLabel}>
        {t('credentials.form.sshUser')}
        <input
          className={styles.input}
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(null) }}
          placeholder="root"
          autoComplete="off"
        />
      </label>

      <label className={styles.fieldLabel}>
        {t('credentials.form.password')}{isEdit && <span className={styles.optional}>{t('credentials.form.passwordEditHint')}</span>}
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          placeholder={isEdit ? '••••••••' : '••••••••'}
          autoComplete="new-password"
        />
      </label>

      <p className={styles.hint}>{t('credentials.form.dpapi')}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onBack}>
          {t('common.cancel')}
        </button>
        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? t('common.saving') : isEdit ? t('common.saveChanges') : t('common.createCredential')}
        </button>
      </div>
    </form>
  )
}

// ── Credential row ────────────────────────────────────────────────────────────

interface CredentialRowProps {
  credential: NamedCredential
  onEdit: (c: NamedCredential) => void
  onDelete: (id: string) => void
}

function CredentialRow({ credential, onEdit, onDelete }: CredentialRowProps): JSX.Element {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  return (
    <div className={styles.row}>
      <div className={styles.rowInfo}>
        <span className={styles.rowLabel}>🔑 {credential.label}</span>
        <span className={styles.rowUsername}>{credential.username}</span>
      </div>
      <div className={styles.rowActions}>
        <button
          className={styles.rowBtn}
          onClick={() => onEdit(credential)}
          title={t('common.edit')}
        >✎</button>
        <button
          className={`${styles.rowBtn} ${styles.deleteBtn}`}
          onClick={() => {
            void confirmDialog(t('credentials.deleteConfirm', { label: credential.label }), true).then((ok) => { if (ok) onDelete(credential.id) })
          }}
          title={t('common.delete')}
        >✕</button>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

type View = { mode: 'list' } | { mode: 'form'; editing?: NamedCredential }

interface CredentialsModalProps {
  onClose: () => void
}

export default function CredentialsModal({ onClose }: CredentialsModalProps): JSX.Element {
  const { t } = useTranslation()
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [credentials, setCredentials] = useState<NamedCredential[]>([])
  const [view, setView] = useState<View>({ mode: 'list' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const refresh = async (): Promise<void> => {
    const r = await window.electronAPI.credentials.list()
    if (r.success && r.data) setCredentials(r.data)
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  const handleDelete = async (id: string): Promise<void> => {
    await window.electronAPI.credentials.delete(id)
    await refresh()
  }

  const handleSaved = async (): Promise<void> => {
    await refresh()
    setView({ mode: 'list' })
  }

  const inForm = view.mode === 'form'
  const editing = inForm ? view.editing : undefined

  return (
    <div className={styles.overlay} ref={trapRef}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {inForm && (
              <button className={styles.backBtn} onClick={() => setView({ mode: 'list' })}>
                ←
              </button>
            )}
            <h2 className={styles.title}>
              {inForm ? (editing ? t('credentials.editTitle', { label: editing.label }) : t('credentials.newTitle')) : t('credentials.title')}
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {view.mode === 'list' ? (
            <>
              {loading && <p className={styles.empty}>{t('common.loading')}</p>}

              {!loading && credentials.length === 0 && (
                <p className={styles.empty}>{t('credentials.empty')}</p>
              )}

              {credentials.map((c) => (
                <CredentialRow
                  key={c.id}
                  credential={c}
                  onEdit={(cred) => setView({ mode: 'form', editing: cred })}
                  onDelete={(id) => void handleDelete(id)}
                />
              ))}

              <div className={styles.listFooter}>
                <button
                  className={styles.newBtn}
                  onClick={() => setView({ mode: 'form' })}
                >
                  {t('credentials.create')}
                </button>
              </div>
            </>
          ) : (
            <CredentialForm
              initial={editing}
              onSaved={() => void handleSaved()}
              onBack={() => setView({ mode: 'list' })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
