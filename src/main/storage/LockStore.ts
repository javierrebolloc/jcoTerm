import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface LockData {
  verifySalt: string
  verifyHash: string
  encryptionSalt: string
  iterations: number
}

const ITERATIONS = 100_000
const VERIFY_KEY_LENGTH = 64
const ENCRYPTION_KEY_LENGTH = 32 // AES-256
const DIGEST = 'sha512'

export interface VerifyResult {
  valid: boolean
  encryptionKey?: Buffer
}

export class LockStore {
  private readonly filePath: string
  private cache: LockData | null | undefined = undefined

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'lock.json')
  }

  private read(): LockData | null {
    if (this.cache !== undefined) return this.cache
    try {
      if (!fs.existsSync(this.filePath)) { this.cache = null; return null }
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as LockData
      if (data.verifySalt && data.verifyHash && data.encryptionSalt) {
        this.cache = data
        return data
      }
      // Legacy format (pre-portable) — treat as no password
      this.cache = null
      return null
    } catch {
      this.cache = null
      return null
    }
  }

  private write(data: LockData): void {
    this.cache = data
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, this.filePath)
  }

  private deriveEncryptionKey(password: string, salt: string): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, ENCRYPTION_KEY_LENGTH, DIGEST)
  }

  hasPassword(): boolean {
    return this.read() !== null
  }

  setPassword(password: string): Buffer {
    const verifySalt = crypto.randomBytes(32).toString('hex')
    const verifyHash = crypto.pbkdf2Sync(password, verifySalt, ITERATIONS, VERIFY_KEY_LENGTH, DIGEST).toString('hex')
    const encryptionSalt = crypto.randomBytes(32).toString('hex')
    this.write({ verifySalt, verifyHash, encryptionSalt, iterations: ITERATIONS })
    return this.deriveEncryptionKey(password, encryptionSalt)
  }

  verify(password: string): VerifyResult {
    const data = this.read()
    if (!data) return { valid: false }
    const hash = crypto.pbkdf2Sync(password, data.verifySalt, data.iterations, VERIFY_KEY_LENGTH, DIGEST).toString('hex')
    const valid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(data.verifyHash, 'hex'))
    if (!valid) return { valid: false }
    return { valid: true, encryptionKey: this.deriveEncryptionKey(password, data.encryptionSalt) }
  }
}
