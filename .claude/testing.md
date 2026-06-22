# testing.md — Testing Strategy

## Commands

```bash
npm test              # Vitest (unit + integration), single run
npm run test:watch    # Vitest in watch mode
npm run test:e2e      # Playwright E2E against the compiled Electron app
```

## Tools

| Tool | Usage | Justification |
|---|---|---|
| Vitest | Unit and integration | Compatible with electron-vite, faster than Jest, identical API |
| Playwright | E2E with Electron | Official Electron support, replaces the deprecated Spectron |

## Coverage by Phase

### Phase 1 — Basic SSH Terminal

**Vitest:**
- `redactor.test.ts` — all redaction patterns (priority coverage)
- `ssh-handlers.test.ts` — error handling in connect/disconnect/input (ssh2 mocked)
- `ssh-session.test.ts` — output events, reconnection, clean shutdown

**Playwright:**
- `app.spec.ts` — the app starts, shows the main UI without errors

### Phase 2 — Saved Sessions

**Vitest:**
- `session-store.test.ts` — save/load/delete, nonexistent session
- `settings-store.test.ts` — get/set preferences, default values

**Playwright:**
- `sessions.spec.ts` — open new session modal, save, see in list, double-click to connect (SSH mocked)

### Phase 3 — AI Panel

**Vitest:**
- `ai-context.test.ts` — terminal snapshot construction, character limits, manual selection
- `anthropic-client.test.ts` — HTTP error handling, timeout, invalid API key (fetch mocked)
- `redactor.test.ts` (extended) — combinations of secrets in real terminal context

**Playwright:**
- `ai-panel.spec.ts` — open AI panel, enter question, see redaction preview, confirm send, receive mocked response

## Test Conventions

- **No real credentials.** ssh2 and `@anthropic-ai/sdk` always mocked with `vi.mock()`.
- **No real network.** Use `vi.mock` for `fetch` or the Anthropic client in unit tests; intercept with Playwright for E2E.
- **CredentialStore with encryption key injected in tests.** A `crypto.randomBytes(32)` is passed as AES-256-GCM key.
- **Test naming:** `describe('ModuleName') > it('what it does when what condition')`.
- **One main assertion per test.** Multiple assertions only if verifying the same invariant.
- **Security tests first:** redactor and session-store have coverage priority.

## Architectural Invariant Test (Security)

In `src/tests/architecture.test.ts` (Phase 3):
- Verify (by analyzing the import graph or via mocks) that no code path exists connecting `AnthropicClient.sendMessage` with `SshSession.write`.
- This test acts as a safety net against accidental regressions in the read-only restriction.

## File Configuration

- `vitest.config.ts` at the root: `node` environment for main tests, `jsdom` for renderer tests.
- `playwright.config.ts`: `use: { channel: 'electron' }`, points to the binary compiled by electron-vite.
- Unit test directory: `src/tests/`.
- E2E test directory: `e2e/`.
