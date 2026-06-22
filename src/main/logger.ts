import log from 'electron-log/main'
import path from 'path'
import { app } from 'electron'

export function initLogger(): void {
  // Write to AppData/.../logs/main.log
  log.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'main.log')

  log.transports.file.level = 'debug'
  log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB rotate
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

  log.transports.console.level = 'debug'
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

  // Wire renderer → main IPC logging (requires log.initialize() before app.whenReady)
  log.initialize()
}

export { log }
