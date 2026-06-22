# tasks-apis.md — Tareas de APIs, funcionalidad y rendimiento

Generado: 2026-06-20. Revisión completa del proyecto.

## Anthropic API

- [ ] **API-01: Sin streaming en AnthropicClient** — Requiere cambio de arquitectura IPC (evento incremental).
- [x] **API-02: Sin clasificación de errores** — Resuelto.
- [ ] **API-03: max_tokens hardcodeado a 1024** — Pendiente.
- [ ] **API-04: Modelo Anthropic no configurable** — Pendiente.

## Gemini API

- [x] **API-05: Sin retry para 500/503** — Resuelto.
- [x] **API-06: resetAt no valida futuro** — Resuelto.

## SSH (ssh2)

- [x] **API-07 a API-12** — Todos resueltos.
- [ ] **API-08: Sin reconexión automática** — Requiere UX design (keepalive + auto-reconnect dialog).

## xterm.js

- [x] **API-13 a API-16** — Todos resueltos.

## electron-store

- [x] **API-17: Schema de validación** — Resuelto.
- [ ] **API-18: Migración de settings** — Pendiente (no urgente hasta el próximo cambio de schema).
- [x] **API-19 a API-21** — Resueltos.

## Rendimiento

- [ ] **API-22: SFTP sin caché de directorio** — Pendiente (baja prioridad).
