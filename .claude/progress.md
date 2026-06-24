# progress.md — Project Status

Last updated: 2026-06-24

## Current Status: Production-ready with SFTP edit, session reorder, flexible splits, and terminal stability fixes

## Phases

| Phase | Status | Description |
|---|---|---|
| Initial documentation | ✅ Complete | CLAUDE.md + .claude/ created |
| **Phase 1** — Basic SSH Terminal | ✅ Complete | Clean build |
| **Phase 2** — Saved Sessions + Settings | ✅ Complete | Clean build |
| **Phase 3** — AI Panel | ✅ Complete | Redactor + AnthropicClient + AiChat |
| **Gemini Extension** | ✅ Complete | GeminiClient + provider selector + quota bar |
| **UX Improvements** | ✅ Complete | aiContextLines, copy/paste, debounce resize, audits |
| **E2E Improvements** | ✅ Complete | AI streaming, SSH Agent, auto-recovery, loading states |
| **Settings with sidebar** | ✅ Complete | Modal with section navigation, new terminal settings |
| **SFTP Manager** | ✅ Complete | Dual-pane FileZilla-like, transfers, chmod, multi-tab |
| **i18n** | ✅ Complete | English (default) + Spanish, professional system with flat JSON |
| **Multi-execution** | ✅ Complete | Commands replicated across all terminals in the split |
| **Splash screen** | ✅ Complete | Loading screen 5s with "jcoTerm" |
| **Lock screen** | ✅ Complete | Unlock password with PBKDF2 |
| **Export/Import** | ✅ Complete | Export/import sessions and folders (without credentials) |
| **Portable mode** | ✅ Complete | Marker file detection, data dir next to exe, write check |
| **Rename to jcoTerm** | ✅ Complete | Package, window title, UI, builder, paths |
| **Security audit** | ✅ 39/62 fixed | 2 CRITICAL + 8 HIGH + 21 MEDIUM + 8 LOW resolved |
| **GitHub + Wiki** | ✅ Complete | Repo + 12-page wiki published |
| **English translation** | ✅ Complete | All .claude/ docs + CLAUDE.md |
| **Stability hardening (2026-06-23)** | ✅ Complete | Crash handlers, Error Boundary, atomic writes, SSH keepalive |
| **UX polish (2026-06-23)** | ✅ Complete | Keyboard shortcuts, modal animations, focus trap, CSS centralization |
| **Split view v2 (2026-06-23)** | ✅ Complete | Per-cell session selector with swap, persistent panes |
| **xterm race condition fix (2026-06-24)** | ✅ Complete | Suppress disposed Viewport error, buffer writes before open |
| **SFTP edit remote (2026-06-24)** | ✅ Complete | Download to temp, open in default editor, fs.watch + auto re-upload |
| **SFTP resizable columns (2026-06-24)** | ✅ Complete | Pointer-drag column resize with visual handle |
| **SFTP right-click selects (2026-06-24)** | ✅ Complete | Right-click on file selects it, then shows context menu |
| **Flexible splits (2026-06-24)** | ✅ Complete | Allow 2/4/8 splits with fewer sessions, empty cell placeholders |
| **Terminal view switch fix (2026-06-24)** | ✅ Complete | No corruption switching SFTP↔SSH (visibility instead of display:none) |
| **Session reorder (2026-06-24)** | ✅ Complete | Drag & drop sessions to reorder within/across folders (sortOrder) |
| **Middle-click close tab (2026-06-24)** | ✅ Complete | Standard browser pattern for tab close |

## Current Tests: 313

| Suite | Tests |
|---|---|
| `ssh-session.test.ts` | 14 (+4 keepalive, client close) |
| `ssh-handlers.test.ts` | 14 |
| `ssh-manager.test.ts` | 17 |
| `session-store.test.ts` | 15 (+4 atomic writes, backup recovery) |
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
| **Total** | **313** |

## Pending (low impact)

- H3: Windows ignores mode 0o600 (OS limitation — needs icacls or native deps)
- H9-H10: Tests for ssh.handlers and settings.handlers (~50 tests)
- M6: CSP unsafe-inline for styles (CSS Modules needs it)
- M9: SFTP opens new subsession per operation (perf refactor)
- M10: Partial file cleanup on failed SFTP download
- M11: AiChat stream chunk performance (React state refactor)
- M30: Tests for export/import, lock/unlock integration, portable mode
- L7: Panels without resize handles (sidebar, AI chat)
- L13-L14: ARIA roles on tabs and sessions
- L17: Session list search/filter
- L18: Terminal search (xterm SearchAddon)
- L19: SFTP local file operations (mkdir/delete/rename are no-ops)
- L20: E2E tests broken (wrong title, Spanish assertions)
- SEC-15: JS strings cannot be zeroed out (language limitation)
- API-08: Automatic SSH reconnection
- API-18: Settings migration between versions
