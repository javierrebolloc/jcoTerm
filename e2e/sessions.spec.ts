import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MAIN_PATH = path.resolve(__dirname, '../out/main/index.js')

test('session list shows empty state on first launch', async () => {
  const app = await electron.launch({ args: [MAIN_PATH] })
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.locator('text=Pulsa')).toBeVisible({ timeout: 5000 })
  } finally {
    await app.close()
  }
})

test('connect modal opens on + button click', async () => {
  const app = await electron.launch({ args: [MAIN_PATH] })
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('button[title="Nueva conexión"]').click()
    await expect(window.locator('text=Nueva conexión SSH')).toBeVisible()
    await expect(window.locator('#host')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('settings modal shows sessions file path', async () => {
  const app = await electron.launch({ args: [MAIN_PATH] })
  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('button:has-text("Ajustes")').click()
    await expect(window.locator('text=Fichero de sesiones')).toBeVisible()
    await expect(window.locator('text=sessions.json')).toBeVisible()
  } finally {
    await app.close()
  }
})
