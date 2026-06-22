# tasks-architecture.md — Architecture and Structure Tasks

Generated: 2026-06-20. Full project review.

## Dead Code

- [x] **ARCH-01: RedactionPreview.tsx unused** — Removed.
- [x] **ARCH-02: Duplicate SftpEntry interface** — Consolidated in shared/types.ts.

## Coupling and DI

- [x] **ARCH-03: sftp.handlers imports manager directly** — Injected as parameter.
- [x] **ARCH-04: AI clients instantiated at module level** — Instantiated per request.

## Redundancy

- [x] **ARCH-05: Duplicate read/write pattern** — JsonFileStore base with cache and backup.
- [x] **ARCH-06: Duplicate SFTP error handling** — `withSftpSession()` middleware.
- [x] **ARCH-07: Duplicate AI credential validation** — `getApiKey()`.

## React Component Structure

- [x] **ARCH-08: Prop drilling in Terminal** — Not applicable: it's 1 level of drill (Terminal→TabBar), the cost of a Context exceeds the benefit.
- [x] **ARCH-09: Race condition in settings refresh** — AbortController added.

## Configuration

- [x] **ARCH-10: no-floating-promises** — Added to ESLint.
