import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../main/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation((opts: any) => {
      const data: Record<string, any> = { ...opts.defaults }
      return {
        get: vi.fn((key: string) => data[key]),
        set: vi.fn((key: string, value: any) => { data[key] = value }),
      }
    }),
  }
})

import { SettingsStore } from '../main/storage/SettingsStore'

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new SettingsStore()
  })

  describe('get()', () => {
    it('returns all fields with default values', () => {
      const settings = store.get()
      expect(settings).toHaveProperty('fontSize', 14)
      expect(settings).toHaveProperty('scrollback', 5000)
      expect(settings).toHaveProperty('aiProvider', 'anthropic')
      expect(settings).toHaveProperty('geminiModel', 'gemini-2.5-flash-lite')
      expect(settings).toHaveProperty('aiContextLines', 100)
      expect(settings).toHaveProperty('sessionsFilePath')
    })

    it('returns a sessionsFilePath that is a string', () => {
      const settings = store.get()
      expect(typeof settings.sessionsFilePath).toBe('string')
      expect(settings.sessionsFilePath.length).toBeGreaterThan(0)
    })

    it('includes all expected keys', () => {
      const settings = store.get()
      const keys = Object.keys(settings)
      expect(keys).toContain('sessionsFilePath')
      expect(keys).toContain('fontSize')
      expect(keys).toContain('scrollback')
      expect(keys).toContain('aiProvider')
      expect(keys).toContain('fontFamily')
      expect(keys).toContain('cursorStyle')
      expect(keys).toContain('cursorBlink')
      expect(keys).toContain('anthropicModel')
      expect(keys).toContain('geminiModel')
      expect(keys).toContain('aiContextLines')
      expect(keys).toContain('aiHistoryLength')
      expect(keys).toContain('language')
      expect(keys).toHaveLength(12)
    })
  })

  describe('set()', () => {
    it('updates fontSize', () => {
      store.set({ fontSize: 20 })
      expect(store.get().fontSize).toBe(20)
    })

    it('updates scrollback', () => {
      store.set({ scrollback: 10000 })
      expect(store.get().scrollback).toBe(10000)
    })

    it('updates aiProvider', () => {
      store.set({ aiProvider: 'gemini' })
      expect(store.get().aiProvider).toBe('gemini')
    })

    it('updates multiple fields at once', () => {
      store.set({ fontSize: 18, scrollback: 8000, aiContextLines: 200 })
      const settings = store.get()
      expect(settings.fontSize).toBe(18)
      expect(settings.scrollback).toBe(8000)
      expect(settings.aiContextLines).toBe(200)
    })

    it('does not update when value is undefined', () => {
      store.set({ fontSize: undefined })
      expect(store.get().fontSize).toBe(14)
    })
  })

  describe('getSessionsFilePath()', () => {
    it('returns the default sessions file path', () => {
      const filePath = store.getSessionsFilePath()
      expect(typeof filePath).toBe('string')
      expect(filePath.length).toBeGreaterThan(0)
    })

    it('returns updated path after set()', () => {
      store.set({ sessionsFilePath: '/custom/path/sessions.json' })
      expect(store.getSessionsFilePath()).toBe('/custom/path/sessions.json')
    })
  })
})
