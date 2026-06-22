import { app, dialog } from 'electron'
import path from 'path'
import fs from 'fs'

export let isPortable = false
export let portableDataDir = ''

export function setupPortableMode(): void {
  const appDir = app.isPackaged
    ? path.dirname(process.execPath)
    : path.resolve(app.getAppPath())

  const portableMarker = path.join(appDir, 'portable')
  if (!fs.existsSync(portableMarker)) return

  isPortable = true
  const dataDir = path.join(appDir, 'data')
  portableDataDir = dataDir

  try {
    fs.mkdirSync(dataDir, { recursive: true })
    // Verify we can actually write to the directory
    const testFile = path.join(dataDir, '.write-test')
    fs.writeFileSync(testFile, '', 'utf-8')
    fs.unlinkSync(testFile)
  } catch {
    dialog.showErrorBox(
      'jcoTerm — Portable mode error',
      `Cannot write to the data directory:\n${dataDir}\n\nMake sure the application folder has write permissions.\nOn Windows: right-click the folder → Properties → Security → allow write access.`,
    )
    app.exit(1)
    return
  }

  app.setPath('userData', dataDir)
}
