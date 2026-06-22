import { EventEmitter } from 'events'
import crypto from 'crypto'
import fs from 'fs'
import fsPromises from 'fs/promises'
import type { Client, ClientChannel, ConnectConfig } from 'ssh2'
import type { SftpEntry, SftpStatResult } from '../../shared/types'

export type SshAuthConfig =
  | { authMethod: 'password'; password: string }
  | { authMethod: 'privateKey'; privateKey: string; passphrase?: string }
  | { authMethod: 'agent' }

export type HostKeyVerifier = (fingerprint: string) => 'match' | 'mismatch' | 'unknown'

export type SshConnectConfig = {
  host: string
  port: number
  username: string
  hostKeyVerifier?: HostKeyVerifier
} & SshAuthConfig

export class HostKeyUnknownError extends Error {
  constructor(public readonly fingerprint: string) {
    super('Host key desconocida')
    this.name = 'HostKeyUnknownError'
  }
}

export class HostKeyMismatchError extends Error {
  constructor(public readonly fingerprint: string) {
    super('Host key cambiada — posible ataque MITM')
    this.name = 'HostKeyMismatchError'
  }
}

export interface SshOutputEvent {
  sessionId: string
  data: string
}

// Factory type allows injecting a mock Client in tests.
type ClientFactory = () => Client

function formatPermissions(mode: number): string {
  const types: Record<number, string> = { 0x4000: 'd', 0xA000: 'l', 0x8000: '-' }
  const type = types[mode & 0xF000] ?? '?'
  const rwx = (m: number): string =>
    (m & 4 ? 'r' : '-') + (m & 2 ? 'w' : '-') + (m & 1 ? 'x' : '-')
  return type + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7)
}

export class SshSession extends EventEmitter {
  private client: Client
  private stream: ClientChannel | null = null
  private _connected = false

  constructor(
    readonly id: string,
    clientFactory: ClientFactory = () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Client } = require('ssh2') as typeof import('ssh2')
      return new Client()
    },
  ) {
    super()
    this.client = clientFactory()
  }

  connect(config: SshConnectConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectConfig: ConnectConfig = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 15_000,
      }

      if (config.authMethod === 'password') {
        connectConfig.password = config.password
      } else if (config.authMethod === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) connectConfig.passphrase = config.passphrase
      } else if (config.authMethod === 'agent') {
        connectConfig.agent = process.env['SSH_AUTH_SOCK'] ?? '\\\\.\\pipe\\openssh-ssh-agent'
      }

      let settled = false
      const safeReject = (err: Error): void => { if (!settled) { settled = true; reject(err) } }
      const safeResolve = (): void => { if (!settled) { settled = true; resolve() } }

      if (config.hostKeyVerifier) {
        const verifier = config.hostKeyVerifier
        connectConfig.hostVerifier = (key: Buffer) => {
          const fp = 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64')
          const result = verifier(fp)
          if (result === 'unknown') { safeReject(new HostKeyUnknownError(fp)); return false }
          if (result === 'mismatch') { safeReject(new HostKeyMismatchError(fp)); return false }
          return true
        }
      }

      const SHELL_TIMEOUT_MS = 10_000

      const onConnectError = (err: Error): void => {
        safeReject(new Error(`SSH error: ${err.message}`))
      }
      this.client.once('error', onConnectError)

      this.client.once('ready', () => {
        this.client.removeListener('error', onConnectError)

        const shellTimer = setTimeout(() => {
          safeReject(new Error('Shell timeout: server did not open shell in time'))
          this.client.end()
        }, SHELL_TIMEOUT_MS)

        this.client.shell({ term: 'xterm-256color' }, (err, stream) => {
          clearTimeout(shellTimer)
          if (err) {
            safeReject(new Error(`Failed to open shell: ${err.message}`))
            return
          }

          this.stream = stream
          this._connected = true

          stream.on('data', (data: Buffer) => {
            this.emit('output', { sessionId: this.id, data: data.toString() } satisfies SshOutputEvent)
          })

          stream.stderr.on('data', (data: Buffer) => {
            this.emit('output', { sessionId: this.id, data: data.toString() } satisfies SshOutputEvent)
          })

          stream.on('close', () => {
            this._connected = false
            this.stream = null
            this.emit('close', this.id)
            this.client.end()
          })

          stream.on('error', (streamErr: Error) => {
            this.emit('error', streamErr)
          })

          safeResolve()
        })
      })

      this.client.on('error', (err) => {
        if (this._connected) {
          this._connected = false
          this.emit('error', err)
        }
      })

      this.client.connect(connectConfig)
    })
  }

  private paused = false

  write(data: string): void {
    if (!this.stream || !this._connected || this.paused) return
    const ok = this.stream.write(data)
    if (!ok) {
      this.paused = true
      this.stream.once('drain', () => { this.paused = false })
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.stream || !this._connected) return
    if (cols <= 0 || rows <= 0) return
    this.stream.setWindow(rows, cols, 0, 0)
  }

  disconnect(): void {
    if (this.stream) {
      this.stream.close()
      this.stream = null
    }
    this._connected = false
    this.client.end()
  }

  async listDir(remotePath: string): Promise<SftpEntry[]> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.readdir(remotePath, (err2, list) => {
          if (err2) { sftp.end(); reject(new Error(`readdir: ${err2.message}`)); return }
          const entries: SftpEntry[] = list
            .filter((f) => f.filename !== '.' && f.filename !== '..')
            .map((f) => ({
              name: f.filename,
              isDirectory: ((f.attrs.mode ?? 0) & 0xf000) === 0x4000,
              size: f.attrs.size ?? 0,
              modified: f.attrs.mtime ?? 0,
              permissions: formatPermissions(f.attrs.mode ?? 0),
            }))
            .sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
              return a.name.localeCompare(b.name)
            })
          sftp.end()
          resolve(entries)
        })
      })
    })
  }

  async realpath(remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.realpath(remotePath, (err2, resolved) => {
          if (err2) { sftp.end(); reject(new Error(`realpath: ${err2.message}`)); return }
          sftp.end()
          resolve(resolved)
        })
      })
    })
  }

  async sftpStat(remotePath: string): Promise<SftpStatResult> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.stat(remotePath, (err2, attrs) => {
          if (err2) { sftp.end(); reject(new Error(`stat: ${err2.message}`)); return }
          sftp.end()
          resolve({
            mode: attrs.mode,
            uid: attrs.uid,
            gid: attrs.gid,
            size: attrs.size,
            atime: attrs.atime,
            mtime: attrs.mtime,
            isDirectory: ((attrs.mode & 0xF000) === 0x4000),
            isSymlink: ((attrs.mode & 0xF000) === 0xA000),
            permissions: formatPermissions(attrs.mode),
          })
        })
      })
    })
  }

  async sftpMkdir(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.mkdir(remotePath, (err2) => {
          if (err2) { sftp.end(); reject(new Error(`mkdir: ${err2.message}`)); return }
          sftp.end()
          resolve()
        })
      })
    })
  }

  async sftpRmdir(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.rmdir(remotePath, (err2) => {
          if (err2) { sftp.end(); reject(new Error(`rmdir: ${err2.message}`)); return }
          sftp.end()
          resolve()
        })
      })
    })
  }

  async sftpUnlink(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.unlink(remotePath, (err2) => {
          if (err2) { sftp.end(); reject(new Error(`unlink: ${err2.message}`)); return }
          sftp.end()
          resolve()
        })
      })
    })
  }

  async sftpRename(oldPath: string, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.rename(oldPath, newPath, (err2) => {
          if (err2) { sftp.end(); reject(new Error(`rename: ${err2.message}`)); return }
          sftp.end()
          resolve()
        })
      })
    })
  }

  async sftpChmod(remotePath: string, mode: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.chmod(remotePath, mode, (err2) => {
          if (err2) { sftp.end(); reject(new Error(`chmod: ${err2.message}`)); return }
          sftp.end()
          resolve()
        })
      })
    })
  }

  async sftpDownload(
    remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        sftp.stat(remotePath, (err2, attrs) => {
          if (err2) { sftp.end(); reject(new Error(`stat: ${err2.message}`)); return }
          const total = attrs.size
          let transferred = 0
          const readStream = sftp.createReadStream(remotePath)
          const writeStream = fs.createWriteStream(localPath)

          readStream.on('data', (chunk: Buffer) => {
            transferred += chunk.length
            if (onProgress) onProgress(transferred, total)
          })

          readStream.on('error', (streamErr: Error) => {
            sftp.end()
            reject(new Error(`download: ${streamErr.message}`))
          })

          writeStream.on('error', (streamErr: Error) => {
            sftp.end()
            reject(new Error(`download: ${streamErr.message}`))
          })

          writeStream.on('close', () => {
            sftp.end()
            resolve()
          })

          readStream.pipe(writeStream)
        })
      })
    })
  }

  async sftpUpload(
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const stats = await fsPromises.stat(localPath)
    const total = stats.size
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) { reject(new Error(`SFTP: ${err.message}`)); return }
        let transferred = 0
        const readStream = fs.createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remotePath)

        readStream.on('data', (chunk: Buffer | string) => {
          transferred += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
          if (onProgress) onProgress(transferred, total)
        })

        readStream.on('error', (streamErr: Error) => {
          sftp.end()
          reject(new Error(`upload: ${streamErr.message}`))
        })

        writeStream.on('error', (streamErr: Error) => {
          sftp.end()
          reject(new Error(`upload: ${streamErr.message}`))
        })

        writeStream.on('close', () => {
          sftp.end()
          resolve()
        })

        readStream.pipe(writeStream)
      })
    })
  }

  get connected(): boolean {
    return this._connected
  }
}

