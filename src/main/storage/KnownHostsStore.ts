import fs from 'fs'
import path from 'path'
import { log } from '../logger'

export interface KnownHost {
  host: string
  port: number
  fingerprint: string
  addedAt: string
}

export class KnownHostsStore {
  private readonly filePath: string
  private cache: KnownHost[] | null = null

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'known-hosts.json')
  }

  private readAll(): KnownHost[] {
    if (this.cache) return this.cache
    try {
      if (!fs.existsSync(this.filePath)) { this.cache = []; return this.cache }
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as KnownHost[]
      return this.cache
    } catch {
      this.cache = []
      return this.cache
    }
  }

  private writeAll(hosts: KnownHost[]): void {
    this.cache = hosts
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(hosts, null, 2), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tmp, this.filePath)
  }

  lookup(host: string, port: number): string | null {
    const entry = this.readAll().find((e) => e.host === host && e.port === port)
    return entry?.fingerprint ?? null
  }

  add(host: string, port: number, fingerprint: string): void {
    const hosts = this.readAll().filter((e) => !(e.host === host && e.port === port))
    hosts.push({ host, port, fingerprint, addedAt: new Date().toISOString() })
    this.writeAll(hosts)
    log.info('[known-hosts] Added %s:%d', host, port)
  }

  list(): KnownHost[] {
    return [...this.readAll()]
  }

  delete(host: string, port: number): void {
    this.writeAll(this.readAll().filter((e) => !(e.host === host && e.port === port)))
    log.info('[known-hosts] Removed %s:%d', host, port)
  }

  verify(host: string, port: number, fingerprint: string): 'match' | 'mismatch' | 'unknown' {
    const stored = this.lookup(host, port)
    if (!stored) return 'unknown'
    return stored === fingerprint ? 'match' : 'mismatch'
  }
}
