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
