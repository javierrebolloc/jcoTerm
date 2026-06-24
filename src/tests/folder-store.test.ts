import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SavedFolder } from '../shared/types'

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
import { FolderStore } from '../main/storage/FolderStore'

function makeFolder(overrides: Partial<SavedFolder> = {}): SavedFolder {
  return {
    id: 'folder-001',
    name: 'Development',
    ...overrides,
  }
}

describe('FolderStore', () => {
  let store: FolderStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: file does not exist
    vi.mocked(fs.existsSync).mockReturnValue(false)
    store = new FolderStore('/test/sessions')
  })

  describe('list()', () => {
    it('returns empty array when file does not exist', () => {
      expect(store.list()).toEqual([])
    })

    it('returns folders from existing file', () => {
      const folders = [makeFolder()]
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(folders))
      store = new FolderStore('/test/sessions')

      expect(store.list()).toEqual(folders)
    })
  })

  describe('save()', () => {
    it('saves a new folder', () => {
      const folder = makeFolder()
      store.save(folder)

      expect(fs.mkdirSync).toHaveBeenCalled()
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        expect.stringContaining('"Development"'),
        expect.objectContaining({ encoding: 'utf-8' }),
      )
      expect(fs.renameSync).toHaveBeenCalled()
    })

    it('updates an existing folder when id matches', () => {
      const folder = makeFolder()
      store.save(folder)

      const updated = { ...folder, name: 'Production' }
      store.save(updated)

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('Production')
    })

    it('appends a new folder when id differs', () => {
      store.save(makeFolder({ id: 'folder-001', name: 'Dev' }))
      store.save(makeFolder({ id: 'folder-002', name: 'Staging' }))

      expect(store.list()).toHaveLength(2)
    })

    it('saves folder with parentId', () => {
      const folder = makeFolder({ parentId: 'folder-parent' })
      store.save(folder)

      const found = store.findById('folder-001')
      expect(found?.parentId).toBe('folder-parent')
    })
  })

  describe('delete()', () => {
    it('removes the folder with the given id', () => {
      store.save(makeFolder({ id: 'folder-001' }))
      store.save(makeFolder({ id: 'folder-002', name: 'Other' }))

      store.delete('folder-001')

      const list = store.list()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('folder-002')
    })

    it('is a no-op when id does not exist', () => {
      store.save(makeFolder())
      store.delete('nonexistent')
      expect(store.list()).toHaveLength(1)
    })
  })

  describe('findById()', () => {
    it('returns the folder when found', () => {
      const folder = makeFolder()
      store.save(folder)
      expect(store.findById('folder-001')).toEqual(folder)
    })

    it('returns undefined when not found', () => {
      expect(store.findById('nonexistent')).toBeUndefined()
    })
  })

  describe('corrupt JSON backup', () => {
    it('backs up corrupt file and returns empty array', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON{{{')
      store = new FolderStore('/test/sessions')

      const result = store.list()
      expect(result).toEqual([])
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('folders.json'),
        expect.stringContaining('folders.json.backup'),
      )
    })

    it('returns empty array even when backup fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('corrupt')
      vi.mocked(fs.copyFileSync).mockImplementation(() => { throw new Error('backup failed') })
      store = new FolderStore('/test/sessions')

      expect(store.list()).toEqual([])
    })
  })
})
