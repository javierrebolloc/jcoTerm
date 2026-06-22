# tasks-tests.md — Test Coverage Tasks

Generated: 2026-06-20. Full project review.

## Modules Without Tests (0% coverage) → RESOLVED

- [x] **TEST-01: IPC session.handlers.ts** — 18 tests (list enrichment, save with/without credentials, delete cascade, getFilePath)
- [x] **TEST-03: IPC credential.handlers.ts** — 12 tests (list, save UUID gen/validation, delete cascade)
- [x] **TEST-04: IPC folder.handlers.ts** — 13 tests (list, save UUID gen, sanitizeForLog, delete validation)
- [x] **TEST-06: SshManager.ts** — 17 tests (create, get, remove, closeAll, activeCount, disconnect on remove)
- [x] **TEST-07: AnthropicClient.ts** — 16 tests (sendMessage, error classification: auth/rate limit/overloaded/network/generic)
- [x] **TEST-08: SettingsStore.ts** — 10 tests (get defaults, set individual/multiple, getSessionsFilePath)
- [x] **TEST-09: FolderStore.ts** — 12 tests (list/save/delete/findById, corrupt JSON backup)
- [x] **TEST-10: NamedCredentialStore.ts** — 11 tests (list/save/delete/findById, corrupt JSON)
- [x] **KnownHostsStore.ts** (new) — 13 tests (lookup/add/verify match/mismatch/unknown, cache, corrupt file)

## Security Tests

- [x] **TEST-16: Security validators (security.ts)** — 32 tests (isValidHost IPv4 octets, isValidTerminalDimension, isValidSettingsPath, sanitizeSshError, sanitizeForLog, IpcRateLimiter)

## Pending (low priority)

- [ ] **TEST-02: IPC settings.handlers.ts** — settings:get/set handlers with API key storage and path migration.
- [ ] **TEST-05: IPC sftp.handlers.ts** — withSftpSession middleware, listDir/realpath validation.
- [ ] **TEST-11: ssh-handlers.test.ts only tests validators** — No tests for the full SSH.CONNECT handler.
- [ ] **TEST-12: SshSession SFTP methods** — listDir() and realpath() without tests.
- [ ] **TEST-13: Redactor edge cases** — Quoted passwords, special characters, multiple overlapping patterns.
- [ ] **TEST-14: GeminiClient network errors** — fetch exceptions, non-parseable body.
- [ ] **TEST-15: ai-provider-routing missing paths** — Unknown provider, generic errors.
- [ ] **TEST-17: Credential non-leakage tests** — Verify that passwords don't appear in error messages.
- [ ] **TEST-18: No coverage reporting** — Configure `npm run test:coverage`.
- [ ] **TEST-19: Minimal E2E tests** — Only 3 smoke tests, missing complete flows.
- [ ] **TEST-20: Weak assertions** — toBeGreaterThanOrEqual in redactor, loose toContain.

## Coverage Summary

| Suite | Tests (before) | Tests (now) |
|---|---|---|
| ssh-session | 10 | 10 |
| ssh-handlers | 14 | 14 |
| ssh-manager | — | **17** |
| session-store | 11 | 11 |
| session-handlers | — | **18** |
| credential-store | 11 | 11 |
| credential-handlers | — | **12** |
| folder-store | — | **12** |
| folder-handlers | — | **13** |
| named-credential-store | — | **11** |
| known-hosts-store | — | **13** |
| settings-store | — | **10** |
| security | — | **32** |
| redactor | 16 | 16 |
| anthropic-client | — | **16** |
| gemini-client | 29 | 29 |
| ai-provider-routing | 7 | 7 |
| **Total** | **98** | **252** |
