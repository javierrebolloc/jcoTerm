import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { CredentialStore } from '../main/storage/CredentialStore'

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `ssh-ai-cred-test-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function makeKey(): Buffer {
  return crypto.randomBytes(32)
}

describe('CredentialStore', () => {
  let tmpDir: string
  let store: CredentialStore
  let key: Buffer

  beforeEach(() => {
    tmpDir = makeTempDir()
    key = makeKey()
    store = new CredentialStore(tmpDir)
    store.setEncryptionKey(key)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const SESSION_ID = 'aaaabbbb-0000-4000-a000-000000000001'

  describe('hasCredential()', () => {
    it('returns false when nothing is stored', () => {
      expect(store.hasCredential(SESSION_ID)).toBe(false)
    })

    it('returns true after saving a password', () => {
      store.savePassword(SESSION_ID, 'mypassword')
      expect(store.hasCredential(SESSION_ID)).toBe(true)
    })
  })

  describe('savePassword() + getCredential()', () => {
    it('roundtrips a password through encrypt/decrypt', () => {
      store.savePassword(SESSION_ID, 'supersecret')
      const cred = store.getCredential(SESSION_ID)
      expect(cred).not.toBeNull()
      expect(cred!.type).toBe('password')
      if (cred!.type === 'password') {
        expect(cred!.password).toBe('supersecret')
      }
    })

    it('does not store the plaintext password in the JSON file', () => {
      store.savePassword(SESSION_ID, 'supersecret')
      const raw = fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8')
      expect(raw).not.toContain('supersecret')
    })

    it('returns null for an unknown session', () => {
      expect(store.getCredential('unknown-id')).toBeNull()
    })
  })

  describe('savePrivateKey() + getCredential()', () => {
    const FAKE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----'

    it('roundtrips a private key', () => {
      store.savePrivateKey(SESSION_ID, FAKE_KEY)
      const cred = store.getCredential(SESSION_ID)
      expect(cred?.type).toBe('privateKey')
      if (cred?.type === 'privateKey') {
        expect(cred.privateKey).toBe(FAKE_KEY)
        expect(cred.passphrase).toBeUndefined()
      }
    })

    it('roundtrips a private key with passphrase', () => {
      store.savePrivateKey(SESSION_ID, FAKE_KEY, 'mypass')
      const cred = store.getCredential(SESSION_ID)
      if (cred?.type === 'privateKey') {
        expect(cred.passphrase).toBe('mypass')
      }
    })

    it('does not store the private key in plaintext', () => {
      store.savePrivateKey(SESSION_ID, FAKE_KEY)
      const raw = fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8')
      expect(raw).not.toContain('BEGIN RSA PRIVATE KEY')
    })
  })

  describe('deleteCredential()', () => {
    it('removes the stored credential', () => {
      store.savePassword(SESSION_ID, 'pass')
      store.deleteCredential(SESSION_ID)
      expect(store.hasCredential(SESSION_ID)).toBe(false)
      expect(store.getCredential(SESSION_ID)).toBeNull()
    })

    it('is a no-op when credential does not exist', () => {
      expect(() => store.deleteCredential('nonexistent')).not.toThrow()
    })
  })

  describe('encryption key lifecycle', () => {
    it('throws when no encryption key is set', () => {
      const noKeyStore = new CredentialStore(tmpDir)
      expect(() => noKeyStore.savePassword(SESSION_ID, 'pass')).toThrow('Encryption key not available')
    })

    it('cannot decrypt with a different key', () => {
      store.savePassword(SESSION_ID, 'secret')
      const store2 = new CredentialStore(tmpDir)
      store2.setEncryptionKey(crypto.randomBytes(32))
      expect(store2.getCredential(SESSION_ID)).toBeNull()
    })

    it('wipeCredentials removes all stored credentials', () => {
      store.savePassword(SESSION_ID, 'pass')
      store.wipeCredentials()
      expect(store.hasCredential(SESSION_ID)).toBe(false)
      expect(fs.existsSync(path.join(tmpDir, 'credentials.json'))).toBe(false)
    })
  })
})
