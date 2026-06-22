import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SessionStore } from '../main/storage/SessionStore'
import type { SavedSession } from '../shared/types'

function makeTempPath(): string {
  return path.join(os.tmpdir(), `ssh-ai-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: 'aaaabbbb-0000-4000-a000-000000000001',
    name: 'Test Server',
    host: 'test.example.com',
    port: 22,
    username: 'testuser',
    authMethod: 'password',
    createdAt: 1_000_000,
    ...overrides,
  }
}

describe('SessionStore', () => {
  let tmpFile: string
  let store: SessionStore

  beforeEach(() => {
    tmpFile = makeTempPath()
    store = new SessionStore(tmpFile)
  })

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  })

  describe('list()', () => {
    it('returns empty array when file does not exist', () => {
      expect(store.list()).toEqual([])
    })

    it('returns empty array when file contains invalid JSON', () => {
      fs.writeFileSync(tmpFile, 'not valid json', 'utf-8')
      expect(store.list()).toEqual([])
    })
  })

  describe('save()', () => {
    it('creates the file and saves a session', () => {
      const session = makeSession()
      store.save(session)

      expect(fs.existsSync(tmpFile)).toBe(true)
      const saved = store.list()
      expect(saved).toHaveLength(1)
      expect(saved[0]).toEqual(session)
    })

    it('updates an existing session when id matches', () => {
      const original = makeSession()
      store.save(original)

      const updated = { ...original, name: 'Renamed Server' }
      store.save(updated)

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('Renamed Server')
    })

    it('appends a new session when id is different', () => {
      store.save(makeSession({ id: 'aaaabbbb-0000-4000-a000-000000000001' }))
      store.save(makeSession({ id: 'aaaabbbb-0000-4000-a000-000000000002', name: 'Second' }))
      expect(store.list()).toHaveLength(2)
    })

    it('writes human-readable JSON (indented)', () => {
      store.save(makeSession())
      const raw = fs.readFileSync(tmpFile, 'utf-8')
      expect(raw).toContain('\n')
      expect(raw).toContain('  ')
    })
  })

  describe('delete()', () => {
    it('removes the session with the given id', () => {
      const s1 = makeSession({ id: 'aaaabbbb-0000-4000-a000-000000000001' })
      const s2 = makeSession({ id: 'aaaabbbb-0000-4000-a000-000000000002', name: 'Second' })
      store.save(s1)
      store.save(s2)

      store.delete(s1.id)

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(s2.id)
    })

    it('is a no-op when id does not exist', () => {
      store.save(makeSession())
      store.delete('nonexistent-id')
      expect(store.list()).toHaveLength(1)
    })
  })

  describe('findById()', () => {
    it('returns the session when found', () => {
      const session = makeSession()
      store.save(session)
      expect(store.findById(session.id)).toEqual(session)
    })

    it('returns undefined when not found', () => {
      expect(store.findById('nope')).toBeUndefined()
    })
  })

  describe('setFilePath()', () => {
    it('switches to a new file path', () => {
      const newPath = makeTempPath()
      try {
        store.save(makeSession({ name: 'Original' }))
        store.setFilePath(newPath)
        store.save(makeSession({ id: 'aaaabbbb-0000-4000-a000-000000000099', name: 'New file' }))

        // Original file still intact
        const original = new SessionStore(tmpFile)
        expect(original.list()[0].name).toBe('Original')

        // New file has the new session
        const newStore = new SessionStore(newPath)
        expect(newStore.list()[0].name).toBe('New file')
      } finally {
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath)
      }
    })
  })
})
