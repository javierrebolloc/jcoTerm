# CLAUDE.md — SSH AI Client

Lee este fichero al inicio de cada sesión antes de tocar código.

## Qué es este proyecto

Cliente SSH de escritorio para Windows (Electron + TypeScript) con un panel lateral de chat con IA (Anthropic). La IA puede leer el contenido visible de la terminal cuando el usuario pregunta, pero **nunca puede escribir en la sesión SSH ni ejecutar comandos**. Esta restricción está garantizada por arquitectura.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Electron |
| Lenguaje | TypeScript (strict) |
| Build | electron-vite |
| UI | React + CSS Modules |
| Terminal | xterm.js |
| SSH | ssh2 |
| Almacenamiento seguro | AES-256-GCM (clave derivada de lock password via PBKDF2) |
| Config no sensible | electron-store |
| IA | @anthropic-ai/sdk → Anthropic API |
| Empaquetado | electron-builder |
| Tests unitarios | Vitest |
| Tests E2E | Playwright (soporte oficial Electron) |
| Linting | ESLint + Prettier |

## Comandos clave

```bash
npm run dev          # Electron en modo desarrollo (HMR)
npm run build        # Build de producción
npm run dist         # Build + empaquetado instalador Windows
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest (unitarios + integración)
npm run test:e2e     # Playwright E2E
npm run test:watch   # Vitest en modo watch
```

## Reglas de seguridad inviolables

1. **SSH y credenciales SOLO en el proceso main.** El renderer nunca toca credenciales en claro.
2. **contextIsolation: true, nodeIntegration: false** en toda BrowserWindow.
3. **La IA es estrictamente de solo lectura.** No existe ningún canal IPC que conecte output de IA con input SSH. Esto se verifica en código y en tests.
4. **Credenciales cifradas con AES-256-GCM**, clave derivada de la lock password con PBKDF2. La clave solo existe en memoria tras el desbloqueo. Nunca en texto plano en disco, nunca en logs. Portable entre máquinas.
5. **Redacción de secretos antes de enviar contexto a la IA.** El usuario ve qué se enviará antes de confirmar.
6. **Validar y sanitizar todos los inputs IPC en el main** antes de usarlos.

## Documentación del agente (.claude/)

| Fichero | Contenido |
|---|---|
| `brief.md` | El encargo original completo (inmutable) |
| `architecture.md` | Diagrama de procesos, flujo de datos IPC |
| `code-map.md` | Mapa módulo → fichero con descripción de una línea |
| `conventions.md` | Estilo, nombrado, patrones que seguimos |
| `decisions.md` | Registro de decisiones técnicas (ADR ligero) |
| `progress.md` | Estado actual por fases y próximos pasos |
| `security.md` | Modelo de seguridad detallado |
| `testing.md` | Estrategia de tests, cobertura, convenciones |

## Fases

- **Fase 1** — Terminal SSH básica (con tests)
- **Fase 2** — Sesiones guardadas + Settings (con tests)
- **Fase 3** — Panel de chat IA (con tests)
