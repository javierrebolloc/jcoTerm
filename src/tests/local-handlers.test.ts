import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import { registerLocalHandlers } from '../main/ipc/local.handlers'
import { IPC } from '../shared/ipc-channels'
import type { IpcResult, LocalEntry } from '../shared/types'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock fs/promises ─────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
  },
}))

// ── Mock os ──────────────────────────────────────────────────────────────────

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => 'C:\\Users\\testuser'),
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureHandler(channel: string): (...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

const mockReaddir = vi.mocked(fs.readdir)
const mockStat = vi.mocked(fs.stat)
const mockAccess = vi.mocked(fs.access)

// ── Tests ────────────────────────────────────────────────────────────────────

describe('local.handlers', () => {
  beforeAll(() => { setLocale('es') })

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    mockReaddir.mockReset()
    mockStat.mockReset()
    mockAccess.mockReset()
    registerLocalHandlers()
  })

  // ── local:listDir ──────────────────────────────────────────────────────────

  describe('local:listDir', () => {
    it('returns sorted entries with directories first', async () => {
      mockReaddir.mockResolvedValue([
        { name: 'file.txt', isFile: () => true, isDirectory: () => false },
        { name: 'docs', isFile: () => false, isDirectory: () => true },
        { name: 'alpha.js', isFile: () => true, isDirectory: () => false },
      ] as never)
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => false, size: 1024, mtimeMs: 1700000000000 } as never)
        .mockResolvedValueOnce({ isDirectory: () => true, size: 4096, mtimeMs: 1700000100000 } as never)
        .mockResolvedValueOnce({ isDirectory: () => false, size: 256, mtimeMs: 1700000200000 } as never)

      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\Users\\testuser\\projects')) as IpcResult<LocalEntry[]>
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(3)
      // Directories come first
      expect(result.data![0].name).toBe('docs')
      expect(result.data![0].isDirectory).toBe(true)
      // Then files sorted alphabetically
      expect(result.data![1].name).toBe('alpha.js')
      expect(result.data![2].name).toBe('file.txt')
    })

    it('handles ENOENT error', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'))
      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\nonexistent')) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Directorio no encontrado')
    })

    it('handles EACCES error', async () => {
      mockReaddir.mockRejectedValue(new Error('EACCES: permission denied'))
      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\protected')) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Permiso denegado')
    })

    it('rejects null bytes in path', async () => {
      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\tmp\\\0evil')) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta local inválida')
    })

    it('rejects empty path', async () => {
      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, '')) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta local inválida')
    })

    it('rejects non-string path', async () => {
      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, null)) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta local inválida')
    })

    it('skips entries that fail stat', async () => {
      mockReaddir.mockResolvedValue([
        { name: 'good.txt', isFile: () => true, isDirectory: () => false },
        { name: 'broken-link', isFile: () => false, isDirectory: () => false },
      ] as never)
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => false, size: 100, mtimeMs: 1700000000000 } as never)
        .mockRejectedValueOnce(new Error('ENOENT: broken symlink'))

      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\Users\\testuser')) as IpcResult<LocalEntry[]>
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].name).toBe('good.txt')
    })

    it('converts mtimeMs to seconds', async () => {
      mockReaddir.mockResolvedValue([
        { name: 'file.txt', isFile: () => true, isDirectory: () => false },
      ] as never)
      mockStat.mockResolvedValueOnce({
        isDirectory: () => false,
        size: 512,
        mtimeMs: 1700000000000,
      } as never)

      const handler = captureHandler(IPC.LOCAL.LIST_DIR)
      const result = (await handler({}, 'C:\\tmp')) as IpcResult<LocalEntry[]>
      expect(result.success).toBe(true)
      expect(result.data![0].modified).toBe(1700000000)
    })
  })

  // ── local:homePath ─────────────────────────────────────────────────────────

  describe('local:homePath', () => {
    it('returns os.homedir()', () => {
      const handler = captureHandler(IPC.LOCAL.HOME_PATH)
      const result = handler() as IpcResult<string>
      expect(result.success).toBe(true)
      expect(result.data).toBe('C:\\Users\\testuser')
      expect(os.homedir).toHaveBeenCalled()
    })
  })

  // ── local:drives ───────────────────────────────────────────────────────────

  describe('local:drives', () => {
    it('returns accessible drive letters on Windows', async () => {
      // Mock platform as win32
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      // Only C: and D: are accessible
      mockAccess.mockImplementation((letter: unknown) => {
        const l = letter as string
        if (l === 'C:\\' || l === 'D:\\') return Promise.resolve()
        return Promise.reject(new Error('ENOENT'))
      })

      const handler = captureHandler(IPC.LOCAL.DRIVES)
      const result = (await handler()) as IpcResult<string[]>
      expect(result.success).toBe(true)
      expect(result.data).toContain('C:\\')
      expect(result.data).toContain('D:\\')
      expect(result.data!.length).toBeGreaterThanOrEqual(2)

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('skips inaccessible drives', async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      // All drives inaccessible
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const handler = captureHandler(IPC.LOCAL.DRIVES)
      const result = (await handler()) as IpcResult<string[]>
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })
  })
})
