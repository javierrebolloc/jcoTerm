# decisions.md — Technical Decision Log

Format: date - decision - alternatives considered - rationale

---

## 2026-06-19 - electron-vite as build tool

**Decision:** Use `electron-vite` instead of webpack or manual Vite configuration.

**Alternatives:** electron-webpack, CRA + Electron, plain Vite with manual scripts.

**Rationale:** electron-vite solves the triple bundle (main/preload/renderer) in an integrated way, with native TypeScript support, HMR in renderer, and minimal configuration. It is the most actively maintained option for new Electron projects in 2024-2025.

---

## 2026-06-19 - React for the renderer

**Decision:** React + CSS Modules for the renderer UI.

**Alternatives:** Vue, Svelte, plain HTML/CSS.

**Rationale:** Mature ecosystem, good integration with xterm.js, typed with TypeScript. CSS Modules avoids extra UI dependencies while keeping styles scoped.

---

## 2026-06-19 - electron-store for non-sensitive configuration

**Decision:** `electron-store` to persist non-sensitive preferences (theme, font, etc.).

**Alternatives:** SQLite (better-sqlite3), manual JSON, renderer localStorage.

**Rationale:** electron-store is encryptable JSON, no native dependencies, simple API. Sufficient for v1. SQLite would be overkill for the amount of data we handle.

---

## 2026-06-19 - safeStorage for credentials

**Decision:** `electron.safeStorage` to encrypt SSH credentials and the Anthropic API key.

**Alternatives:** keytar (deprecated), node-keytar, manual bcrypt.

**Rationale:** safeStorage is Electron's official solution since v15. On Windows it uses DPAPI. It does not require additional native dependencies. keytar is deprecated in favor of safeStorage.

---

## 2026-06-19 - Vitest for unit tests + Playwright for E2E

**Decision:** Vitest (unit/integration) + Playwright with Electron support (E2E).

**Alternatives:** Jest + Spectron (Spectron is deprecated), plain Jest.

**Rationale:** Vitest is faster than Jest and compatible with the Vite ecosystem. Playwright has had official Electron support since 2022, replacing Spectron. Both are industry standard in 2024-2025.

---

## 2026-06-19 - xterm (unscoped) instead of @xterm/xterm

**Decision:** Use `xterm@^5.3.0`, `xterm-addon-fit@^0.8.0`, `xterm-addon-web-links@^0.9.0` (unscoped packages).

**Rationale:** The scoped `@xterm/*` packages only have beta versions on npm (e.g. `@xterm/addon-fit@0.12.0-beta.287`). The stable packages are the unscoped ones. This will be revisited in the future when the scoped packages are stable.

---

## 2026-06-19 - SshSession with injectable factory for tests

**Decision:** The `SshSession` constructor accepts an optional `clientFactory: () => Client` parameter with a default that creates the real ssh2 Client.

**Rationale:** Allows injecting a mock Client in tests without needing to mock the entire `ssh2` module. Clean dependency injection pattern without vi.mock magic.

---

## 2026-06-19 - Interchangeable AI provider layer (AIProvider interface)

**Decision:** Introduce the `AIProvider` interface in `src/main/ai/AIProvider.ts` with `AnthropicClient` and `GeminiClient` implementations. The `ai:sendMessage` IPC handler selects the client by reading `SettingsStore.aiProvider` on each call. The renderer never knows which provider is active; it only sends the message.

**Alternatives:** A single client with an internal flag; two separate IPC channels (`ai:sendAnthopic`, `ai:sendGemini`); passing the provider as a field of the request from the renderer.

**Rationale:** Encapsulates all logic for each provider (endpoint, format, error handling, quota) in its implementation. Changing the active provider is a configuration change, not a code change. The renderer does not need to know which backend is in use, keeping the IPC API surface minimal.

---

## 2026-06-19 - Gemini via native fetch + zero-cost guarantee

**Decision:** `GeminiClient` uses `globalThis.fetch` (available in Node 18+ / Electron 29) instead of the official Google SDK, in order to read HTTP quota headers directly. Retries with exponential backoff (x3) before marking the 429 as actual exhaustion. The API key is encrypted with DPAPI just like the Anthropic key.

**Alternatives:** `@google/generative-ai` SDK; proxy on a self-hosted server to hide the key; no retry on 429.

**Rationale:** (a) The Google SDK does not expose the raw HTTP headers needed to read remaining quota. (b) The known "phantom 429s" on Gemini 2.5 models require transparent retries. (c) Keeping the key in the main process with DPAPI guarantees zero cost: without a billing account on Google, the API will reject any request beyond the free tier even if someone obtained the key.

---

## 2026-06-19 - Terminal copy/paste via renderer Clipboard API

**Decision:** Copy (mouseup -> `term.getSelection()` -> `navigator.clipboard.writeText()`) and paste (contextmenu -> `navigator.clipboard.readText()` -> `sendInput`) are implemented entirely in the renderer without additional IPC.

**Alternatives:** Expose Electron's `clipboard.readText/writeText` via IPC; use Electron's `clipboard` module in main.

**Rationale:** `navigator.clipboard` is Chromium's standard Clipboard API, available in the Electron renderer without needing Node.js. It does not require exposing new IPC channels or additional permissions. The renderer already has legitimate access to the user's clipboard (it is its own window). Adding IPC would only add latency and complexity without security benefit.

---

## 2026-06-19 - Removal of RedactionPreview modal from the send flow

**Decision:** The user clicks Send and the message is sent directly without a confirmation step. The `RedactionPreview.tsx` file remains on disk but is no longer used in `AiChat`.

**Alternatives:** Keep the preview modal; make it optional via a setting.

**Rationale:** The user requested removing the intermediate step. Secret redaction still occurs in main (security invariant maintained). The notice about what is being sent is now in the input's help text ("The last N lines will be sent as context").

---

## 2026-06-19 - `aiContextLines` as a setting to control token cost

**Decision:** New field `aiContextLines: number` (default 100) in `StoredSettings` / `AppSettings`. AiChat receives the value as a prop, takes the full terminal snapshot, and applies `.split('\n').slice(-N).join('\n')` before sending.

**Alternatives:** Hardcoded fixed value; always send the full visible content; limit in the main process.

**Rationale:** The optimal number of lines depends on the user's use case (debugging vs. monitoring vs. log review). A configurable field in Settings allows adjusting it without touching code. Applying the slice in the renderer (before IPC) avoids transferring unnecessary data to the main process.

---

## 2026-06-19 - Fast-fail in GeminiClient when `limit: 0` on all quotas

**Decision:** If the 429 error has all `limit: N` with N=0, a `GeminiQuotaError` is thrown immediately without retrying.

**Alternatives:** Retry anyway (previous behavior); distinguish by error code.

**Rationale:** `limit: 0` means the Google project has no quota allocated for that model — it is not temporary exhaustion but incorrect configuration. Retrying 3 times with waits of 30s/60s/60s (as the API suggested) was misleading and blocked the user ~150s before giving the same error.

---

## 2026-06-19 - AI read-only guarantee by absence of channel

**Decision:** The restriction that AI cannot write to SSH is implemented by absence of channel, not by validation.

**Rationale:** There is no IPC handler or function in the code that connects AnthropicClient output to SshSession input. The guarantee is structural: it cannot be bypassed without deliberately adding code. This is more robust than any validation or permission flag.

---

## 2026-06-20 - SSH host key verification with KnownHostsStore

**Decision:** Implement host key verification using a custom JSON store (`known-hosts.json`) instead of parsing OpenSSH's `~/.ssh/known_hosts`.

**Alternatives:** Parse OpenSSH `known_hosts`; use a library like `sshpk`; trust ssh2 without verification.

**Rationale:** The OpenSSH `known_hosts` format is complex (hashed hostnames, multiple algorithms, options) and parsing it correctly is error-prone. A custom JSON store is simpler, auditable, and allows custom UX (list/delete from Settings). The fingerprint is calculated as SHA-256 of the key buffer, which is the modern standard.

---

## 2026-06-20 - JsonFileStore<T> as base class for JSON stores

**Decision:** Extract a base class `JsonFileStore<T>` that implements generic CRUD with in-memory cache, atomic write (tmp+rename), and automatic backup of corrupt files.

**Alternatives:** Maintain duplication in FolderStore and NamedCredentialStore; use a persistence library.

**Rationale:** FolderStore and NamedCredentialStore had identical JSON read/write code. The base class eliminates duplication and adds protections (atomicity, backup) without external dependencies. CredentialStore does not extend it because it uses a different format (DPAPI encryption), but it had cache and atomic write applied separately.

---

## 2026-06-20 - Split view with always-mounted panes

**Decision:** In Terminal.tsx, all TerminalPanes are always rendered inside a single container. The layout (normal tabs vs grid split) is controlled by changing the container's CSS class, never by unmounting/remounting panes.

**Alternatives:** Two conditional branches with separate panes (original design); React portals.

**Rationale:** The original design with two branches (`{!inSplitMode && ...}` / `{inSplitMode && ...}`) caused React to unmount all panes when switching modes and remount them in the new branch, destroying xterm.js terminals and their buffers. With a single container, React reconciles by `key` and keeps panes alive.

---

## 2026-06-20 - IpcRateLimiter for critical handlers

**Decision:** Implement a simple rate limiter (sliding window) in the main process for SSH connect (10/min) and AI sendMessage (20/min) handlers.

**Alternatives:** No rate limiting (original design); rate limiting in the renderer; generic middleware for all handlers.

**Rationale:** A compromised renderer could spam SSH connections (DoS to the remote server) or AI requests (quota/cost exhaustion). The rate limiter in main is the correct layer because the renderer is untrusted. It is applied only to handlers with external impact, not to local operations like listing sessions.

---

## 2026-06-21 - Streaming AI responses via IPC push events

**Decision:** AI responses are sent incrementally via `webContents.send` (channels `ai:streamChunk`, `ai:streamEnd`, `ai:streamError`). The `ai:sendMessage` handler validates, starts the stream in background, and returns `{ success: true }` immediately. Anthropic uses `client.messages.stream()`, Gemini uses `streamGenerateContent?alt=sse`.

**Alternatives:** Keep full request/response (wait for the entire response before displaying); separate WebSocket; return a serialized ReadableStream.

**Rationale:** Push events via `webContents.send` are Electron's natural pattern for main->renderer streaming (already used for `ssh:output`). It requires no additional infrastructure. The `AIStreamCallbacks` interface decouples transport from provider.

---

## 2026-06-21 - SSH Agent via OpenSSH named pipe

**Decision:** Auth via SSH Agent uses `\\.\pipe\openssh-ssh-agent` as the default agent on Windows, with fallback to `SSH_AUTH_SOCK` if defined.

**Alternatives:** Use only `SSH_AUTH_SOCK`; use Pageant (PuTTY); require the user to configure the path.

**Rationale:** Windows 10+ includes OpenSSH Agent as a system service. The `openssh-ssh-agent` named pipe is the de facto standard. ssh2 supports it natively via the `agent` field of `ConnectConfig`. If the user has a non-standard agent, they can configure it via `SSH_AUTH_SOCK`.

---

## 2026-06-21 - Auto-recovery with separate electron-store

**Decision:** Tab state (savedSessionId + label) is saved in `window-state.json` (separate electron-store from settings) every time it changes. On startup, it is read, immediately cleared, and saved sessions are reconnected.

**Alternatives:** Store in SettingsStore; store in renderer localStorage; store in a manual JSON file.

**Rationale:** A separate store avoids contaminating settings with ephemeral data. Clearing on read prevents failed reconnection loops. Only tabs with `savedSessionId` are saved (direct connections cannot be recovered without credentials).

---

## 2026-06-21 - Dual-pane SFTP manager with multi-tab

**Decision:** Implement a FileZilla-style SFTP file manager with local panel (left) and remote panel (right), integrated as an alternative mode to the terminal (viewMode toggle). Supports multiple simultaneous SFTP connections via tabs.

**Alternatives:** Simple right panel; separate window; integrate into the existing FileExplorer.

**Rationale:** Replacing the main area provides maximum space for both panels. Tabs allow working with multiple servers. Transfers run in background in the main process with progress via IPC push.

---

## 2026-06-21 - i18n with plain JSON without external dependencies

**Decision:** Custom i18n system with `t(key, params?)`, plain JSON with dot-separated keys, React Context for re-render. No i18next or other libraries.

**Alternatives:** i18next + react-i18next; react-intl; custom package with nested objects.

**Rationale:** For 2 languages and ~250 keys, a full library is overkill. Plain JSON is grep-friendly, the `t()` engine is 15 lines, and it works identically in main and renderer. The Context triggers re-renders without prop drilling.

---

## 2026-06-21 - Multi-execution in split view

**Decision:** When multi-execution is active, xterm's `onData` replicates input to all sessionIds in the split. Each terminal can be individually excluded via a toggle in the status bar.

**Alternatives:** Separate input bar that sends commands; middleware in the main process.

**Rationale:** Intercepting `onData` in the renderer is the simplest approach and requires no changes in main. The target array is updated via ref so the mount effect's closure always has the current targets. Individual exclusion allows fine-grained control.

---

## 2026-06-21 - Custom confirmation dialogs (not native confirm())

**Decision:** `ConfirmProvider` + `useConfirm()` hook replace all `window.confirm()` calls with styled dialogs that respect the app's dark theme.

**Rationale:** `window.confirm()` shows a native Windows dialog that breaks the app's aesthetics. The Context + Promise pattern allows `await confirm(msg)` from any component without prop drilling.

---

## 2026-06-21 - MIT License

**Decision:** The project is licensed under MIT. LICENSE file at the root, `license: "MIT"` in package.json, author Javier Rebollo.

**Rationale:** MIT is the most permissive and standard license for open-source software. It allows commercial use, modification, and redistribution without restrictions. Compatible with all project dependencies.

---

## 2026-06-22 - Splash screen as renderer component

**Decision:** 5-second splash screen implemented as a React component (`SplashScreen.tsx`) displayed before the main app, controlled by `AppPhase` state in `App.tsx`.

**Alternatives:** Separate splash window in main process; native BrowserWindow splash.

**Rationale:** Keeping it as a React component in the same renderer simplifies lifecycle management. There is no overhead of creating/closing an additional window. The transition to the lock screen is instant.

---

## 2026-06-22 - Lock password with PBKDF2

**Decision:** The lock password is hashed with `crypto.pbkdf2Sync` (100,000 iterations, SHA-512, 32-byte random salt). `{ salt, hash, iterations }` is stored in `lock.json` in userData. Verification uses `crypto.timingSafeEqual`.

**Alternatives:** Store the password encrypted with safeStorage; bcrypt; argon2.

**Rationale:** PBKDF2 is available in Node.js without external dependencies. 100K iterations with SHA-512 is resistant to brute force. `timingSafeEqual` prevents timing attacks. safeStorage is not used because the purpose is not to hide the user's password from the system (that would be circular), but to verify that whoever opens the app knows it.

---

## 2026-06-22 - Session export/import without credentials

**Decision:** Export saves sessions + folders in a portable JSON file. Credentials (passwords, private keys, namedCredentialId) are not included. Import generates new UUIDs to avoid collisions and remaps folderIds.

**Alternatives:** Export with encrypted credentials; export only sessions without folders.

**Rationale:** Credentials are encrypted with AES-256-GCM and are not portable without the lock password. Exporting folders preserves the organization. Generating new IDs on import prevents accidental overwrites.

---

## 2026-06-22 - Replacement of safeStorage (DPAPI) with AES-256-GCM derived from lock password

**Decision:** All credentials are encrypted with AES-256-GCM. The encryption key (32 bytes) is derived from the user's lock password via PBKDF2 (100K iterations, SHA-512, random salt independent from the verification salt). The key only exists in memory. safeStorage/DPAPI completely removed.

**Alternatives:** Keep DPAPI (not portable); hybrid encryption (DPAPI + AES fallback); bcrypt/argon2 to derive the key.

**Rationale:** (a) DPAPI ties credentials to the Windows user+machine — makes portability impossible. (b) Deriving the key from the lock password guarantees that without the password there is no access to credentials. (c) Changing the password automatically invalidates old credentials (different salt -> different key). (d) PBKDF2+AES-256-GCM are standard, no external dependencies, available in Node.js crypto. (e) Two separate salts (verification + encryption) prevent the verification hash from leaking information about the encryption key.

---

## 2026-06-22 - Portable mode with marker file

**Decision:** If a `portable` file exists next to the executable, the app redirects `app.setPath('userData', './data/')` to store everything alongside the .exe. Detection runs before `app.whenReady()` so that electron-store and all stores use the portable path.

**Alternatives:** Command-line flag; environment variable; always portable.

**Rationale:** A marker file is the standard pattern for portable apps on Windows (used by Firefox Portable, VSCode Portable, etc.). It allows the same binary to work as installed or portable without recompilation. Early detection guarantees that all stores are initialized with the correct path.

---

## 2026-06-22 - Gemini API key in header instead of URL

**Decision:** Move the Gemini API key from `?key=` URL query parameter to the `x-goog-api-key` HTTP header.

**Rationale:** API keys in URLs appear in proxy logs, server access logs, and Electron's net-internals. Header-based auth avoids this leak vector. Google's REST API supports both methods.

---

## 2026-06-22 - PBKDF2 iterations increased to 600K

**Decision:** Increase PBKDF2 iterations from 100K to 600K for the lock password.

**Rationale:** OWASP recommends at least 600K iterations for PBKDF2-SHA512 as of 2023. 100K is brute-forceable with modern GPUs if the attacker obtains `lock.json`. The `iterations` field is stored in the JSON, so existing passwords verify with their original count.

---

## 2026-06-22 - SFTP local path restriction

**Decision:** SFTP download/upload `localPath` is validated to be within `app.getPath('home')`. Paths outside the user's home directory are rejected.

**Rationale:** Without restriction, a compromised renderer could write to any local path (download) or read any local file (upload). Restricting to home is a practical defense-in-depth measure.

---

## 2026-06-22 - Navigation and window.open blocked

**Decision:** `will-navigate` events are prevented and `setWindowOpenHandler` denies all new windows.

**Rationale:** If XSS is achieved in the renderer, the attacker could navigate to an external URL or open new windows. Blocking both is an Electron security best practice.

---

## 2026-06-23 - Close confirmation via IPC instead of native dialog

**Decision:** When closing with active SSH sessions, the main process sends `app:confirmClose` to the renderer, which shows a styled confirm dialog. The renderer responds via `app:confirmCloseResponse`. If confirmed, main sets a `forceClose` flag and destroys the window.

**Alternatives:** `dialog.showMessageBoxSync()` (native Windows dialog); `window.onbeforeunload`.

**Rationale:** The native dialog looks jarring against the dark-themed app. IPC-based flow reuses the existing `useConfirm` infrastructure for consistent styling.

---

## 2026-06-23 - SessionStore atomic writes with backup recovery

**Decision:** SessionStore now uses temp+rename writes (like JsonFileStore), creates a `.bak` before each write, and recovers from backup if the main file is corrupt.

**Alternatives:** Keep direct `writeFileSync`; use SQLite; rely on OS journaling.

**Rationale:** SessionStore was the only store without atomic writes — a crash during write would lose all saved sessions. The `.bak` file provides a recovery path.

---

## 2026-06-23 - SSH keepalive and TCP close detection

**Decision:** `ssh2.connect()` now uses `keepaliveInterval: 30_000` and `keepaliveCountMax: 3`. Added `client.on('close')` handler to detect silent TCP drops.

**Alternatives:** Application-level ping; no keepalive (previous behavior).

**Rationale:** Without keepalive, NAT/firewall timeouts silently kill idle connections after 5-15 minutes. The `client.on('close')` handler ensures the UI updates when TCP drops without error.

---

## 2026-06-23 - Split view with per-cell session selector and swap

**Decision:** Each split cell has a `<select>` dropdown to choose which session to display. Selecting a session already in another cell swaps them. All TerminalPanes are always mounted (keyed by `sshSessionId`), positioned via CSS grid `order`.

**Alternatives:** Fixed assignment (first N sessions); duplicate same session in multiple cells; unmount/remount panes on change.

**Rationale:** (a) Users need to choose which sessions appear in each cell. (b) Swap prevents duplicates. (c) Always-mounted panes preserve xterm.js buffers — switching doesn't lose content.

---

## 2026-06-23 - CSS design token centralization

**Decision:** Added 16 CSS variables to `globals.css` (accent-contrast, on-danger, overlay, shadows, z-index scale). Replaced hardcoded colors across 16+ CSS files.

**Alternatives:** Keep hardcoded values; CSS-in-JS; theme library.

**Rationale:** Centralizing tokens enables future theme support and ensures visual consistency. The z-index scale eliminates collision between UI layers.

---

## 2026-06-24 - xterm.js Viewport error suppression via window error handler

**Decision:** Suppress the `Cannot read properties of undefined (reading 'dimensions')` error from xterm.js using a `window.addEventListener('error', ...)` handler with `e.preventDefault()` in `useTerminal.ts`. Also buffer SSH output received before `term.open()` completes.

**Alternatives:** Patch xterm.js source; remove React StrictMode; delay terminal creation.

**Rationale:** The error originates from xterm's internal `Viewport._innerRefresh` and `Viewport.syncScrollArea` — `requestAnimationFrame` callbacks that fire after `term.dispose()` in React Strict Mode's mount→cleanup→mount cycle. The error is harmless (the second terminal works fine) but pollutes logs. Buffering pre-open writes prevents a separate race where SSH output arrives before `term.open()` initializes the renderer.

---

## 2026-06-24 - SFTP edit remote via temp file + fs.watch

**Decision:** `sftp:editRemote` IPC handler downloads the remote file to `%TEMP%/jcoterm-edit/`, opens it with `shell.openPath()` (default system editor), and watches the local copy with `fs.watch()`. On each save (debounced 500ms), it re-uploads to the remote path. A 1-hour timeout cleans up the watcher and temp file. Re-upload errors are sent to the renderer via a push event (`sftp:editSaveError`).

**Alternatives:** Embed a code editor (Monaco/CodeMirror); open via a custom IPC dialog; no auto-upload.

**Rationale:** Using the system's default editor respects user preferences and avoids bundling a heavy editor. `fs.watch` is the simplest cross-platform file monitoring. The debounce prevents duplicate uploads from editors that write multiple times on save. The error push channel ensures the user sees permission errors in the UI, not just in logs.

---

## 2026-06-24 - View panel stacking with visibility:hidden instead of display:none

**Decision:** The terminal and SFTP panels are stacked with `position: absolute; inset: 0`. The hidden panel uses `visibility: hidden; pointer-events: none` instead of `display: none`.

**Alternatives:** `display: none` (original); conditional rendering; CSS `opacity: 0`.

**Rationale:** `display: none` destroys container dimensions. When xterm becomes visible again, `fitAddon.fit()` calculates wrong cols/rows from the zero-size container, sending an incorrect `resize` to the SSH server which re-draws the prompt garbled. `visibility: hidden` keeps dimensions intact — xterm always knows its real size.

---

## 2026-06-24 - Flexible splits (empty cells)

**Decision:** Split mode (2/4/8) is allowed regardless of how many sessions are active. Empty cells show a "No session assigned" placeholder with a `<select>` to assign a session. New connections automatically fill the first empty cell.

**Alternatives:** Require enough sessions before enabling split; duplicate sessions in empty cells.

**Rationale:** Users may want to set up a 4-split layout and then connect sessions one by one. Forcing a minimum session count was frustrating. Empty cells are cheap (no xterm instance) and the auto-fill ensures new connections appear in the grid without manual assignment.

---

## 2026-06-24 - Session reorder via sortOrder field

**Decision:** Added `sortOrder?: number` to `SavedSession`. Dragging a session onto another session (not a folder) inserts it before or after based on cursor position (top/bottom half). All siblings in the same folder get renumbered 0..N.

**Alternatives:** Array-index-based ordering (fragile); linked-list ordering; fractional ordering.

**Rationale:** Integer renumbering is simple and idempotent. The `sortOrder` field is optional — sessions without it default to 0, preserving backward compatibility with existing data. Cross-folder drag also works: the session moves to the target's folder and is inserted at the drop position.

---

## 2026-06-24 - Custom application menu replacing Electron default

**Decision:** Replace the default Electron menu with a custom `Menu.setApplicationMenu()` containing jcoTerm (Settings, Quit), Edit (standard clipboard ops), View (reload, devtools, zoom), and Help (About). Settings and About open via IPC push events (`app:menuOpenSettings`, `app:menuOpenAbout`).

**Alternatives:** Keep default Electron menu; frameless window with custom title bar; hide menu entirely.

**Rationale:** The default menu shows generic "Electron" branding and lacks app-specific actions. A custom menu provides standard keyboard accelerators (Ctrl+, for Settings, Ctrl+Q for Quit), integrates with the existing SettingsModal (About opens the "about" section), and maintains the native menu bar users expect on Windows.

---

## 2026-06-24 - Local filesystem operations (mkdir, delete, openFile) via IPC

**Decision:** Added `local:mkdir`, `local:delete`, and `local:openFile` IPC handlers. All validate that the resolved path is within `app.getPath('home')`. Delete uses `fs.rmdir` for directories and `fs.unlink` for files (no recursive delete).

**Alternatives:** Allow arbitrary paths; recursive delete; delegate to shell for delete (recycle bin).

**Rationale:** Restricting to home directory prevents a compromised renderer from modifying system files. Non-recursive delete is intentional — prevents accidental deletion of directory trees. `shell.openPath` for edit reuses the OS default editor, consistent with the SFTP edit-remote feature.
