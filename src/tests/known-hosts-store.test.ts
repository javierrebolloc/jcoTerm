import { describe, it, expect, beforeEach, vi } from 'vitest'

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
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}))

import fs from 'fs'
import { KnownHostsStore } from '../main/storage/KnownHostsStore'

describe('KnownHostsStore', () => {
  let store: KnownHostsStore

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    store = new KnownHostsStore('/test/userData')
  })

  describe('lookup()', () => {
    it('returns null for unknown host when file does not exist', () => {
      expect(store.lookup('example.com', 22)).toBeNull()
    })

    it('returns null for unknown host when file exists but is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      store = new KnownHostsStore('/test/userData')

      expect(store.lookup('example.com', 22)).toBeNull()
    })

    it('returns fingerprint for known host', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { host: 'example.com', port: 22, fingerprint: 'SHA256:abc123', addedAt: '2024-01-01T00:00:00.000Z' },
      ]))
      store = new KnownHostsStore('/test/userData')

      expect(store.lookup('example.com', 22)).toBe('SHA256:abc123')
    })

    it('distinguishes hosts by port', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { host: 'example.com', port: 22, fingerprint: 'SHA256:abc', addedAt: '2024-01-01T00:00:00.000Z' },
        { host: 'example.com', port: 2222, fingerprint: 'SHA256:xyz', addedAt: '2024-01-01T00:00:00.000Z' },
      ]))
      store = new KnownHostsStore('/test/userData')

      expect(store.lookup('example.com', 22)).toBe('SHA256:abc')
      expect(store.lookup('example.com', 2222)).toBe('SHA256:xyz')
    })
  })

  describe('add()', () => {
    it('adds a new host entry and writes to file', () => {
      store.add('example.com', 22, 'SHA256:abc123')

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('"SHA256:abc123"'),
        'utf-8',
      )
      expect(fs.renameSync).toHaveBeenCalled()
    })

    it('makes the host lookupable after adding', () => {
      store.add('example.com', 22, 'SHA256:abc123')
      expect(store.lookup('example.com', 22)).toBe('SHA256:abc123')
    })

    it('overwrites existing host entry with same host and port', () => {
      store.add('example.com', 22, 'SHA256:old')
      store.add('example.com', 22, 'SHA256:new')

      expect(store.lookup('example.com', 22)).toBe('SHA256:new')
      // After two adds with the same host:port, there should be exactly 1 entry
      // The second add filters out the existing entry, then pushes the new one
      // Verify by checking writeFileSync was called with only one entry
      const lastWriteCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1)
      const written = JSON.parse(lastWriteCall![1] as string)
      expect(written).toHaveLength(1)
      expect(written[0].fingerprint).toBe('SHA256:new')
    })
  })

  describe('verify()', () => {
    it('returns "unknown" for a host not in the store', () => {
      expect(store.verify('example.com', 22, 'SHA256:abc')).toBe('unknown')
    })

    it('returns "match" when fingerprint matches', () => {
      store.add('example.com', 22, 'SHA256:abc123')
      expect(store.verify('example.com', 22, 'SHA256:abc123')).toBe('match')
    })

    it('returns "mismatch" when fingerprint differs', () => {
      store.add('example.com', 22, 'SHA256:abc123')
      expect(store.verify('example.com', 22, 'SHA256:different')).toBe('mismatch')
    })

    it('returns "unknown" for different port even if host matches', () => {
      store.add('example.com', 22, 'SHA256:abc123')
      expect(store.verify('example.com', 2222, 'SHA256:abc123')).toBe('unknown')
    })
  })

  describe('corrupt file handling', () => {
    it('returns null for lookup when file contains invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON')
      store = new KnownHostsStore('/test/userData')

      expect(store.lookup('example.com', 22)).toBeNull()
    })
  })

  describe('caching', () => {
    it('only reads file once across multiple lookups', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      store = new KnownHostsStore('/test/userData')

      store.lookup('a.com', 22)
      store.lookup('b.com', 22)
      store.lookup('c.com', 22)

      expect(fs.readFileSync).toHaveBeenCalledTimes(1)
    })
  })
})
