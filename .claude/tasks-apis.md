# tasks-apis.md — API, Functionality, and Performance Tasks

Generated: 2026-06-20. Full project review.

## Anthropic API

- [ ] **API-01: No streaming in AnthropicClient** — Requires IPC architecture change (incremental event).
- [x] **API-02: No error classification** — Resolved.
- [ ] **API-03: max_tokens hardcoded to 1024** — Pending.
- [ ] **API-04: Anthropic model not configurable** — Pending.

## Gemini API

- [x] **API-05: No retry for 500/503** — Resolved.
- [x] **API-06: resetAt doesn't validate future** — Resolved.

## SSH (ssh2)

- [x] **API-07 to API-12** — All resolved.
- [ ] **API-08: No automatic reconnection** — Requires UX design (keepalive + auto-reconnect dialog).

## xterm.js

- [x] **API-13 to API-16** — All resolved.

## electron-store

- [x] **API-17: Validation schema** — Resolved.
- [ ] **API-18: Settings migration** — Pending (not urgent until the next schema change).
- [x] **API-19 to API-21** — Resolved.

## Performance

- [ ] **API-22: SFTP without directory cache** — Pending (low priority).
