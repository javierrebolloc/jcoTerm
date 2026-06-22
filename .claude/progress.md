# progress.md — Estado del proyecto

Última actualización: 2026-06-22

## Estado actual: App completa con SFTP, i18n, multi-ejecución, splash, lock, export/import

## Fases

| Fase | Estado | Descripción |
|---|---|---|
| Documentación inicial | ✅ Completa | CLAUDE.md + .claude/ creados |
| **Fase 1** — Terminal SSH básica | ✅ Completa | Build limpio |
| **Fase 2** — Sesiones guardadas + Settings | ✅ Completa | Build limpio |
| **Fase 3** — Panel de IA | ✅ Completa | Redactor + AnthropicClient + AiChat |
| **Extensión Gemini** | ✅ Completa | GeminiClient + selector de proveedor + quota bar |
| **Mejoras UX (sesión 19-20)** | ✅ Completa | aiContextLines, copy/paste, debounce resize, auditorías |
| **Mejoras e2e (sesión 21 AM)** | ✅ Completa | Streaming IA, SSH Agent, auto-recovery, loading states |
| **Ajustes con sidebar** | ✅ Completa | Modal con navegación por secciones, nuevos settings terminal |
| **Gestor SFTP** | ✅ Completa | Dual-pane FileZilla-like, transferencias, chmod, multi-tab |
| **i18n** | ✅ Completa | Inglés (default) + Español, sistema profesional con JSON plano |
| **Multi-ejecución** | ✅ Completa | Comandos replicados en todos los terminales del split |
| **Splash screen** | ✅ Completa | Pantalla de carga 5s con "jcoTerm" |
| **Lock screen** | ✅ Completa | Contraseña de desbloqueo con PBKDF2 |
| **Export/Import** | ✅ Completa | Exportar/importar sesiones y carpetas (sin credenciales) |

## Tests actuales: 306

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

## Pendiente (bajo impacto)

- SEC-15: Strings JS no se pueden zerear (limitación del lenguaje)
- API-08: Reconexión SSH automática
- API-18: Migración de settings entre versiones
- Tests E2E con Playwright
- xterm.js dimensions error (cosmético, try-catch en open)
- Multi-exec paste: right-click paste replica a todos los terminales del split
- Split layout optimizado: padding/statusBar reducidos, min-width/min-height en celdas
