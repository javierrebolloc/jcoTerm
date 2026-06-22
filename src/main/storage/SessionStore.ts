import fs from 'fs'
import path from 'path'
import type { SavedSession } from '../../shared/types'

interface SessionsFile {
  version: number
  sessions: SavedSession[]
}

const FILE_VERSION = 1

export class SessionStore {
  private filePath: string

  constructor(defaultPath: string) {
    this.filePath = defaultPath
  }

  private read(): SessionsFile {
    try {
      if (!fs.existsSync(this.filePath)) return { version: FILE_VERSION, sessions: [] }
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as SessionsFile
    } catch {
      return { version: FILE_VERSION, sessions: [] }
    }
  }

  private write(data: SessionsFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    // Pretty-printed JSON so users can inspect/share the file easily
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  getFilePath(): string {
    return this.filePath
  }

  setFilePath(newPath: string): void {
    this.filePath = newPath
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
