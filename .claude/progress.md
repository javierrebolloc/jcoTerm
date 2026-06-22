# progress.md — Project Status

Last updated: 2026-06-22

## Current Status: Complete app with SFTP, i18n, multi-execution, splash, lock, export/import

## Phases

| Phase | Status | Description |
|---|---|---|
| Initial documentation | ✅ Complete | CLAUDE.md + .claude/ created |
| **Phase 1** — Basic SSH Terminal | ✅ Complete | Clean build |
| **Phase 2** — Saved Sessions + Settings | ✅ Complete | Clean build |
| **Phase 3** — AI Panel | ✅ Complete | Redactor + AnthropicClient + AiChat |
| **Gemini Extension** | ✅ Complete | GeminiClient + provider selector + quota bar |
| **UX Improvements (session 19-20)** | ✅ Complete | aiContextLines, copy/paste, debounce resize, audits |
| **E2E Improvements (session 21 AM)** | ✅ Complete | AI streaming, SSH Agent, auto-recovery, loading states |
| **Settings with sidebar** | ✅ Complete | Modal with section navigation, new terminal settings |
| **SFTP Manager** | ✅ Complete | Dual-pane FileZilla-like, transfers, chmod, multi-tab |
| **i18n** | ✅ Complete | English (default) + Spanish, professional system with flat JSON |
| **Multi-execution** | ✅ Complete | Commands replicated across all terminals in the split |
| **Splash screen** | ✅ Complete | Loading screen 5s with "jcoTerm" |
| **Lock screen** | ✅ Complete | Unlock password with PBKDF2 |
| **Export/Import** | ✅ Complete | Export/import sessions and folders (without credentials) |

## Current Tests: 306

| Suite | Tests |
|---|---|
| `ssh-session.test.ts` | 10 |
| `ssh-handlers.test.ts` | 14 |
| `ssh-manager.test.ts` | 17 |
| `session-store.test.ts` | 11 |
| `session-handlers.test.ts` | 18 |
| `credential-store.test.ts` | 13 |
| `credential-handlers.test.ts` | 12 |
| `folder-store.test.ts` | 12 |
| `folder-handlers.test.ts` | 13 |
| `named-credential-store.test.ts` | 11 |
| `known-hosts-store.test.ts` | 13 |
| `settings-store.test.ts` | 12 |
| `security.test.ts` | 32 |
| `redactor.test.ts` | 16 |
| `anthropic-client.test.ts` | 16 |
| `gemini-client.test.ts` | 29 |
| `ai-provider-routing.test.ts` | 5 |
| `sftp-handlers.test.ts` | 28 |
| `local-handlers.test.ts` | 11 |
| `lock-store.test.ts` | 15 |
| **Total** | **306** |

## Pending (low impact)

- SEC-15: JS strings cannot be zeroed out (language limitation)
- API-08: Automatic SSH reconnection
- API-18: Settings migration between versions
- E2E tests with Playwright
- xterm.js dimensions error (cosmetic, try-catch on open)
- Multi-exec paste: right-click paste replicates to all terminals in the split
- Split layout optimized: reduced padding/statusBar, min-width/min-height on cells
