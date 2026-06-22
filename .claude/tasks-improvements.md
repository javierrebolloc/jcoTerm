# tasks-improvements.md — Proposed Improvements and Features

Generated: 2026-06-20. Full project review.

## UX

- [x] **UX-01: AI response streaming** — Resolved: IPC streaming via `ai:streamChunk/End/Error`, `sendMessageStream` in both providers.
- [x] **UX-02: Loading states during SSH connection** — Resolved: `connectingSessionId` + spinner in SessionItem.
- [x] **UX-03: More informative error messages** — Resolved: SFTP includes path, Gemini RPM/TPM indicates reset, SSH Agent error.
- [x] **UX-04: Configurable Anthropic model in Settings** — Resolved: `anthropicModel` in SettingsStore + UI selector.
- [x] **UX-05: Session auto-recovery after crash** — Resolved: `window-state.json` with tabs, auto-reconnect on start.

## Functionality

- [x] **FEAT-01: SSH Agent integration (Windows OpenSSH Agent)** — Resolved: `authMethod: 'agent'`, OpenSSH Agent pipe.
- [x] **FEAT-02: Dynamic max_tokens for Anthropic and Gemini** — Resolved: `calculateMaxTokens(contextLength)`, 1024-4096.
- [x] **FEAT-03: Detailed redaction log** — Resolved: `matchedTypes` in RedactorResult, log with types.

## DevOps

- [x] **DEVOPS-01: npm audit in CI/build** — Resolved: `npm run audit` script.
- [x] **DEVOPS-02: Update dependencies** — Resolved: `@anthropic-ai/sdk ^0.105.0`, `electron-store ^8.2.0`. React/Electron/ESLint major bumps pending (separate migration).
