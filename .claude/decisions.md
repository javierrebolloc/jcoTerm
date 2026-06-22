# decisions.md — Registro de decisiones técnicas

Formato: fecha · decisión · alternativas consideradas · motivo

---

## 2026-06-19 · electron-vite como herramienta de build

**Decisión:** Usar `electron-vite` en vez de webpack o configuración manual de Vite.

**Alternativas:** electron-webpack, CRA + Electron, Vite puro con scripts manuales.

**Motivo:** electron-vite resuelve el triple bundle (main/preload/renderer) de forma integrada, con soporte TypeScript nativo, HMR en renderer y configuración mínima. Es la opción más mantenida para proyectos Electron nuevos en 2024-2025.

---

## 2026-06-19 · React para el renderer

**Decisión:** React + CSS Modules para la UI del renderer.

**Alternativas:** Vue, Svelte, HTML/CSS puro.

**Motivo:** Ecosistema maduro, buena integración con xterm.js, tipado con TypeScript. CSS Modules evita dependencias de UI extras manteniendo los estilos escopados.

---

## 2026-06-19 · electron-store para configuración no sensible

**Decisión:** `electron-store` para persistir preferencias no sensibles (tema, fuente, etc.).

**Alternativas:** SQLite (mejor-sqlite3), JSON manual, localStorage del renderer.

**Motivo:** electron-store es JSON cifrable, sin dependencias nativas, API simple. Para v1 es suficiente. SQLite sería sobredimensionado para la cantidad de datos que manejamos.

---

## 2026-06-19 · safeStorage para credenciales

**Decisión:** `electron.safeStorage` para cifrar credenciales SSH y la API key de Anthropic.

**Alternativas:** keytar (deprecado), node-keytar, bcrypt manual.

**Motivo:** safeStorage es la solución oficial de Electron desde v15. En Windows usa DPAPI. No requiere dependencias nativas adicionales. keytar está deprecado en favor de safeStorage.

---

## 2026-06-19 · Vitest para tests unitarios + Playwright para E2E

**Decisión:** Vitest (unitarios/integración) + Playwright con soporte Electron (E2E).

**Alternativas:** Jest + Spectron (Spectron está deprecado), Jest puro.

**Motivo:** Vitest es más rápido que Jest y compatible con el ecosistema Vite. Playwright tiene soporte oficial para Electron desde 2022, reemplazando a Spectron. Ambos son estándar de la industria en 2024-2025.

---

## 2026-06-19 · xterm (unscoped) en lugar de @xterm/xterm

**Decisión:** Usar `xterm@^5.3.0`, `xterm-addon-fit@^0.8.0`, `xterm-addon-web-links@^0.9.0` (paquetes sin scope).

**Motivo:** Los paquetes scoped `@xterm/*` solo tienen versiones beta en npm (p. ej. `@xterm/addon-fit@0.12.0-beta.287`). Los paquetes estables son los unscoped. Se revisará en el futuro cuando los scoped estén estables.

---

## 2026-06-19 · SshSession con factory inyectable para tests

**Decisión:** El constructor de `SshSession` acepta un parámetro opcional `clientFactory: () => Client` con un default que crea el ssh2 Client real.

**Motivo:** Permite inyectar un mock Client en tests sin necesidad de mockear todo el módulo `ssh2`. Patrón de dependency injection limpio y sin magia de vi.mock.

---

## 2026-06-19 · Capa de proveedor de IA intercambiable (AIProvider interface)

**Decisión:** Introducir la interfaz `AIProvider` en `src/main/ai/AIProvider.ts` con implementaciones `AnthropicClient` y `GeminiClient`. El handler IPC `ai:sendMessage` selecciona el cliente leyendo `SettingsStore.aiProvider` en cada llamada. El renderer nunca sabe qué proveedor está activo; solo envía el mensaje.

**Alternativas:** Un único cliente con flag interno; dos canales IPC separados (`ai:sendAnthopic`, `ai:sendGemini`); pasar el proveedor como campo del request desde el renderer.

**Motivo:** Encapsula toda la lógica de cada proveedor (endpoint, formato, manejo de errores, cuota) en su implementación. Cambiar el proveedor activo es un cambio de configuración, no de código. El renderer no necesita saber qué backend usa, lo que mantiene la superficie de API IPC mínima.

---

## 2026-06-19 · Gemini via fetch nativo + garantía de coste cero

**Decisión:** `GeminiClient` usa `globalThis.fetch` (disponible en Node 18+ / Electron 29) en lugar del SDK oficial de Google, para poder leer los headers HTTP de cuota directamente. Reintentos con backoff exponencial (×3) antes de marcar el 429 como agotamiento real. La clave API se cifra con DPAPI igual que la de Anthropic.

**Alternativas:** SDK `@google/generative-ai`; proxy en un servidor propio para ocultar la clave; no reintentar en 429.

**Motivo:** (a) El SDK de Google no expone los headers HTTP brutos que necesitamos para leer la cuota restante. (b) Los "429 fantasma" conocidos en modelos Gemini 2.5 requieren reintentos transparentes. (c) Mantener la clave en el proceso main con DPAPI garantiza coste cero: sin cuenta de facturación en Google, la API rechazará cualquier petición más allá del tier gratuito incluso si alguien obtuviera la clave.

---

## 2026-06-19 · Copy/paste de terminal via Clipboard API del renderer

**Decisión:** El copy (mouseup → `term.getSelection()` → `navigator.clipboard.writeText()`) y paste (contextmenu → `navigator.clipboard.readText()` → `sendInput`) se implementan íntegramente en el renderer sin IPC adicional.

**Alternativas:** Exponer `clipboard.readText/writeText` de Electron via IPC; usar `clipboard` module de Electron en main.

**Motivo:** `navigator.clipboard` es la Clipboard API estándar de Chromium, disponible en el renderer de Electron sin necesidad de Node.js. No requiere exponer nuevos canales IPC ni permisos adicionales. El renderer ya tiene acceso legítimo al portapapeles del usuario (es su propia ventana). Añadir IPC solo añadiría latencia y complejidad sin beneficio de seguridad.

---

## 2026-06-19 · Eliminación del modal RedactionPreview del flujo de envío

**Decisión:** El usuario hace clic en Enviar y el mensaje se envía directamente sin paso de confirmación. El fichero `RedactionPreview.tsx` permanece en disco pero ya no se usa en `AiChat`.

**Alternativas:** Mantener el modal de preview; hacerlo opcional via setting.

**Motivo:** El usuario pidió eliminar el paso intermedio. La redacción de secretos sigue ocurriendo en main (invariante de seguridad mantenida). El aviso de qué se envía ahora está en el texto de ayuda del input ("Se enviarán las últimas N líneas como contexto").

---

## 2026-06-19 · `aiContextLines` como setting para controlar el coste de tokens

**Decisión:** Nuevo campo `aiContextLines: number` (default 100) en `StoredSettings` / `AppSettings`. AiChat recibe el valor como prop, toma el snapshot completo del terminal y aplica `.split('\n').slice(-N).join('\n')` antes de enviar.

**Alternativas:** Valor fijo hardcodeado; enviar siempre el contenido visible completo; limitar en el proceso main.

**Motivo:** El número óptimo de líneas depende del caso de uso del usuario (debugging vs. monitoring vs. revisión de logs). Un campo configurable en Ajustes permite ajustarlo sin tocar código. Aplicar el slice en el renderer (antes de IPC) evita transferir datos innecesarios al proceso main.

---

## 2026-06-19 · fast-fail en GeminiClient cuando `limit: 0` en todos los cupos

**Decisión:** Si el error 429 tiene todos los `limit: N` con N=0, se lanza `GeminiQuotaError` inmediatamente sin reintentar.

**Alternativas:** Reintentar igual (comportamiento anterior); distinguir por código de error.

**Motivo:** `limit: 0` significa que el proyecto de Google no tiene cupo asignado para ese modelo — no es agotamiento temporal sino configuración incorrecta. Reintentar 3 veces con esperas de 30s/60s/60s (según sugería la API) era engañoso y bloqueaba al usuario ~150s antes de dar el mismo error.

---

## 2026-06-19 · Garantía de solo lectura de IA por ausencia de canal

**Decisión:** La restricción de que la IA no puede escribir en SSH se implementa por ausencia de canal, no por validación.

**Motivo:** No existe en el código ningún handler IPC ni función que conecte el output de AnthropicClient con el input de SshSession. La garantía es estructural: no se puede eludir sin añadir código deliberadamente. Esto es más robusto que cualquier validación o flag de permiso.

---

## 2026-06-20 · Verificación de host key SSH con KnownHostsStore

**Decisión:** Implementar verificación de host key usando un store JSON propio (`known-hosts.json`) en vez de parsear `~/.ssh/known_hosts` de OpenSSH.

**Alternativas:** Parsear `known_hosts` de OpenSSH; usar una librería como `sshpk`; confiar en ssh2 sin verificación.

**Motivo:** El formato `known_hosts` de OpenSSH es complejo (hashed hostnames, múltiples algoritmos, opciones) y parsearlo correctamente es propenso a errores. Un store JSON propio es más simple, auditable, y permite UX propia (listar/eliminar desde Ajustes). El fingerprint se calcula como SHA-256 del key buffer, que es el estándar moderno.

---

## 2026-06-20 · JsonFileStore<T> como clase base para stores JSON

**Decisión:** Extraer una clase base `JsonFileStore<T>` que implementa CRUD genérico con cache en memoria, escritura atómica (tmp+rename) y backup automático de ficheros corruptos.

**Alternativas:** Mantener la duplicación en FolderStore y NamedCredentialStore; usar una librería de persistencia.

**Motivo:** FolderStore y NamedCredentialStore tenían código idéntico de lectura/escritura JSON. La clase base elimina la duplicación y añade protecciones (atomicidad, backup) sin dependencias externas. CredentialStore no extiende de ella porque usa un formato distinto (cifrado DPAPI), pero se le aplicó cache y atomic write por separado.

---

## 2026-06-20 · Split view con panes siempre montados

**Decisión:** En Terminal.tsx, todos los TerminalPane se renderizan siempre dentro de un único contenedor. El layout (normal tabs vs grid split) se controla cambiando la clase CSS del contenedor, nunca desmontando/remontando panes.

**Alternativas:** Dos ramas condicionales con panes separados (diseño original); portales React.

**Motivo:** El diseño original con dos ramas (`{!inSplitMode && ...}` / `{inSplitMode && ...}`) causaba que React desmontara todos los panes al cambiar de modo y los remontara en la nueva rama, destruyendo los terminales xterm.js y su buffer. Con un único contenedor, React reconcilia por `key` y mantiene los panes vivos.

---

## 2026-06-20 · IpcRateLimiter para handlers críticos

**Decisión:** Implementar un rate limiter simple (sliding window) en el proceso main para los handlers de SSH connect (10/min) y AI sendMessage (20/min).

**Alternativas:** Sin rate limiting (diseño original); rate limiting en el renderer; middleware genérico para todos los handlers.

**Motivo:** Un renderer comprometido podría spamear conexiones SSH (DoS al servidor remoto) o peticiones IA (agotamiento de cuota/coste). El rate limiter en main es la capa correcta porque el renderer no es de confianza. Se aplica solo a los handlers con impacto externo, no a operaciones locales como listar sesiones.

---

## 2026-06-21 · Streaming de respuestas IA via IPC push events

**Decisión:** Las respuestas de IA se envían incrementalmente via `webContents.send` (canales `ai:streamChunk`, `ai:streamEnd`, `ai:streamError`). El handler `ai:sendMessage` valida, inicia el stream en background, y retorna `{ success: true }` inmediatamente. Anthropic usa `client.messages.stream()`, Gemini usa `streamGenerateContent?alt=sse`.

**Alternativas:** Mantener request/response completo (esperar toda la respuesta antes de mostrar); WebSocket separado; devolver un ReadableStream serializado.

**Motivo:** Los push events via `webContents.send` son el patrón natural de Electron para streaming main→renderer (ya usado para `ssh:output`). No requiere infraestructura adicional. La interfaz `AIStreamCallbacks` desacopla el transporte del proveedor.

---

## 2026-06-21 · SSH Agent via named pipe de OpenSSH

**Decisión:** La auth via SSH Agent usa `\\\\.\\pipe\\openssh-ssh-agent` como agente por defecto en Windows, con fallback a `SSH_AUTH_SOCK` si está definido.

**Alternativas:** Usar solo `SSH_AUTH_SOCK`; usar Pageant (PuTTY); requerir que el usuario configure la ruta.

**Motivo:** Windows 10+ incluye OpenSSH Agent como servicio del sistema. El named pipe `openssh-ssh-agent` es el estándar de facto. ssh2 lo soporta nativamente via el campo `agent` de `ConnectConfig`. Si el usuario tiene un agente no estándar, puede configurarlo via `SSH_AUTH_SOCK`.

---

## 2026-06-21 · Auto-recovery con electron-store separado

**Decisión:** El estado de tabs (savedSessionId + label) se guarda en `window-state.json` (electron-store separado de settings) cada vez que cambia. Al iniciar, se lee, se limpia inmediatamente, y se reconectan las sesiones guardadas.

**Alternativas:** Guardar en SettingsStore; guardar en localStorage del renderer; guardar en un fichero JSON manual.

**Motivo:** Un store separado evita contaminar settings con datos efímeros. Limpiar al leer impide loops de reconexión fallida. Solo se guardan tabs con `savedSessionId` (las conexiones directas no se pueden recuperar sin credenciales).

---

## 2026-06-21 · Gestor SFTP dual-pane con multi-tab

**Decisión:** Implementar un gestor de ficheros SFTP estilo FileZilla con panel local (izquierda) y remoto (derecha), integrado como modo alternativo al terminal (viewMode toggle). Soporta múltiples conexiones SFTP simultáneas via pestañas.

**Alternativas:** Panel derecho simple; ventana separada; integrar en el FileExplorer existente.

**Motivo:** El reemplazo del area principal ofrece el máximo espacio para los dos paneles. Las pestañas permiten trabajar con múltiples servidores. Las transferencias se ejecutan en background en el main process con progreso via IPC push.

---

## 2026-06-21 · i18n con JSON plano sin dependencias externas

**Decisión:** Sistema i18n propio con `t(key, params?)`, JSON plano con claves dot-separated, React Context para re-render. Sin i18next ni otras librerías.

**Alternativas:** i18next + react-i18next; react-intl; paquete propio con objetos anidados.

**Motivo:** Para 2 idiomas y ~250 claves, una librería completa es sobredimensionada. El JSON plano es grep-friendly, el motor `t()` son 15 líneas, y funciona idénticamente en main y renderer. El Context triggerea re-renders sin prop drilling.

---

## 2026-06-21 · Multi-ejecución en split view

**Decisión:** Cuando multi-ejecución está activa, el `onData` de xterm replica el input a todos los sessionIds del split. Cada terminal puede excluirse individualmente via un toggle en la barra de estado.

**Alternativas:** Input bar separada que envía comandos; middleware en el main process.

**Motivo:** Interceptar `onData` en el renderer es lo más simple y no requiere cambios en el main. El array de targets se actualiza via ref para que la closure del mount effect siempre tenga los targets actuales. La exclusión individual permite control fino.

---

## 2026-06-21 · Diálogos de confirmación custom (no confirm() nativo)

**Decisión:** `ConfirmProvider` + `useConfirm()` hook reemplazan todos los `window.confirm()` con diálogos styled que respetan el tema oscuro de la app.

**Motivo:** `window.confirm()` muestra un diálogo nativo de Windows que rompe la estética de la app. El Context + Promise pattern permite `await confirm(msg)` desde cualquier componente sin prop drilling.

---

## 2026-06-21 · Licencia MIT

**Decisión:** El proyecto se licencia bajo MIT. Fichero LICENSE en la raíz, `license: "MIT"` en package.json, autor Javier Rebollo.

**Motivo:** MIT es la licencia más permisiva y estándar para software libre. Permite uso comercial, modificación y redistribución sin restricciones. Compatible con todas las dependencias del proyecto.

---

## 2026-06-22 · Splash screen como componente renderer

**Decisión:** Splash screen de 5 segundos implementado como componente React (`SplashScreen.tsx`) que se muestra antes de la app principal, controlado por estado `AppPhase` en `App.tsx`.

**Alternativas:** Splash window separada en main process; BrowserWindow splash nativo.

**Motivo:** Mantenerlo como componente React en el mismo renderer simplifica la gestión del ciclo de vida. No hay overhead de crear/cerrar una ventana adicional. La transición a la lock screen es instantánea.

---

## 2026-06-22 · Contraseña de bloqueo con PBKDF2

**Decisión:** La contraseña de bloqueo se hashea con `crypto.pbkdf2Sync` (100.000 iteraciones, SHA-512, salt aleatorio de 32 bytes). Se almacena `{ salt, hash, iterations }` en `lock.json` en userData. La verificación usa `crypto.timingSafeEqual`.

**Alternativas:** Almacenar la contraseña cifrada con safeStorage; bcrypt; argon2.

**Motivo:** PBKDF2 está disponible en Node.js sin dependencias externas. 100K iteraciones con SHA-512 es resistente a fuerza bruta. `timingSafeEqual` previene timing attacks. No se usa safeStorage porque el propósito no es ocultar la contraseña del usuario del sistema (eso sería circular), sino verificar que quien abre la app la conoce.

---

## 2026-06-22 · Export/import de sesiones sin credenciales

**Decisión:** La exportación guarda sesiones + carpetas en un JSON portátil. Las credenciales (passwords, claves privadas, namedCredentialId) no se incluyen. La importación genera nuevos UUIDs para evitar colisiones y remapea los folderIds.

**Alternativas:** Exportar con credenciales cifradas; exportar solo sesiones sin carpetas.

**Motivo:** Las credenciales están cifradas con AES-256-GCM y no son portables sin la lock password. Exportar carpetas permite mantener la organización. Generar nuevos IDs en importación evita sobrescrituras accidentales.

---

## 2026-06-22 · Reemplazo de safeStorage (DPAPI) por AES-256-GCM derivado de lock password

**Decisión:** Todas las credenciales se cifran con AES-256-GCM. La clave de cifrado (32 bytes) se deriva de la lock password del usuario via PBKDF2 (100K iteraciones, SHA-512, salt aleatorio independiente del salt de verificación). La clave solo existe en memoria. safeStorage/DPAPI eliminado completamente.

**Alternativas:** Mantener DPAPI (no portable); cifrado híbrido (DPAPI + AES fallback); bcrypt/argon2 para derivar la clave.

**Motivo:** (a) DPAPI ata las credenciales al usuario+máquina de Windows → imposibilita portabilidad. (b) Derivar la clave de la lock password garantiza que sin contraseña no hay acceso a credenciales. (c) Cambiar la contraseña invalida automáticamente las credenciales antiguas (salt diferente → clave diferente). (d) PBKDF2+AES-256-GCM son estándar, sin dependencias externas, disponibles en Node.js crypto. (e) Dos salts separados (verificación + cifrado) evitan que el hash de verificación filtre información sobre la clave de cifrado.

---

## 2026-06-22 · Modo portable con fichero marcador

**Decisión:** Si existe un fichero `portable` junto al ejecutable, la app redirige `app.setPath('userData', './data/')` para almacenar todo junto al .exe. La detección se ejecuta antes de `app.whenReady()` para que electron-store y todos los stores usen la ruta portable.

**Alternativas:** Flag de línea de comandos; variable de entorno; siempre portable.

**Motivo:** Un fichero marcador es el patrón estándar de apps portables en Windows (usado por Firefox Portable, VSCode Portable, etc.). Permite que el mismo binario funcione como instalado o portable sin recompilación. La detección temprana garantiza que todos los stores se inicializan con la ruta correcta.
