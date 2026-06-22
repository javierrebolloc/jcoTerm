# CLAUDE.md — SSH AI Client

Read this file at the start of each session before touching any code.

## What is this project

Desktop SSH client for Windows (Electron + TypeScript) with an AI chat side panel (Anthropic). The AI can read the visible terminal content when the user asks, but **it can never write to the SSH session or execute commands**. This restriction is guaranteed by architecture.

## Stack

| Layer | Technology |
|---|---|
| Framework | Electron |
| Language | TypeScript (strict) |
| Build | electron-vite |
| UI | React + CSS Modules |
| Terminal | xterm.js |
| SSH | ssh2 |
| Secure storage | AES-256-GCM (key derived from lock password via PBKDF2) |
| Non-sensitive config | electron-store |
| AI | @anthropic-ai/sdk → Anthropic API |
| Packaging | electron-builder |
| Unit tests | Vitest |
| E2E tests | Playwright (official Electron support) |
| Linting | ESLint + Prettier |

## Key commands

```bash
npm run dev          # Electron in development mode (HMR)
npm run build        # Production build
npm run dist         # Build + Windows installer packaging
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest (unit + integration)
npm run test:e2e     # Playwright E2E
npm run test:watch   # Vitest in watch mode
```

## Inviolable security rules

1. **SSH and credentials ONLY in the main process.** The renderer never touches credentials in the clear.
2. **contextIsolation: true, nodeIntegration: false** on every BrowserWindow.
3. **The AI is strictly read-only.** There is no IPC channel connecting AI output to SSH input. This is verified in code and in tests.
4. **Credentials encrypted with AES-256-GCM**, key derived from the lock password with PBKDF2. The key only exists in memory after unlock. Never in plaintext on disk, never in logs. Portable across machines.
5. **Redaction of secrets before sending context to the AI.** The user sees what will be sent before confirming.
6. **Validate and sanitize all IPC inputs in main** before using them.

## Agent documentation (.claude/)

| File | Contents |
|---|---|
| `brief.md` | The original complete brief (immutable) |
| `architecture.md` | Process diagram, IPC data flow |
| `code-map.md` | Module → file map with one-line description |
| `conventions.md` | Style, naming, patterns we follow |
| `decisions.md` | Technical decision log (lightweight ADR) |
| `progress.md` | Current status by phase and next steps |
| `security.md` | Detailed security model |
| `testing.md` | Test strategy, coverage, conventions |

## Phases

- **Phase 1** — Basic SSH terminal (with tests)
- **Phase 2** — Saved sessions + Settings (with tests)
- **Phase 3** — AI chat panel (with tests)
