# testing.md — Estrategia de tests

## Comandos

```bash
npm test              # Vitest (unitarios + integración), una sola vez
npm run test:watch    # Vitest en modo watch
npm run test:e2e      # Playwright E2E contra la app Electron compilada
```

## Herramientas

| Herramienta | Uso | Justificación |
|---|---|---|
| Vitest | Unitarios e integración | Compatible con electron-vite, más rápido que Jest, API idéntica |
| Playwright | E2E con Electron | Soporte oficial Electron, reemplaza al deprecado Spectron |

## Cobertura por fase

### Fase 1 — Terminal SSH básica

**Vitest:**
- `redactor.test.ts` — todos los patrones de redacción (cobertura prioritaria)
- `ssh-handlers.test.ts` — manejo de errores en connect/disconnect/input (ssh2 mockeado)
- `ssh-session.test.ts` — eventos de output, reconexión, cierre limpio

**Playwright:**
- `app.spec.ts` — la app arranca, muestra la UI principal sin errores

### Fase 2 — Sesiones guardadas

**Vitest:**
- `session-store.test.ts` — save/load/delete, sesión inexistente
- `settings-store.test.ts` — get/set de preferencias, valores por defecto

**Playwright:**
- `sessions.spec.ts` — abrir modal de nueva sesión, guardar, ver en lista, doble clic para conectar (SSH mockeado)

### Fase 3 — Panel de IA

**Vitest:**
- `ai-context.test.ts` — construcción del snapshot de terminal, límites de caracteres, selección manual
- `anthropic-client.test.ts` — manejo de errores HTTP, timeout, API key inválida (fetch mockeado)
- `redactor.test.ts` (ampliado) — combinaciones de secretos en contexto real de terminal

**Playwright:**
- `ai-panel.spec.ts` — abrir panel IA, introducir pregunta, ver redaction preview, confirmar envío, recibir respuesta mockeada

## Convenciones de tests

- **Sin credenciales reales.** ssh2 y `@anthropic-ai/sdk` siempre mockeados con `vi.mock()`.
- **Sin red real.** Usar `vi.mock` para `fetch` o el cliente Anthropic en unitarios; interceptar con Playwright para E2E.
- **CredentialStore con encryption key inyectada en tests.** Se pasa un `crypto.randomBytes(32)` como clave AES-256-GCM.
- **Nombre de tests:** `describe('NombreModulo') > it('qué hace cuando qué condición')`.
- **Un assert principal por test.** Varios asserts solo si verifican la misma invariante.
- **Tests de seguridad primero:** redactor y session-store tienen prioridad de cobertura.

## Test de invariante arquitectural (seguridad)

En `src/tests/architecture.test.ts` (Fase 3):
- Verificar (analizando el grafo de imports o mediante mocks) que no existe ninguna ruta de código que conecte `AnthropicClient.sendMessage` con `SshSession.write`.
- Este test actúa como red de seguridad contra regresiones accidentales en la restricción de solo lectura.

## Configuración de ficheros

- `vitest.config.ts` en la raíz: entorno `node` para tests de main, `jsdom` para tests de renderer.
- `playwright.config.ts`: `use: { channel: 'electron' }`, apunta al binario compilado por electron-vite.
- Directorio de tests unitarios: `src/tests/`.
- Directorio de tests E2E: `e2e/`.
