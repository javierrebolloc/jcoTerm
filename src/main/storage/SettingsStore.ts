import Store from 'electron-store'
import path from 'path'
import { app } from 'electron'
import { isPortable } from '../portable'

interface StoredSettings {
  sessionsFilePath: string
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  aiProvider: 'anthropic' | 'gemini'
  anthropicModel: string
  geminiModel: string
  aiContextLines: number
  aiHistoryLength: number
  language: 'en' | 'es'
}

function defaultSessionsPath(): string {
  if (isPortable) return path.join(app.getPath('userData'), 'sessions.json')
  return path.join(app.getPath('documents'), 'ssh-ai-client', 'sessions.json')
}

export class SettingsStore {
  private store: Store<StoredSettings>

  constructor() {
    this.store = new Store<StoredSettings>({
      name: 'settings',
      defaults: {
        sessionsFilePath: defaultSessionsPath(),
        fontSize: 14,
        fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
        cursorStyle: 'block' as const,
        cursorBlink: true,
        scrollback: 5000,
        aiProvider: 'anthropic',
        anthropicModel: 'claude-sonnet-4-6',
        geminiModel: 'gemini-2.5-flash-lite',
        aiContextLines: 100,
        aiHistoryLength: 20,
        language: 'en',
      },
      schema: {
        sessionsFilePath: { type: 'string', minLength: 1 },
        fontSize: { type: 'number', minimum: 8, maximum: 32 },
        fontFamily: { type: 'string', minLength: 1 },
        cursorStyle: { type: 'string', enum: ['block', 'underline', 'bar'] },
        cursorBlink: { type: 'boolean' },
        scrollback: { type: 'number', minimum: 100, maximum: 100_000 },
        aiProvider: { type: 'string', enum: ['anthropic', 'gemini'] },
        anthropicModel: { type: 'string', minLength: 1 },
        geminiModel: { type: 'string', minLength: 1 },
        aiContextLines: { type: 'number', minimum: 10, maximum: 5000 },
        aiHistoryLength: { type: 'number', minimum: 0, maximum: 100 },
        language: { type: 'string', enum: ['en', 'es'] },
      },
    })
  }

  getSessionsFilePath(): string {
    if (isPortable) return path.join(app.getPath('userData'), 'sessions.json')
    return this.store.get('sessionsFilePath')
  }

  get(): StoredSettings {
    return {
      sessionsFilePath: this.store.get('sessionsFilePath'),
      fontSize: this.store.get('fontSize'),
      fontFamily: this.store.get('fontFamily'),
      cursorStyle: this.store.get('cursorStyle'),
      cursorBlink: this.store.get('cursorBlink'),
      scrollback: this.store.get('scrollback'),
      aiProvider: this.store.get('aiProvider'),
      anthropicModel: this.store.get('anthropicModel'),
      geminiModel: this.store.get('geminiModel'),
      aiContextLines: this.store.get('aiContextLines'),
      aiHistoryLength: this.store.get('aiHistoryLength'),
      language: this.store.get('language'),
    }
  }

  set(patch: Partial<StoredSettings>): void {
    for (const [k, v] of Object.entries(patch) as [keyof StoredSettings, StoredSettings[keyof StoredSettings]][]) {
      if (v !== undefined) this.store.set(k, v)
    }
  }
}
