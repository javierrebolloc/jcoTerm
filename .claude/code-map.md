# code-map.md — Mapa del código

Consultar este fichero para ir directo al módulo correcto sin escanear el árbol.

## Proceso Main (`src/main/`)

| Fichero | Qué hace |
|---|---|
| `src/main/index.ts` | Punto de entrada: BrowserWindow, CSP, handlers IPC, `setLocale()`, window state store, logging de renderer |
| `src/main/portable.ts` | Detección modo portable (fichero `portable` junto al .exe) |
| `src/main/logger.ts` | Inicializa electron-log (archivo + consola) |
| `src/main/security.ts` | CSP, validadores IPC, `sanitizeSshError` (i18n), `IpcRateLimiter` |
| `src/main/ipc/ssh.handlers.ts` | SSH connect/disconnect/input/resize, host key verify, rate limiting |
| `src/main/ipc/session.handlers.ts` | CRUD sesiones guardadas |
| `src/main/ipc/settings.handlers.ts` | settings:get/set, `setLocale()` en cambio de idioma, `appVersion` |
| `src/main/ipc/credential.handlers.ts` | CRUD credenciales nombradas |
| `src/main/ipc/folder.handlers.ts` | CRUD carpetas |
| `src/main/ipc/sftp.handlers.ts` | SFTP: listDir, realpath, stat, mkdir, rmdir, unlink, rename, chmod, download (stream bg), upload (stream bg) |
| `src/main/ipc/local.handlers.ts` | Filesystem local: listDir, homePath, drives (Windows A:-Z:) |
| `src/main/ipc/ai.handlers.ts` | IA: streaming via push events, `calculateMaxTokens()`, historial de conversación |
| `src/main/ssh/SshManager.ts` | Registro de sesiones SSH activas |
| `src/main/ssh/SshSession.ts` | Wrapper ssh2: shell, SFTP (8 ops), `formatPermissions()`, streaming download/upload |
| `src/main/storage/JsonFileStore.ts` | Clase base: cache, escritura atómica, backup |
| `src/main/storage/SessionStore.ts` | CRUD sesiones (JSON) |
| `src/main/storage/CredentialStore.ts` | Cifrado AES-256-GCM (clave derivada de lock password) |
| `src/main/storage/NamedCredentialStore.ts` | Credenciales nombradas |
| `src/main/storage/FolderStore.ts` | Carpetas |
| `src/main/storage/KnownHostsStore.ts` | Host keys SSH |
| `src/main/storage/SettingsStore.ts` | Preferencias: terminal, IA, idioma, fuente, cursor |
| `src/main/storage/LockStore.ts` | Contraseña de bloqueo: PBKDF2 hash + salt |
| `src/main/ai/AIProvider.ts` | Interface `AIProvider` + `AIStreamCallbacks` + `ChatHistoryMessage` |
| `src/main/ai/AnthropicClient.ts` | Claude: sendMessage + stream, historial, error classification (i18n) |
| `src/main/ai/GeminiClient.ts` | Gemini: sendMessage + stream (SSE), retry, quota, historial (i18n) |

## i18n (`src/shared/i18n/`)

| Fichero | Qué hace |
|---|---|
| `src/shared/i18n/index.ts` | Motor: `t(key, params?)`, `setLocale()`, `getLocale()`. Fallback en→key |
| `src/shared/i18n/en.json` | ~250 claves en inglés (source of truth) |
| `src/shared/i18n/es.json` | ~250 claves en español |

## Preload (`src/preload/`)

| Fichero | Qué hace |
|---|---|
| `src/preload/index.ts` | contextBridge: ssh, sessions, folders, credentials, ai (stream), sftp (full CRUD + transfers), local (fs), settings, app (windowState) |

## Tipos compartidos (`src/shared/`)

| Fichero | Qué hace |
|---|---|
| `src/shared/ipc-channels.ts` | Todos los canales IPC: SSH, SESSIONS, AI (stream), SFTP (12 ops), LOCAL (3 ops), APP |
| `src/shared/types.ts` | Interfaces: `Locale`, `AppSettings`, `SftpStatResult`, `LocalEntry`, `TransferItem`, `WindowState`, `ElectronAPI` |
| `src/shared/Redactor.ts` | Redactor con `RedactedPatternType` y `matchedTypes` |

## Renderer (`src/renderer/`)

| Fichero | Qué hace |
|---|---|
| `src/renderer/App.tsx` | Layout raíz: ConfirmProvider + LanguageProvider, viewMode (terminal/sftp), multiExec |
| `src/renderer/hooks/LanguageContext.tsx` | React context para idioma |
| `src/renderer/hooks/useTranslation.ts` | Hook `{ t }` para componentes |
| `src/renderer/hooks/useConfirm.tsx` | ConfirmProvider + `useConfirm()` para diálogos custom |
| **SessionList/** | Árbol de carpetas/sesiones, drag & drop, menú contextual |
| **Terminal/** | Multi-tab, split view, multi-ejecución (input + paste), live settings (font, cursor) |
| **AiChat/** | Chat IA: streaming, historial, quota bar, multi-tab |
| **Settings/** | Modal con sidebar (5 secciones), idioma funcional, terminal config |
| **Credentials/** | CRUD credenciales |
| **FileExplorer/** | Explorador de ficheros simple (panel derecho) |
| **SplashScreen/** | Pantalla de carga (5s) con "jcoTerm" |
| **LockScreen/** | Contraseña de desbloqueo (crear/verificar) |
| **SftpManager/** | Gestor SFTP dual-pane: ConnectionBar, FilePane, FileTable, Breadcrumb, ContextMenu, TransferQueue, ChmodDialog |

## Tests (`src/tests/`) — 300 tests, 20 suites

| Fichero | Tests |
|---|---|
| `sftp-handlers.test.ts` | 28 — SFTP handlers (stat, mkdir, rmdir, unlink, rename, chmod, download, upload) |
| `local-handlers.test.ts` | 11 — Local fs handlers (listDir, homePath, drives) |
| `lock-store.test.ts` | 11 — Lock password (PBKDF2 hash, verify, persist) |
| Otros 17 suites | 250 — SSH, sessions, credentials, folders, settings, security, redactor, AI |
