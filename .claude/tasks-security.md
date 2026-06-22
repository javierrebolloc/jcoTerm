# tasks-security.md — Tareas de seguridad pendientes

Generado: 2026-06-20. Revisión completa del proyecto.

## CRITICAL

- [x] **SEC-01: API key filtrada en logs de debug** — Resuelto.
- [x] **SEC-02: Sin verificación de host key SSH** — Resuelto: KnownHostsStore + hostVerifier + UX accept/reject + MITM warning.

## HIGH

- [x] **SEC-03: Rutas SFTP sin validar** — Resuelto.
- [x] **SEC-04: sessionsFilePath acepta cualquier ruta** — Resuelto.
- [x] **SEC-05: Mensajes de error SSH exponen información** — Resuelto.
- [x] **SEC-06: Patrones del Redactor incompletos** — Resuelto.

## MEDIUM

- [x] **SEC-07: Resize usa isValidPort()** — Resuelto.
- [x] **SEC-08: Sin rate limiting** — Resuelto.
- [x] **SEC-09: Named credential ID no validado** — Resuelto.
- [x] **SEC-10: Nombres sin sanitizar en logs** — Resuelto.
- [x] **SEC-11: CSP no se aplica en dev** — Resuelto.
- [x] **SEC-12: IPv4 no valida octetos** — Resuelto.

## LOW

- [x] **SEC-13: Sin límite de longitud en mensajes IA** — Resuelto.
- [x] **SEC-14: Errores de descifrado DPAPI silenciosos** — Resuelto.
- [ ] **SEC-15: Credenciales como strings JS no se limpian de memoria** — Limitación de JS, no hay solución práctica.
