import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { ipcMain } from 'electron'
import { registerSftpHandlers } from '../main/ipc/sftp.handlers'
import { IPC } from '../shared/ipc-channels'
import type { SshManager } from '../main/ssh/SshManager'
import type { IpcResult, SftpStatResult, SftpEntry } from '../shared/types'
import { setLocale } from '../shared/i18n'

// ── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock uuid to return a deterministic value ────────────────────────────────

const MOCK_UUID = 'aaaabbbb-0000-4000-a000-000000000099'
vi.mock('uuid', () => ({ v4: vi.fn(() => MOCK_UUID) }))

// ── Helpers ──────────────────────────────────────────────────────────────────

function captureHandler(channel: string): (...args: unknown[]) => unknown {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

const VALID_SESSION_ID = '11112222-3333-4444-8888-aabbccddeeff'

function makeMockSession() {
  return {
    listDir: vi.fn(),
    realpath: vi.fn(),
    sftpStat: vi.fn(),
    sftpMkdir: vi.fn(),
    sftpRmdir: vi.fn(),
    sftpUnlink: vi.fn(),
    sftpRename: vi.fn(),
    sftpChmod: vi.fn(),
    sftpDownload: vi.fn(),
    sftpUpload: vi.fn(),
  }
}

function makeMockEvent() {
  return { sender: { send: vi.fn(), isDestroyed: () => false } }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sftp.handlers', () => {
  beforeAll(() => { setLocale('es') })

  let mockSession: ReturnType<typeof makeMockSession>
  let mockManager: SshManager

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    mockSession = makeMockSession()
    mockManager = {
      getSession: vi.fn(() => mockSession),
    } as unknown as SshManager
    registerSftpHandlers(mockManager)
  })

  // ── withSftpSession middleware ──────────────────────────────────────────────

  describe('withSftpSession middleware', () => {
    it('returns error for invalid session ID', async () => {
      const handler = captureHandler(IPC.SFTP.STAT)
      const result = (await handler({}, { sshSessionId: 'not-a-uuid', path: '/tmp' })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('ID de sesión inválido')
    })

    it('returns error when session is not found', async () => {
      vi.mocked(mockManager.getSession).mockReturnValue(undefined as never)
      const handler = captureHandler(IPC.SFTP.MKDIR)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/newdir',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Sesión SSH no activa')
    })

    it('returns error for invalid path with null bytes', async () => {
      const handler = captureHandler(IPC.SFTP.STAT)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/\0evil',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta inválida')
    })

    it('returns error for empty path', async () => {
      const handler = captureHandler(IPC.SFTP.STAT)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta inválida')
    })
  })

  // ── sftp:stat ──────────────────────────────────────────────────────────────

  describe('sftp:stat', () => {
    it('returns stat result on success', async () => {
      const statResult: SftpStatResult = {
        mode: 0o100644,
        uid: 1000,
        gid: 1000,
        size: 2048,
        atime: 1700000000,
        mtime: 1700000100,
        isDirectory: false,
        isSymlink: false,
        permissions: '-rw-r--r--',
      }
      mockSession.sftpStat.mockResolvedValue(statResult)
      const handler = captureHandler(IPC.SFTP.STAT)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/home/user/file.txt',
      })) as IpcResult<SftpStatResult>
      expect(result.success).toBe(true)
      expect(result.data).toEqual(statResult)
      expect(result.data!.permissions).toBe('-rw-r--r--')
    })

    it('maps "no such file" error to user-friendly message', async () => {
      mockSession.sftpStat.mockRejectedValue(new Error('No such file'))
      const handler = captureHandler(IPC.SFTP.STAT)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/nonexistent',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toContain('Ruta no encontrada')
    })
  })

  // ── sftp:mkdir ─────────────────────────────────────────────────────────────

  describe('sftp:mkdir', () => {
    it('creates directory on success', async () => {
      mockSession.sftpMkdir.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.MKDIR)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/newdir',
      })) as IpcResult
      expect(result.success).toBe(true)
      expect(mockSession.sftpMkdir).toHaveBeenCalledWith('/tmp/newdir')
    })
  })

  // ── sftp:rmdir ─────────────────────────────────────────────────────────────

  describe('sftp:rmdir', () => {
    it('removes directory on success', async () => {
      mockSession.sftpRmdir.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.RMDIR)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/olddir',
      })) as IpcResult
      expect(result.success).toBe(true)
      expect(mockSession.sftpRmdir).toHaveBeenCalledWith('/tmp/olddir')
    })
  })

  // ── sftp:unlink ────────────────────────────────────────────────────────────

  describe('sftp:unlink', () => {
    it('deletes file on success', async () => {
      mockSession.sftpUnlink.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.UNLINK)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
      })) as IpcResult
      expect(result.success).toBe(true)
      expect(mockSession.sftpUnlink).toHaveBeenCalledWith('/tmp/file.txt')
    })
  })

  // ── sftp:rename ────────────────────────────────────────────────────────────

  describe('sftp:rename', () => {
    it('renames file on success', async () => {
      mockSession.sftpRename.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.RENAME)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        oldPath: '/tmp/old.txt',
        newPath: '/tmp/new.txt',
      })) as IpcResult
      expect(result.success).toBe(true)
      expect(mockSession.sftpRename).toHaveBeenCalledWith('/tmp/old.txt', '/tmp/new.txt')
    })

    it('returns error for invalid oldPath', async () => {
      const handler = captureHandler(IPC.SFTP.RENAME)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        oldPath: '',
        newPath: '/tmp/new.txt',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta origen inválida')
    })

    it('returns error for invalid newPath', async () => {
      const handler = captureHandler(IPC.SFTP.RENAME)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        oldPath: '/tmp/old.txt',
        newPath: '/tmp/\0evil',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta destino inválida')
    })
  })

  // ── sftp:chmod ─────────────────────────────────────────────────────────────

  describe('sftp:chmod', () => {
    it('changes permissions on success', async () => {
      mockSession.sftpChmod.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.CHMOD)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
        mode: 0o755,
      })) as IpcResult
      expect(result.success).toBe(true)
      expect(mockSession.sftpChmod).toHaveBeenCalledWith('/tmp/file.txt', 0o755)
    })

    it('rejects negative mode', async () => {
      const handler = captureHandler(IPC.SFTP.CHMOD)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
        mode: -1,
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Modo de permisos inválido')
    })

    it('rejects mode greater than 0o7777', async () => {
      const handler = captureHandler(IPC.SFTP.CHMOD)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
        mode: 0o10000,
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Modo de permisos inválido')
    })

    it('rejects non-integer mode', async () => {
      const handler = captureHandler(IPC.SFTP.CHMOD)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
        mode: 7.5,
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Modo de permisos inválido')
    })
  })

  // ── sftp:download ──────────────────────────────────────────────────────────

  describe('sftp:download', () => {
    it('returns transferId on success', async () => {
      mockSession.sftpDownload.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.DOWNLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        remotePath: '/remote/file.tar.gz',
        localPath: '/tmp/test-userData/Downloads/file.tar.gz',
      })) as IpcResult<{ transferId: string }>
      expect(result.success).toBe(true)
      expect(result.data!.transferId).toBe(MOCK_UUID)
    })

    it('passes onProgress callback to session', async () => {
      mockSession.sftpDownload.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.DOWNLOAD)
      const mockEvent = makeMockEvent()
      await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        remotePath: '/remote/file.bin',
        localPath: '/tmp/test-userData/file.bin',
      })
      expect(mockSession.sftpDownload).toHaveBeenCalledWith(
        '/remote/file.bin',
        '/tmp/test-userData/file.bin',
        expect.any(Function),
      )
      // Simulate calling the progress callback
      const progressCb = mockSession.sftpDownload.mock.calls[0][2] as (t: number, total: number) => void
      progressCb(512, 1024)
      expect(mockEvent.sender.send).toHaveBeenCalledWith(IPC.SFTP.TRANSFER_PROGRESS, {
        transferId: MOCK_UUID,
        transferred: 512,
        total: 1024,
      })
    })

    it('returns error for invalid remote path', async () => {
      const handler = captureHandler(IPC.SFTP.DOWNLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        remotePath: '',
        localPath: '/tmp/test-userData/file.bin',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta remota inválida')
    })

    it('returns error for invalid local path', async () => {
      const handler = captureHandler(IPC.SFTP.DOWNLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        remotePath: '/remote/file.bin',
        localPath: '',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta local inválida')
    })
  })

  // ── sftp:upload ────────────────────────────────────────────────────────────

  describe('sftp:upload', () => {
    it('returns transferId on success', async () => {
      mockSession.sftpUpload.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.UPLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        localPath: '/tmp/test-userData/file.zip',
        remotePath: '/remote/file.zip',
      })) as IpcResult<{ transferId: string }>
      expect(result.success).toBe(true)
      expect(result.data!.transferId).toBe(MOCK_UUID)
    })

    it('passes onProgress callback to session', async () => {
      mockSession.sftpUpload.mockResolvedValue(undefined)
      const handler = captureHandler(IPC.SFTP.UPLOAD)
      const mockEvent = makeMockEvent()
      await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        localPath: '/tmp/test-userData/upload.bin',
        remotePath: '/remote/upload.bin',
      })
      expect(mockSession.sftpUpload).toHaveBeenCalledWith(
        '/tmp/test-userData/upload.bin',
        '/remote/upload.bin',
        expect.any(Function),
      )
      // Simulate calling the progress callback
      const progressCb = mockSession.sftpUpload.mock.calls[0][2] as (t: number, total: number) => void
      progressCb(256, 512)
      expect(mockEvent.sender.send).toHaveBeenCalledWith(IPC.SFTP.TRANSFER_PROGRESS, {
        transferId: MOCK_UUID,
        transferred: 256,
        total: 512,
      })
    })

    it('returns error for invalid local path', async () => {
      const handler = captureHandler(IPC.SFTP.UPLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        localPath: '',
        remotePath: '/remote/file.bin',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta local inválida')
    })

    it('returns error for invalid remote path', async () => {
      const handler = captureHandler(IPC.SFTP.UPLOAD)
      const mockEvent = makeMockEvent()
      const result = (await handler(mockEvent, {
        sshSessionId: VALID_SESSION_ID,
        localPath: '/tmp/test-userData/file.bin',
        remotePath: '',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toBe('Ruta remota inválida')
    })
  })

  // ── sftp:listDir ───────────────────────────────────────────────────────────

  describe('sftp:listDir', () => {
    it('returns entries on success', async () => {
      const entries: SftpEntry[] = [
        { name: 'docs', isDirectory: true, size: 4096, modified: 1700000000, permissions: 'drwxr-xr-x' },
        { name: 'readme.md', isDirectory: false, size: 512, modified: 1700000100, permissions: '-rw-r--r--' },
      ]
      mockSession.listDir.mockResolvedValue(entries)
      const handler = captureHandler(IPC.SFTP.LIST_DIR)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/home/user',
      })) as IpcResult<SftpEntry[]>
      expect(result.success).toBe(true)
      expect(result.data).toEqual(entries)
      expect(mockSession.listDir).toHaveBeenCalledWith('/home/user')
    })
  })

  // ── sftp:realpath ──────────────────────────────────────────────────────────

  describe('sftp:realpath', () => {
    it('returns resolved path on success', async () => {
      mockSession.realpath.mockResolvedValue('/home/user')
      const handler = captureHandler(IPC.SFTP.REALPATH)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '.',
      })) as IpcResult<string>
      expect(result.success).toBe(true)
      expect(result.data).toBe('/home/user')
    })
  })

  // ── Error message mapping ──────────────────────────────────────────────────

  describe('error message mapping', () => {
    it('maps "permission denied" to user-friendly message', async () => {
      mockSession.sftpMkdir.mockRejectedValue(new Error('Permission denied'))
      const handler = captureHandler(IPC.SFTP.MKDIR)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/root/protected',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toContain('Permiso denegado')
    })

    it('maps "eof" to connection closed message', async () => {
      mockSession.sftpUnlink.mockRejectedValue(new Error('Unexpected EOF'))
      const handler = captureHandler(IPC.SFTP.UNLINK)
      const result = (await handler({}, {
        sshSessionId: VALID_SESSION_ID,
        path: '/tmp/file.txt',
      })) as IpcResult
      expect(result.success).toBe(false)
      expect(result.error).toContain('Conexión SFTP cerrada inesperadamente')
    })
  })
})
