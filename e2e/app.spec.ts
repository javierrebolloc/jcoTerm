import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

// Requires the app to be built first: npm run build
const MAIN_PATH = path.resolve(__dirname, '../out/main/index.js')

test('app launches and shows the main UI', async () => {
  const app = await electron.launch({ args: [MAIN_PATH] })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Title should be set
    const title = await window.title()
    expect(title).toBe('SSH AI Client')

    // Session list sidebar should be visible
    await expect(window.locator('text=Sesiones')).toBeVisible()

    // Connect button should be present
    await expect(window.locator('button[title="Nueva conexión"]')).toBeVisible()
  } finally {
    await app.close()
  }
})
