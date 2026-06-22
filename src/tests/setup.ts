import { vi } from 'vitest'

// Mock the entire electron module so main-process code can be tested in Node.js
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((_name: string) => '/tmp/test-userData'),
    getAppPath: vi.fn(() => '/tmp/test-app'),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
}))

// Mock portable module so SettingsStore can import it in tests
vi.mock('../main/portable', () => ({
  isPortable: false,
  setupPortableMode: vi.fn(),
}))
