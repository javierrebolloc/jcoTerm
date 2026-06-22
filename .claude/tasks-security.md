# tasks-security.md — Pending Security Tasks

Generated: 2026-06-20. Full project review.

## CRITICAL

- [x] **SEC-01: API key leaked in debug logs** — Resolved.
- [x] **SEC-02: No SSH host key verification** — Resolved: KnownHostsStore + hostVerifier + accept/reject UX + MITM warning.

## HIGH

- [x] **SEC-03: SFTP paths not validated** — Resolved.
- [x] **SEC-04: sessionsFilePath accepts any path** — Resolved.
- [x] **SEC-05: SSH error messages expose information** — Resolved.
- [x] **SEC-06: Incomplete Redactor patterns** — Resolved.

## MEDIUM

- [x] **SEC-07: Resize uses isValidPort()** — Resolved.
- [x] **SEC-08: No rate limiting** — Resolved.
- [x] **SEC-09: Named credential ID not validated** — Resolved.
- [x] **SEC-10: Unsanitized names in logs** — Resolved.
- [x] **SEC-11: CSP not applied in dev** — Resolved.
- [x] **SEC-12: IPv4 doesn't validate octets** — Resolved.

## LOW

- [x] **SEC-13: No length limit on AI messages** — Resolved.
- [x] **SEC-14: Silent DPAPI decryption errors** — Resolved.
- [ ] **SEC-15: JS credentials as strings can't be cleared from memory** — JS limitation, no practical solution.
