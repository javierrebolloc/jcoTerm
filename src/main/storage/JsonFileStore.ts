import fs from 'fs'
import path from 'path'
import { log } from '../logger'

export abstract class JsonFileStore<T extends { id: string }> {
  private cache: T[] | null = null
  private dirty = false

  constructor(protected readonly filePath: string) {}

  protected readAll(): T[] {
    if (this.cache) return this.cache
    try {
      if (!fs.existsSync(this.filePath)) { this.cache = []; return this.cache }
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as T[]
      return this.cache
    } catch (err) {
      log.warn('[store] Corrupt JSON at %s: %s — backing up', this.filePath, (err as Error).message)
      try {
        fs.copyFileSync(this.filePath, this.filePath + '.backup')
      } catch { /* best effort */ }
      this.cache = []
      return this.cache
    }
  }

  protected writeAll(items: T[]): void {
    this.cache = items
    this.dirty = true
    this.flush()
  }

  private flush(): void {
    if (!this.dirty || !this.cache) return
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, this.filePath)
    this.dirty = false
  }

  list(): T[] {
    return [...this.readAll()]
  }

  save(item: T): void {
    const existing = this.readAll()
    const idx = existing.findIndex((e) => e.id === item.id)
    if (idx >= 0) existing[idx] = item
    else existing.push(item)
    this.writeAll(existing)
  }

  delete(id: string): void {
    this.writeAll(this.readAll().filter((e) => e.id !== id))
  }

  findById(id: string): T | undefined {
    return this.readAll().find((e) => e.id === id)
  }
}
