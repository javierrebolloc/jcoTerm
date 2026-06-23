import fs from 'fs'
import path from 'path'
import { log } from '../logger'
import type { SavedSession } from '../../shared/types'

interface SessionsFile {
  version: number
  sessions: SavedSession[]
}

const FILE_VERSION = 1

export class SessionStore {
  private filePath: string
  private cache: SessionsFile | null = null

  constructor(defaultPath: string) {
    this.filePath = defaultPath
  }

  private read(): SessionsFile {
    if (this.cache) return this.cache
    try {
      if (!fs.existsSync(this.filePath)) {
        this.cache = { version: FILE_VERSION, sessions: [] }
        return this.cache
      }
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as SessionsFile
      return this.cache
    } catch (err) {
      log.error('[sessions] Failed to read sessions file, attempting backup recovery:', (err as Error).message)
      const backup = this.filePath + '.bak'
      if (fs.existsSync(backup)) {
        try {
          this.cache = JSON.parse(fs.readFileSync(backup, 'utf-8')) as SessionsFile
          log.info('[sessions] Recovered from backup file')
          return this.cache
        } catch {
          log.error('[sessions] Backup also corrupt, starting with empty sessions')
        }
      }
      this.cache = { version: FILE_VERSION, sessions: [] }
      return this.cache
    }
  }

  private write(data: SessionsFile): void {
    this.cache = data
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    if (fs.existsSync(this.filePath)) {
      try { fs.copyFileSync(this.filePath, this.filePath + '.bak') } catch { /* best effort */ }
    }
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }

  getFilePath(): string {
    return this.filePath
  }

  setFilePath(newPath: string): void {
    this.filePath = newPath
    this.cache = null
  }

  list(): SavedSession[] {
    return this.read().sessions
  }

  save(session: SavedSession): void {
    const data = this.read()
    const idx = data.sessions.findIndex((s) => s.id === session.id)
    if (idx >= 0) {
      data.sessions[idx] = session
    } else {
      data.sessions.push(session)
    }
    this.write(data)
  }

  delete(id: string): void {
    const data = this.read()
    data.sessions = data.sessions.filter((s) => s.id !== id)
    this.write(data)
  }

  findById(id: string): SavedSession | undefined {
    return this.read().sessions.find((s) => s.id === id)
  }
}
