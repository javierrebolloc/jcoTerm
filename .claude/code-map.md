# code-map.md — Code Map

Consult this file to go directly to the right module without scanning the tree.

## Main Process (`src/main/`)

| File | What it does |
|---|---|
| `src/main/index.ts` | Entry point: BrowserWindow, CSP, IPC handlers, `setLocale()`, window state store, renderer logging, crash handlers (`uncaughtException`/`unhandledRejection`), close confirmation via IPC, `before-quit` cleanup |
| `src/main/portable.ts` | Portable mode detection (`portable` file next to the .exe) |
| `src/main/logger.ts` | Initializes electron-log (file + console) |
| `src/main/security.ts` | CSP, IPC validators, `sanitizeSshError` (i18n with detail fallback), `IpcRateLimiter` |
| `src/main/ipc/ssh.handlers.ts` | SSH connect/disconnect/input/resize, host key verify, rate limiting, failed session cleanup |
| `src/main/ipc/session.handlers.ts` | Saved sessions CRUD |
| `src/main/ipc/settings.handlers.ts` | settings:get/set, `setLocale()` on language change, `appVersion` |
| `src/main/ipc/credential.handlers.ts` | Named credentials CRUD |
| `src/main/ipc/folder.handlers.ts` | Folders CRUD |
| `src/main/ipc/sftp.handlers.ts` | SFTP: listDir, realpath, stat, mkdir, rmdir, unlink, rename, chmod, download (bg stream), upload (bg stream), editRemote (temp+open+watch+re-upload) |
| `src/main/ipc/local.handlers.ts` | Local filesystem: listDir, homePath, drives (Windows A:-Z:) |
| `src/main/ipc/ai.handlers.ts` | AI: streaming via push events, `calculateMaxTokens()`, conversation history |
| `src/main/ssh/SshManager.ts` | Registry of active SSH sessions |
| `src/main/ssh/SshSession.ts` | ssh2 wrapper: shell, SFTP (8 ops), `formatPermissions()`, streaming download/upload, keepalive (30s interval, 3 max), `client.on('close')` for TCP drop detection |
| `src/main/storage/JsonFileStore.ts` | Base class: cache, atomic write, backup |
| `src/main/storage/SessionStore.ts` | Sessions CRUD (JSON) — atomic write (tmp+rename), backup (.bak), corruption recovery |
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
| `src/shared/i18n/en.json` | ~305 keys in English (source of truth) |
| `src/shared/i18n/es.json` | ~305 keys in Spanish |

## Preload (`src/preload/`)

| File | What it does |
|---|---|
| `src/preload/index.ts` | contextBridge: ssh, sessions, folders, credentials, ai (stream), sftp (full CRUD + transfers), local (fs), settings, app (windowState, confirmClose, lock) |

## Shared Types (`src/shared/`)

| File | What it does |
|---|---|
| `src/shared/ipc-channels.ts` | All IPC channels: SSH, SESSIONS, AI (stream), SFTP (14 ops incl. editRemote, editSaveError), LOCAL (3 ops), APP (confirmClose) |
| `src/shared/types.ts` | Interfaces: `Locale`, `AppSettings`, `SftpStatResult`, `LocalEntry`, `TransferItem`, `WindowState`, `ElectronAPI` |
| `src/shared/Redactor.ts` | Redactor with `RedactedPatternType` and `matchedTypes` |

## Renderer (`src/renderer/`)

| File | What it does |
|---|---|
| `src/renderer/App.tsx` | Root layout: ConfirmProvider + LanguageProvider + ErrorBoundary, viewMode (terminal/sftp), multiExec, keyboard shortcuts (Ctrl+N/W/Tab/,), SSH disconnect notification, close confirmation via IPC |
| `src/renderer/hooks/LanguageContext.tsx` | React context for language |
| `src/renderer/hooks/useTranslation.ts` | `{ t }` hook for components |
| `src/renderer/hooks/useConfirm.tsx` | ConfirmProvider + `useConfirm()` for custom dialogs |
| `src/renderer/hooks/useFocusTrap.ts` | Focus trap hook for modals (Tab cycling within modal) |
| `src/renderer/styles/globals.css` | CSS variables (colors, spacing, typography, z-index scale, shadows, modal animations) |
| **ErrorBoundary/** | React Error Boundary: catches render errors, shows fallback UI with reload button |
| **SessionList/** | Folder/session tree, drag & drop with reorder (sortOrder), context menu, active session highlight |
| **Terminal/** | Multi-tab (middle-click close), split view with per-cell session selector (swap + empty cells), multi-execution, persistent panes, fitKey for view-switch refit |
| **AiChat/** | AI chat: streaming, history, quota bar, multi-tab |
| **Settings/** | Modal with sidebar (5 sections), functional language selector, terminal config |
| **Credentials/** | Credentials CRUD |
| **FileExplorer/** | Simple file explorer (right panel) |
| **SplashScreen/** | Loading screen (5s) with "jcoTerm" |
| **LockScreen/** | Unlock password (create/verify) with try/catch |
| **SftpManager/** | Dual-pane SFTP manager: ConnectionBar, FilePane (right-click selects), FileTable (resizable columns), Breadcrumb, ContextMenu (edit remote), TransferQueue, ChmodDialog, credential prompt, edit save error toast |

## Scripts (`scripts/`)

| File | What it does |
|---|---|
| `scripts/make-portable.js` | Creates `portable` marker + `data/` dir in win-unpacked build output |

## Tests (`src/tests/`) — 313 tests, 20 suites

| File | Tests |
|---|---|
| `sftp-handlers.test.ts` | 28 — SFTP handlers (stat, mkdir, rmdir, unlink, rename, chmod, download, upload) |
| `local-handlers.test.ts` | 11 — Local fs handlers (listDir, homePath, drives) |
| `lock-store.test.ts` | 15 — Lock password (PBKDF2 hash, verify, key derivation, persist) |
| `credential-store.test.ts` | 13 — AES-256-GCM encryption, wrong key, wipe |
| `session-store.test.ts` | 15 — CRUD, atomic writes, backup recovery, corruption handling |
| `ssh-session.test.ts` | 14 — Connect, auth, keepalive config, client close event, write, resize |
| Other 14 suites | 217 — SSH handlers/manager, sessions, credentials, folders, settings, security, redactor, AI |
