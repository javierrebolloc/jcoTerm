# tasks-tests.md — Tareas de cobertura de tests

Generado: 2026-06-20. Revisión completa del proyecto.

## Módulos sin tests (cobertura 0%) → RESUELTOS

- [x] **TEST-01: IPC session.handlers.ts** — 18 tests (list enrichment, save con/sin credentials, delete cascade, getFilePath)
- [x] **TEST-03: IPC credential.handlers.ts** — 12 tests (list, save UUID gen/validation, delete cascade)
- [x] **TEST-04: IPC folder.handlers.ts** — 13 tests (list, save UUID gen, sanitizeForLog, delete validation)
- [x] **TEST-06: SshManager.ts** — 17 tests (create, get, remove, closeAll, activeCount, disconnect on remove)
- [x] **TEST-07: AnthropicClient.ts** — 16 tests (sendMessage, error classification: auth/rate limit/overloaded/network/generic)
- [x] **TEST-08: SettingsStore.ts** — 10 tests (get defaults, set individual/multiple, getSessionsFilePath)
- [x] **TEST-09: FolderStore.ts** — 12 tests (list/save/delete/findById, corrupt JSON backup)
- [x] **TEST-10: NamedCredentialStore.ts** — 11 tests (list/save/delete/findById, corrupt JSON)
- [x] **KnownHostsStore.ts** (nuevo) — 13 tests (lookup/add/verify match/mismatch/unknown, cache, corrupt file)

## Tests de seguridad

- [x] **TEST-16: Validadores de seguridad (security.ts)** — 32 tests (isValidHost IPv4 octets, isValidTerminalDimension, isValidSettingsPath, sanitizeSshError, sanitizeForLog, IpcRateLimiter)

## Pendientes (baja prioridad)

- [ ] **TEST-02: IPC settings.handlers.ts** — Handlers settings:get/set con API key storage y path migration.
- [ ] **TEST-05: IPC sftp.handlers.ts** — withSftpSession middleware, listDir/realpath validation.
- [ ] **TEST-11: ssh-handlers.test.ts solo prueba validadores** — No hay tests del handler SSH.CONNECT completo.
- [ ] **TEST-12: SshSession SFTP methods** — listDir() y realpath() sin tests.
- [ ] **TEST-13: Redactor edge cases** — Passwords entre comillas, caracteres especiales, múltiples patrones solapados.
- [ ] **TEST-14: GeminiClient errores de red** — fetch exceptions, body no parseable.
- [ ] **TEST-15: ai-provider-routing paths faltantes** — Provider desconocido, errores genéricos.
- [ ] **TEST-17: Tests de no-filtración de credenciales** — Verificar que passwords no aparecen en error messages.
- [ ] **TEST-18: Sin reporting de cobertura** — Configurar `npm run test:coverage`.
- [ ] **TEST-19: E2E tests mínimos** — Solo 3 smoke tests, faltan flujos completos.
- [ ] **TEST-20: Assertions débiles** — toBeGreaterThanOrEqual en redactor, toContain laxo.

## Resumen de cobertura

| Suite | Tests (antes) | Tests (ahora) |
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
