import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import { registerFolderHandlers } from '../main/ipc/folder.handlers'
import { IPC } from '../shared/ipc-channels'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock uuid to return a deterministic value ────────────────────────────────

const MOCK_UUID = 'ccccdddd-0000-4000-a000-000000000077'
vi.mock('uuid', () => ({ v4: vi.fn(() => MOCK_UUID) }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureHandler(channel: string): (...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

function makeFolderStore() {
  return {
    list: vi.fn(() => []),
    save: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('folder.handlers', () => {
  beforeAll(() => { setLocale('es') })

  let folderStore: ReturnType<typeof makeFolderStore>

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    folderStore = makeFolderStore()
    registerFolderHandlers(folderStore as never)
  })

  // ── folders:list ────────────────────────────────────────────────────────────

  describe('folders:list', () => {
    it('returns the list from the store', () => {
      const folders = [
        { id: 'f1', name: 'Production' },
        { id: 'f2', name: 'Dev', parentId: 'f1' },
      ]
      folderStore.list.mockReturnValue(folders)
      const handler = captureHandler(IPC.FOLDERS.LIST)
      const result = handler() as { success: boolean; data: unknown[] }
      expect(result.success).toBe(true)
      expect(result.data).toEqual(folders)
    })

    it('returns empty list when store is empty', () => {
      const handler = captureHandler(IPC.FOLDERS.LIST)
      const result = handler() as { success: boolean; data: unknown[] }
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('returns error when store throws', () => {
      folderStore.list.mockImplementation(() => {
        throw new Error('read error')
      })
      const handler = captureHandler(IPC.FOLDERS.LIST)
      const result = handler() as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('read error')
    })
  })

  // ── folders:save ────────────────────────────────────────────────────────────

  describe('folders:save', () => {
    it('generates UUID when folder has no id', () => {
      const handler = captureHandler(IPC.FOLDERS.SAVE)
      const folder = { id: '', name: 'New Folder' }
      const result = handler({}, folder) as { success: boolean }
      expect(result.success).toBe(true)
      expect(folder.id).toBe(MOCK_UUID)
      expect(folderStore.save).toHaveBeenCalledWith(folder)
    })

    it('preserves existing id when provided', () => {
      const handler = captureHandler(IPC.FOLDERS.SAVE)
      const folder = { id: 'existing-id', name: 'Existing' }
      const result = handler({}, folder) as { success: boolean }
      expect(result.success).toBe(true)
      expect(folder.id).toBe('existing-id')
      expect(folderStore.save).toHaveBeenCalledWith(folder)
    })

    it('saves a folder with parentId', () => {
      const handler = captureHandler(IPC.FOLDERS.SAVE)
      const folder = { id: '', name: 'Sub', parentId: 'parent-1' }
      const result = handler({}, folder) as { success: boolean }
      expect(result.success).toBe(true)
      expect(folderStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sub', parentId: 'parent-1' }),
      )
    })

    it('sanitizes folder name for logging', async () => {
      const { log } = await import('../main/logger')
      vi.mocked(log.info).mockClear()
      const handler = captureHandler(IPC.FOLDERS.SAVE)
      const folder = { id: '', name: 'Folder\x00With\x1bControl' }
      handler({}, folder)
      // sanitizeForLog strips control chars, so the log call should have clean name
      expect(log.info).toHaveBeenCalledWith(
        'folders:save id=%s name=%s',
        MOCK_UUID,
        'FolderWithControl',
      )
    })

    it('returns error when store throws', () => {
      folderStore.save.mockImplementation(() => {
        throw new Error('save failed')
      })
      const handler = captureHandler(IPC.FOLDERS.SAVE)
      const folder = { id: '', name: 'Fail' }
      const result = handler({}, folder) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('save failed')
    })
  })

  // ── folders:delete ──────────────────────────────────────────────────────────

  describe('folders:delete', () => {
    it('rejects non-string id', () => {
      const handler = captureHandler(IPC.FOLDERS.DELETE)
      const result = handler({}, 123) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID inválido')
      expect(folderStore.delete).not.toHaveBeenCalled()
    })

    it('rejects empty string id', () => {
      const handler = captureHandler(IPC.FOLDERS.DELETE)
      const result = handler({}, '') as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID inválido')
      expect(folderStore.delete).not.toHaveBeenCalled()
    })

    it('rejects null id', () => {
      const handler = captureHandler(IPC.FOLDERS.DELETE)
      const result = handler({}, null) as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID inválido')
    })

    it('deletes a folder with a valid string id', () => {
      const handler = captureHandler(IPC.FOLDERS.DELETE)
      const result = handler({}, 'folder-abc') as { success: boolean }
      expect(result.success).toBe(true)
      expect(folderStore.delete).toHaveBeenCalledWith('folder-abc')
    })

    it('returns error when store throws during deletion', () => {
      folderStore.delete.mockImplementation(() => {
        throw new Error('delete failed')
      })
      const handler = captureHandler(IPC.FOLDERS.DELETE)
      const result = handler({}, 'some-id') as { success: boolean; error: string }
      expect(result.success).toBe(false)
      expect(result.error).toBe('delete failed')
    })
  })
})
