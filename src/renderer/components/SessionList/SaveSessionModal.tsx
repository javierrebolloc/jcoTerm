import { useState, useEffect } from 'react'
import type { AuthMethod, NamedCredential, SavedFolder, SavedSessionWithStatus } from '../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './SaveSessionModal.module.css'

interface SaveSessionModalProps {
  initialSession?: SavedSessionWithStatus
  defaultFolderId?: string
  onSaved: () => void
  onClose: () => void
}

export default function SaveSessionModal({
  initialSession,
  defaultFolderId,
  onSaved,
  onClose,
}: SaveSessionModalProps): JSX.Element {
  const isEdit = Boolean(initialSession)
  const { t } = useTranslation()
  const trapRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const [name, setName] = useState(initialSession?.name ?? '')
  const [host, setHost] = useState(initialSession?.host ?? '')
  const [port, setPort] = useState(String(initialSession?.port ?? 22))
  const [username, setUsername] = useState(initialSession?.username ?? '')
  const [authMethod, setAuthMethod] = useState<AuthMethod>(initialSession?.authMethod ?? 'password')
  const [namedCredentialId, setNamedCredentialId] = useState(initialSession?.namedCredentialId ?? '')
  const [folderId, setFolderId] = useState(initialSession?.folderId ?? defaultFolderId ?? '')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [saveDirectKey, setSaveDirectKey] = useState(false)

  const [credentials, setCredentials] = useState<NamedCredential[]>([])
  const [folders, setFolders] = useState<SavedFolder[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      window.electronAPI.credentials.list(),
      window.electronAPI.folders.list(),
    ]).then(([credRes, folderRes]) => {
      if (credRes.success && credRes.data) setCredentials(credRes.data)
      if (folderRes.success && folderRes.data) setFolders(folderRes.data)
    })
  }, [])

  const handleKeyFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setPrivateKey(ev.target.result)
    }
    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!host.trim()) { setError(t('session.save.hostRequired')); return }

    setSaving(true)
    setError(null)

    const session = {
      id: initialSession?.id ?? crypto.randomUUID(),
      name: name.trim() || `${host.trim()}:${port}`,
      host: host.trim(),
      port: parseInt(port, 10),
      username: username.trim(),
      authMethod,
      createdAt: initialSession?.createdAt ?? Date.now(),
      namedCredentialId: namedCredentialId || undefined,
      folderId: folderId || undefined,
      sortOrder: initialSession?.sortOrder,
    }

    const saveKey = authMethod === 'privateKey' && saveDirectKey && !!privateKey

    try {
      const result = await window.electronAPI.sessions.save({
        session,
        saveCredential: saveKey,
        credentials: saveKey ? { privateKey, passphrase: passphrase || undefined } : undefined,
      })
      if (!result.success) throw new Error(result.error)
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} ref={trapRef}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{isEdit ? t('session.save.titleEdit') : t('session.save.titleNew')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
          <div className={styles.field}>
            <label>{t('session.save.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('session.save.namePlaceholder')}
              autoFocus
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label>{t('session.save.host')}</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                required
              />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label>{t('session.save.port')}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                min="1" max="65535"
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>{t('session.save.auth')}</label>
            <select value={authMethod} onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}>
              <option value="password">{t('session.save.authPassword')}</option>
              <option value="privateKey">{t('session.save.authPrivateKey')}</option>
              <option value="agent">{t('session.save.authAgent')}</option>
            </select>
          </div>

          {authMethod === 'password' && (
            <div className={styles.field}>
              <label>{t('session.save.credential')}</label>
              <select
                value={namedCredentialId}
                onChange={(e) => setNamedCredentialId(e.target.value)}
              >
                <option value="">{t('session.save.credentialNone')}</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.username})
                  </option>
                ))}
              </select>
              {credentials.length === 0 && (
                <p className={styles.hint}>
                  {t('session.save.credentialHint')}
                </p>
              )}
            </div>
          )}

          {authMethod === 'agent' && (
            <div className={styles.field}>
              <label>{t('session.save.sshUser')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                required
              />
              <p className={styles.hint}>
                {t('session.save.agentHint')}
              </p>
            </div>
          )}

          {authMethod === 'privateKey' && (
            <>
              <div className={styles.field}>
                <label>{t('session.save.sshUser')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root"
                  required={authMethod === 'privateKey'}
                />
              </div>
              <div className={styles.field}>
                <label>{t('session.save.privateKey')}</label>
                <input type="file" accept=".pem,.key,*" onChange={handleKeyFile} />
              </div>
              {privateKey && <p className={styles.keyLoaded}>✓ {t('session.save.keyLoaded')}</p>}
              <div className={styles.field}>
                <label>{t('session.save.passphrase')}</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
              {privateKey && (
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={saveDirectKey}
                    onChange={(e) => setSaveDirectKey(e.target.checked)}
                  />
                  {t('session.save.saveEncrypted')}
                </label>
              )}
            </>
          )}

          {folders.length > 0 && (
            <div className={styles.field}>
              <label>{t('session.save.folder')}</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">{t('session.save.noFolder')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? t('common.saving') : isEdit ? t('common.update') : t('common.saveSession')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
