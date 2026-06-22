# tasks-architecture.md — Tareas de arquitectura y estructura

Generado: 2026-06-20. Revisión completa del proyecto.

## Código muerto

- [x] **ARCH-01: RedactionPreview.tsx sin usar** — Eliminado.
- [x] **ARCH-02: Interfaz SftpEntry duplicada** — Consolidada en shared/types.ts.

## Acoplamiento y DI

- [x] **ARCH-03: sftp.handlers importa manager directamente** — Inyectado como parámetro.
- [x] **ARCH-04: AI clients instanciados a nivel de módulo** — Se instancian por petición.

## Redundancia

- [x] **ARCH-05: Patrón read/write duplicado** — JsonFileStore base con cache y backup.
- [x] **ARCH-06: Error handling SFTP duplicado** — Middleware `withSftpSession()`.
- [x] **ARCH-07: Validación de credenciales IA duplicada** — `getApiKey()`.

## Estructura de componentes React

- [x] **ARCH-08: Prop drilling en Terminal** — No aplica: es 1 nivel de drill (Terminal→TabBar), el coste de un Context supera el beneficio.
- [x] **ARCH-09: Race condition en refresh de settings** — AbortController añadido.

## Configuración

- [x] **ARCH-10: no-floating-promises** — Añadido a ESLint.
