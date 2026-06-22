# code-map.md — Code Map

Consult this file to go directly to the right module without scanning the tree.

## Main Process (`src/main/`)

| File | What it does |
|---|---|
| `src/main/index.ts` | Entry point: BrowserWindow, CSP, IPC handlers, `setLocale()`, window state store, renderer logging |
| `src/main/portable.ts` | Portable mode detection (`portable` file next to the .exe) |
| `src/main/logger.ts` | Initializes electron-log (file + console) |
| `src/main/security.ts` | CSP, IPC validators, `sanitizeSshError` (i18n), `IpcRateLimiter` |
| `src/main/ipc/ssh.handlers.ts` | SSH connect/disconnect/input/resize, host key verify, rate limiting |
| `src/main/ipc/session.handlers.ts` | Saved sessions CRUD |
| `src/main/ipc/settings.handlers.ts` | settings:get/set, `setLocale()` on language change, `appVersion` |
| `src/main/ipc/credential.handlers.ts` | Named credentials CRUD |
| `src/main/ipc/folder.handlers.ts` | Folders CRUD |
| `src/main/ipc/sftp.handlers.ts` | SFTP: listDir, realpath, stat, mkdir, rmdir, unlink, rename, chmod, download (bg stream), upload (bg stream) |
| `src/main/ipc/local.handlers.ts` | Local filesystem: listDir, homePath, drives (Windows A:-Z:) |
| `src/main/ipc/ai.handlers.ts` | AI: streaming via push events, `calculateMaxTokens()`, conversation history |
| `src/main/ssh/SshManager.ts` | Registry of active SSH sessions |
| `src/main/ssh/SshSession.ts` | ssh2 wrapper: shell, SFTP (8 ops), `formatPermissions()`, streaming download/upload |
| `src/main/storage/JsonFileStore.ts` | Base class: cache, atomic write, backup |
| `src/main/storage/SessionStore.ts` | Sessions CRUD (JSON) |
| `src/main/storage/CredentialStore.ts` | AES-256-GCM encryption (key derived from lock password) |
| `src/main/storage/NamedCredentialStore.ts` | Named credentials |
| `src/main/storage/FolderStore.ts` | Folders |
| `src/main/storage/KnownHostsStore.ts` | SSH host keys |
| `src/main/storage/SettingsStore.ts` | Preferences: terminal, AI, language, font, cursor |
| `src/main/storage/LockStore.ts` | Lock password: PBKDF2 hash + salt |
| `src/main/ai/AIProvider.ts` | `AIProvider` interface + `AIStreamCallbacks` + `ChatHistoryMessage` |
| `src/main/ai/AnthropicClient.ts` | Claude: sendMessage + stream, history, error classification (i18n) |
| `src/main/ai/GeminiClient.ts` | Gemini: sendMessage + stream (SSE), retry, quota, history (i18n) |

## i18n (`src/shared/i18n/`)

| File | What it does |
|---|---|
| `src/shared/i18n/index.ts` | Engine: `t(key, params?)`, `setLocale()`, `getLocale()`. Fallback en→key |
| `src/shared/i18n/en.json` | ~250 keys in English (source of truth) |
| `src/shared/i18n/es.json` | ~250 keys in Spanish |

## Preload (`src/preload/`)

| File | What it does |
|---|---|
| `src/preload/index.ts` | contextBridge: ssh, sessions, folders, credentials, ai (stream), sftp (full CRUD + transfers), local (fs), settings, app (windowState) |

## Shared Types (`src/shared/`)

| File | What it does |
|---|---|
| `src/shared/ipc-channels.ts` | All IPC channels: SSH, SESSIONS, AI (stream), SFTP (12 ops), LOCAL (3 ops), APP |
| `src/shared/types.ts` | Interfaces: `Locale`, `AppSettings`, `SftpStatResult`, `LocalEntry`, `TransferItem`, `WindowState`, `ElectronAPI` |
| `src/shared/Redactor.ts` | Redactor with `RedactedPatternType` and `matchedTypes` |

## Renderer (`src/renderer/`)

| File | What it does |
|---|---|
| `src/renderer/App.tsx` | Root layout: ConfirmProvider + LanguageProvider, viewMode (terminal/sftp), multiExec |
| `src/renderer/hooks/LanguageContext.tsx` | React context for language |
| `src/renderer/hooks/useTranslation.ts` | `{ t }` hook for components |
| `src/renderer/hooks/useConfirm.tsx` | ConfirmProvider + `useConfirm()` for custom dialogs |
| **SessionList/** | Folder/session tree, drag & drop, context menu |
| **Terminal/** | Multi-tab, split view, multi-execution (input + paste), live settings (font, cursor) |
| **AiChat/** | AI chat: streaming, history, quota bar, multi-tab |
| **Settings/** | Modal with sidebar (5 sections), functional language selector, terminal config |
| **Credentials/** | Credentials CRUD |
| **FileExplorer/** | Simple file explorer (right panel) |
| **SplashScreen/** | Loading screen (5s) with "jcoTerm" |
| **LockScreen/** | Unlock password (create/verify) |
| **SftpManager/** | Dual-pane SFTP manager: ConnectionBar, FilePane, FileTable, Breadcrumb, ContextMenu, TransferQueue, ChmodDialog |

## Tests (`src/tests/`) — 300 tests, 20 suites

| File | Tests |
|---|---|
| `sftp-handlers.test.ts` | 28 — SFTP handlers (stat, mkdir, rmdir, unlink, rename, chmod, download, upload) |
| `local-handlers.test.ts` | 11 — Local fs handlers (listDir, homePath, drives) |
| `lock-store.test.ts` | 11 — Lock password (PBKDF2 hash, verify, persist) |
| Other 17 suites | 250 — SSH, sessions, credentials, folders, settings, security, redactor, AI |
