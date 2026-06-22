# tasks-improvements.md — Mejoras y features propuestas

Generado: 2026-06-20. Revisión completa del proyecto.

## UX

- [x] **UX-01: Streaming de respuestas IA** — Resuelto: IPC streaming via `ai:streamChunk/End/Error`, `sendMessageStream` en ambos providers.
- [x] **UX-02: Estados de carga durante conexión SSH** — Resuelto: `connectingSessionId` + spinner en SessionItem.
- [x] **UX-03: Mensajes de error más informativos** — Resuelto: SFTP incluye ruta, Gemini RPM/TPM indica reset, SSH Agent error.
- [x] **UX-04: Modelo Anthropic configurable en Ajustes** — Resuelto: `anthropicModel` en SettingsStore + selector en UI.
- [x] **UX-05: Auto-recovery de sesión tras crash** — Resuelto: `window-state.json` con tabs, auto-reconnect al iniciar.

## Funcionalidad

- [x] **FEAT-01: Integración con SSH Agent (Windows OpenSSH Agent)** — Resuelto: `authMethod: 'agent'`, pipe OpenSSH Agent.
- [x] **FEAT-02: max_tokens dinámico para Anthropic y Gemini** — Resuelto: `calculateMaxTokens(contextLength)`, 1024-4096.
- [x] **FEAT-03: Log de redacción detallado** — Resuelto: `matchedTypes` en RedactorResult, log con tipos.

## DevOps

- [x] **DEVOPS-01: npm audit en CI/build** — Resuelto: script `npm run audit`.
- [x] **DEVOPS-02: Actualizar dependencias** — Resuelto: `@anthropic-ai/sdk ^0.105.0`, `electron-store ^8.2.0`. React/Electron/ESLint major bumps pendientes (migración separada).
