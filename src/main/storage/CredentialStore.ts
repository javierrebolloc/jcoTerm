import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { log } from '../logger'

interface StoredCredential {
  type: 'password' | 'privateKey'
  encryptedData: string
  encryptedPassphrase?: string
}

interface CredentialsFile {
  credentials: Record<string, StoredCredential>
}

export type DecryptedCredential =
  | { type: 'password'; password: string }
  | { type: 'privateKey'; privateKey: string; passphrase?: string }

export class CredentialStore {
  private readonly filePath: string
  private cache: CredentialsFile | null = null
  private encryptionKey: Buffer | null = null

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'credentials.json')
  }

  setEncryptionKey(key: Buffer): void {
    this.encryptionKey = key
  }

  clearEncryptionKey(): void {
    if (this.encryptionKey) {
      this.encryptionKey.fill(0)
      this.encryptionKey = null
    }
  }

  wipeCredentials(): void {
    this.cache = { credentials: {} }
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
    } catch { /* best effort */ }
  }

  private read(): CredentialsFile {
    if (this.cache) return this.cache
    try {
      if (!fs.existsSync(this.filePath)) { this.cache = { credentials: {} }; return this.cache }
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as CredentialsFile
      return this.cache
    } catch {
      this.cache = { credentials: {} }
      return this.cache
    }
  }

  private write(data: CredentialsFile): void {
    this.cache = data
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, this.filePath)
  }

  private encrypt(value: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not available — unlock the app first')
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  private decrypt(base64: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not available — unlock the app first')
    const data = Buffer.from(base64, 'base64')
    const iv = data.subarray(0, 12)
    const authTag = data.subarray(12, 28)
    const encrypted = data.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  }

  savePassword(sessionId: string, password: string): void {
    const data = this.read()
    data.credentials[sessionId] = { type: 'password', encryptedData: this.encrypt(password) }
    this.write(data)
  }

  savePrivateKey(sessionId: string, privateKey: string, passphrase?: string): void {
    const stored: StoredCredential = {
      type: 'privateKey',
      encryptedData: this.encrypt(privateKey),
    }
    if (passphrase) stored.encryptedPassphrase = this.encrypt(passphrase)

    const data = this.read()
    data.credentials[sessionId] = stored
    this.write(data)
  }

  getCredential(sessionId: string): DecryptedCredential | null {
    const stored = this.read().credentials[sessionId]
    if (!stored) return null

    try {
      const decrypted = this.decrypt(stored.encryptedData)
      if (stored.type === 'password') {
        return { type: 'password', password: decrypted }
      }
      const passphrase = stored.encryptedPassphrase
        ? this.decrypt(stored.encryptedPassphrase)
        : undefined
      return { type: 'privateKey', privateKey: decrypted, passphrase }
    } catch (err) {
      log.warn('[creds] Decryption failed for id=%s: %s', sessionId, (err as Error).message)
      return null
    }
  }

  hasCredential(sessionId: string): boolean {
    return sessionId in this.read().credentials
  }

  deleteCredential(sessionId: string): void {
    const data = this.read()
    delete data.credentials[sessionId]
    this.write(data)
  }
}
