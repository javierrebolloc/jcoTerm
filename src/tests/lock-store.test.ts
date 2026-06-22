import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { LockStore } from '../main/storage/LockStore'

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `ssh-ai-lock-test-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

describe('LockStore', () => {
  let tmpDir: string
  let store: LockStore

  beforeEach(() => {
    tmpDir = makeTempDir()
    store = new LockStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('hasPassword returns false when no password set', () => {
    expect(store.hasPassword()).toBe(false)
  })

  it('hasPassword returns true after setPassword', () => {
    store.setPassword('mypassword')
    expect(store.hasPassword()).toBe(true)
  })

  it('verify returns valid:true for correct password', () => {
    store.setPassword('correctpassword')
    expect(store.verify('correctpassword').valid).toBe(true)
  })

  it('verify returns valid:false for wrong password', () => {
    store.setPassword('correctpassword')
    expect(store.verify('wrongpassword').valid).toBe(false)
  })

  it('verify returns valid:false when no password set', () => {
    expect(store.verify('anything').valid).toBe(false)
  })

  it('password hash persists across instances', () => {
    store.setPassword('persistent')
    const store2 = new LockStore(tmpDir)
    expect(store2.hasPassword()).toBe(true)
    expect(store2.verify('persistent').valid).toBe(true)
  })

  it('setPassword overwrites previous password', () => {
    store.setPassword('first')
    store.setPassword('second')
    expect(store.verify('first').valid).toBe(false)
    expect(store.verify('second').valid).toBe(true)
  })

  it('creates lock.json file in user data path', () => {
    store.setPassword('test')
    expect(fs.existsSync(path.join(tmpDir, 'lock.json'))).toBe(true)
  })

  it('stored data contains salts and hash, not plaintext', () => {
    store.setPassword('secret')
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'lock.json'), 'utf-8'))
    expect(raw.verifySalt).toBeDefined()
    expect(raw.verifyHash).toBeDefined()
    expect(raw.encryptionSalt).toBeDefined()
    expect(raw.iterations).toBeDefined()
    expect(JSON.stringify(raw)).not.toContain('secret')
  })

  it('different passwords produce different hashes', () => {
    store.setPassword('passwordA')
    const rawA = JSON.parse(fs.readFileSync(path.join(tmpDir, 'lock.json'), 'utf-8'))
    store.setPassword('passwordB')
    const rawB = JSON.parse(fs.readFileSync(path.join(tmpDir, 'lock.json'), 'utf-8'))
    expect(rawA.verifyHash).not.toBe(rawB.verifyHash)
  })

  describe('encryption key derivation', () => {
    it('setPassword returns a 32-byte encryption key', () => {
      const key = store.setPassword('test')
      expect(Buffer.isBuffer(key)).toBe(true)
      expect(key.length).toBe(32)
    })

    it('verify returns an encryption key on success', () => {
      store.setPassword('test')
      const result = store.verify('test')
      expect(result.valid).toBe(true)
      expect(result.encryptionKey).toBeDefined()
      expect(result.encryptionKey!.length).toBe(32)
    })

    it('verify does not return encryption key on failure', () => {
      store.setPassword('test')
      const result = store.verify('wrong')
      expect(result.valid).toBe(false)
      expect(result.encryptionKey).toBeUndefined()
    })

    it('setPassword and verify derive the same encryption key', () => {
      const keyFromSet = store.setPassword('mypassword')
      const result = store.verify('mypassword')
      expect(result.encryptionKey!.equals(keyFromSet)).toBe(true)
    })

    it('changing password produces a different encryption key', () => {
      const key1 = store.setPassword('first')
      const key2 = store.setPassword('second')
      expect(key1.equals(key2)).toBe(false)
    })
  })
})
