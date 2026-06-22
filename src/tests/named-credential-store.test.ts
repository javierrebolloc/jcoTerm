import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NamedCredential } from '../shared/types'

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
}))

import fs from 'fs'
import { NamedCredentialStore } from '../main/storage/NamedCredentialStore'

function makeCred(overrides: Partial<NamedCredential> = {}): NamedCredential {
  return {
    id: 'cred-001',
    label: 'Work SSH',
    username: 'admin',
    ...overrides,
  }
}

describe('NamedCredentialStore', () => {
  let store: NamedCredentialStore

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    store = new NamedCredentialStore('/test/sessions')
  })

  describe('list()', () => {
    it('returns empty array when file does not exist', () => {
      expect(store.list()).toEqual([])
    })

    it('returns credentials from existing file', () => {
      const creds = [makeCred()]
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(creds))
      store = new NamedCredentialStore('/test/sessions')

      expect(store.list()).toEqual(creds)
    })

    it('returns empty array for empty JSON array', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      store = new NamedCredentialStore('/test/sessions')

      expect(store.list()).toEqual([])
    })
  })

  describe('save()', () => {
    it('saves a new credential', () => {
      const cred = makeCred()
      store.save(cred)

      expect(fs.mkdirSync).toHaveBeenCalled()
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('"Work SSH"'),
        'utf-8',
      )
      expect(fs.renameSync).toHaveBeenCalled()
    })

    it('updates an existing credential when id matches', () => {
      store.save(makeCred())
      store.save(makeCred({ label: 'Personal SSH' }))

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].label).toBe('Personal SSH')
    })

    it('appends when id differs', () => {
      store.save(makeCred({ id: 'cred-001' }))
      store.save(makeCred({ id: 'cred-002', label: 'Other' }))

      expect(store.list()).toHaveLength(2)
    })
  })

  describe('delete()', () => {
    it('removes the credential with the given id', () => {
      store.save(makeCred({ id: 'cred-001' }))
      store.save(makeCred({ id: 'cred-002', label: 'Other' }))

      store.delete('cred-001')

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('cred-002')
    })

    it('is a no-op when id does not exist', () => {
      store.save(makeCred())
      store.delete('nonexistent')
      expect(store.list()).toHaveLength(1)
    })
  })

  describe('findById()', () => {
    it('returns the credential when found', () => {
      const cred = makeCred()
      store.save(cred)
      expect(store.findById('cred-001')).toEqual(cred)
    })

    it('returns undefined when not found', () => {
      expect(store.findById('nonexistent')).toBeUndefined()
    })
  })

  describe('corrupt / empty file', () => {
    it('handles corrupt JSON with backup', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid json')
      store = new NamedCredentialStore('/test/sessions')

      expect(store.list()).toEqual([])
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('named-credentials.json'),
        expect.stringContaining('named-credentials.json.backup'),
      )
    })
  })
})
