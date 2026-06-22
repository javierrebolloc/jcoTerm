# jcoTerm

SSH desktop client for Windows with an integrated AI chat panel (read-only). Built with Electron + TypeScript.

## Features

- SSH terminal with xterm.js (colors, resize, scrollback)
- Session management with folders and drag & drop
- Encrypted credentials (AES-256-GCM derived from lock password via PBKDF2)
- AI chat panel (Anthropic Claude / Google Gemini) — strictly read-only, cannot write to SSH
- Secret redaction before sending terminal context to AI
- SFTP file manager (dual-pane, transfers with progress)
- Multi-tab terminal with split view and multi-execution
- Portable mode — run from USB, all data stored next to the exe
- i18n (English / Spanish)

## Quick start

```bash
npm install
npm run dev          # Development mode with HMR
npm run build        # Production build
npm test             # Run tests (Vitest, 306 tests)
```

## Portable build

```bash
npm run dist:portable
```

Creates `release/win-unpacked/` with `jcoTerm.exe`, a `portable` marker file, and a `data/` directory. Copy the entire folder to a USB drive or another machine — all settings, sessions, and encrypted credentials are stored in `data/`.

## Security

- Lock password required on every launch
- Credentials encrypted with AES-256-GCM; key derived from lock password via PBKDF2 (100K iterations, SHA-512)
- Encryption key exists only in memory while the app is unlocked — never written to disk
- Changing the lock password wipes all stored credentials
- AI is strictly read-only — no IPC channel connects AI output to SSH input (structural guarantee, verified by tests)
- Context isolation, Node.js disabled in renderer, sandbox enabled
- Secret redaction (passwords, keys, tokens) before sending context to AI

## Stack

| Layer | Technology |
|---|---|
| Framework | Electron |
| Language | TypeScript (strict) |
| Build | electron-vite |
| UI | React + CSS Modules |
| Terminal | xterm.js |
| SSH | ssh2 |
| Encryption | AES-256-GCM (PBKDF2 key derivation) |
| Config | electron-store |
| AI | Anthropic SDK / Gemini API |
| Packaging | electron-builder |
| Tests | Vitest |

## Project structure

```
src/
  main/          # Main process: SSH, storage, AI, security
  preload/       # contextBridge API (minimal surface)
  renderer/      # React UI (sandboxed, no Node.js)
  shared/        # Shared TypeScript types and i18n
  tests/         # Unit tests (Vitest)
scripts/         # Build scripts (portable packaging)
.claude/         # Agent documentation (architecture, decisions, progress)
```

## License

MIT — Javier Rebollo
