import { ipcMain, app } from 'electron'
import path from 'path'
import { IPC } from '../../shared/ipc-channels'
import type { AppSettings, IpcResult } from '../../shared/types'
import type { SettingsStore } from '../storage/SettingsStore'
import type { SessionStore } from '../storage/SessionStore'
import type { CredentialStore } from '../storage/CredentialStore'
import { isValidSettingsPath } from '../security'
import { t, setLocale } from '../../shared/i18n'

export function registerSettingsHandlers(
  settingsStore: SettingsStore,
  sessionStore: SessionStore,
  credentialStore: CredentialStore,
): void {
  ipcMain.handle(IPC.SETTINGS.GET, (): IpcResult<AppSettings> => {
    try {
      const stored = settingsStore.get()
      return {
        success: true,
        data: {
          ...stored,
          anthropicApiKeySet: credentialStore.hasCredential('__anthropic_api_key__'),
          geminiApiKeySet: credentialStore.hasCredential('__gemini_api_key__'),
          logFilePath: path.join(app.getPath('userData'), 'logs', 'main.log'),
          appVersion: app.getVersion(),
        },
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    IPC.SETTINGS.SET,
    (_event, patch: Partial<Omit<AppSettings, 'anthropicApiKeySet'>>): IpcResult => {
      try {
        const { sessionsFilePath, anthropicApiKey, geminiApiKey, ...rest } = patch
        if (sessionsFilePath) {
          if (!isValidSettingsPath(sessionsFilePath)) {
            return { success: false, error: t('errors.settings.pathNotAllowed') }
          }
          settingsStore.set({ sessionsFilePath })
          sessionStore.setFilePath(sessionsFilePath)
        }
        if (anthropicApiKey) credentialStore.savePassword('__anthropic_api_key__', anthropicApiKey)
        if (geminiApiKey) credentialStore.savePassword('__gemini_api_key__', geminiApiKey)

        const ALLOWED_KEYS = new Set([
          'fontSize', 'fontFamily', 'cursorStyle', 'cursorBlink', 'scrollback',
          'aiProvider', 'anthropicModel', 'geminiModel', 'aiContextLines', 'aiHistoryLength', 'language',
        ])
        const safeRest: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(rest)) {
          if (ALLOWED_KEYS.has(k) && v !== undefined) safeRest[k] = v
        }
        if (Object.keys(safeRest).length > 0) settingsStore.set(safeRest)
        if (safeRest.language && (safeRest.language === 'en' || safeRest.language === 'es')) {
          setLocale(safeRest.language)
        }
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    },
  )
}
