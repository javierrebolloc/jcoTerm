# security.md — Modelo de seguridad

## Principios fundamentales

1. **Mínimo privilegio en el renderer.** El renderer no puede acceder a Node.js ni a Electron directamente. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
2. **Credenciales solo en main.** SSH passwords, claves privadas y la API key de Anthropic nunca atraviesan el IPC en claro ni se almacenan sin cifrar.
3. **La IA no tiene canal de escritura.** No existe ningún handler IPC que conecte output de IA con input SSH. Garantía estructural.
4. **Redacción antes de enviar contexto a la IA.** El usuario ve el texto redactado antes de confirmar el envío.

## Contraseña de bloqueo (LockStore)

La app requiere una contraseña al iniciar. Si no existe, se pide crearla en el primer arranque.

| Aspecto | Detalle |
|---|---|
| KDF | PBKDF2 (SHA-512, 100.000 iteraciones) |
| Salt | 32 bytes aleatorios (crypto.randomBytes) |
| Key length | 64 bytes |
| Almacenamiento | `lock.json` en userData: `{ salt, hash, iterations }` |
| Comparación | `crypto.timingSafeEqual` (previene timing attacks) |

La contraseña en claro nunca se almacena ni se transmite al renderer. El renderer envía la contraseña via IPC, el main la hashea y compara.

## Almacenamiento de credenciales

| Dato | Dónde se guarda | Cómo |
|---|---|---|
| Contraseña SSH | userData/credentials.json | AES-256-GCM (clave derivada de la lock password) |
| Clave privada SSH | userData/credentials.json | AES-256-GCM (clave derivada de la lock password) |
| API key Anthropic | userData/credentials.json | AES-256-GCM (clave derivada de la lock password) |
| API key Gemini | userData/credentials.json | AES-256-GCM (clave derivada de la lock password) |
| Sesiones (host, puerto, user) | userData/sessions.json | electron-store (sin cifrar — no sensible) |
| Preferencias UI | userData/config.json | electron-store (sin cifrar) |

La clave de cifrado se deriva de la lock password con PBKDF2 y solo existe en memoria mientras la app está desbloqueada. Nunca se escribe en disco ni se pasa al renderer. Si la lock password cambia, las credenciales antiguas se borran (la nueva clave no puede descifrarlas).

## Modo portable

Si existe un fichero `portable` junto al ejecutable, la app entra en modo portable:
- `app.setPath('userData', './data/')` → todos los datos se guardan junto al .exe
- Las sesiones se guardan en `data/sessions.json` en vez de Documentos
- Las credenciales usan AES-256-GCM (derivado de la lock password) → portables entre máquinas
- No depende de DPAPI ni del usuario de Windows

## Flujo de credenciales en conexión SSH

```
Renderer ──ssh:connect({ sessionId })──▶ Main
                                          │
                                    SessionStore.getCredentials(id)
                                          │ (descifra con AES-256-GCM + key en memoria)
                                          ▼
                                    SshSession.connect(host, user, creds)
                                          │
                                    creds = null (limpiar referencia)
                                          ▼
                                    SSH stream activo
```

El renderer nunca recibe las credenciales. Solo envía el `sessionId`.
La clave de descifrado solo existe en memoria tras el desbloqueo.

## Ciclo de vida de la clave de cifrado

```
App inicia → splash 5s → lock screen
                            │
                      usuario introduce password
                            │
                      PBKDF2(password, encryptionSalt) → encryptionKey (32 bytes, en memoria)
                            │
                      CredentialStore.setEncryptionKey(key)
                            │
                      App desbloqueada — credenciales accesibles
                            │
                      Al cerrar app → key descartada → credenciales inaccesibles
```

Si se cambia la lock password:
1. Se genera nuevo `encryptionSalt` + `verifySalt`
2. Se borran todas las credenciales (`wipeCredentials`)
3. Se deriva nueva clave de cifrado

## Redacción de secretos (Redactor.ts)

Patrones que se aplican antes de enviar contexto a Anthropic:

| Patrón | Qué detecta |
|---|---|
| `password\s*[:=]\s*\S+` | Contraseñas en texto |
| `-----BEGIN .* PRIVATE KEY-----[\s\S]*-----END .* PRIVATE KEY-----` | Claves privadas PEM |
| `Authorization:\s*(Bearer\s+\S+\|Basic\s+\S+)` | Cabeceras HTTP de auth |
| `[A-Za-z0-9+/]{40,}={0,2}` (context-aware) | Tokens base64 largos |
| `sk-[A-Za-z0-9]{32,}` | API keys estilo OpenAI/Anthropic |
| `ghp_[A-Za-z0-9]{36}` | GitHub personal access tokens |
| `export \w*(TOKEN\|KEY\|SECRET\|PASS)\w*=\S+` | Variables de entorno con secretos |

Los patrones reemplazan el valor por `[REDACTED]`. El texto redactado se muestra al usuario en `RedactionPreview` antes de confirmar el envío.

## Content Security Policy (BrowserWindow)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'none';         ← el renderer no hace fetch directamente
img-src 'self' data:;
font-src 'self';
```

Las llamadas HTTP a Anthropic las hace el proceso main, nunca el renderer.

## Validación de inputs IPC

En `src/main/security.ts`:
- Validar tipo y rango de todos los parámetros de entrada IPC.
- Limitar longitud de strings (evitar ataques de memoria).
- El nombre del host SSH se valida contra un regex de hostname/IP antes de conectar.
- El `sessionId` se valida como UUID v4 antes de buscar en el Map.

## Logs

- En desarrollo: `console.log/error` estándar.
- En producción: sin credenciales, sin stack traces con datos sensibles, sin contenido de terminal.
- Los errores de conexión SSH exponen solo el código de error, no la configuración de la sesión.

## Privacidad en el tier gratuito de Gemini

El tier gratuito de la API de Gemini (Google AI Studio, sin facturación activa) tiene las siguientes implicaciones que el usuario debe conocer:

- **Coste cero garantizado**: sin cuenta de facturación asociada a la clave API, Google rechazará peticiones más allá del límite gratuito diario/por minuto. No es posible incurrir en costes accidentalmente.
- **Uso de datos para entrenamiento**: en el tier gratuito, Google puede utilizar los prompts y respuestas para mejorar sus modelos. El tier de pago (con facturación activa) no usa los datos para entrenamiento por defecto.
- **Mitigación en la app**: el Redactor elimina secretos del snapshot del terminal antes de enviarlo. La pantalla de `RedactionPreview` permite al usuario revisar qué se enviará. Aun así, la app muestra un aviso explícito en Ajustes desaconsejando el envío de información sensible cuando se usa Gemini en tier gratuito.

Las llamadas HTTP a Gemini las realiza el proceso main via `fetch` nativo (Node 18+). La CSP del renderer (`connect-src 'none'`) impide que el renderer contacte directamente con la API de Gemini.

## Garantía de solo lectura de IA (verificable en código)

Buscar en el código: no debe existir ninguna llamada donde el resultado de `AnthropicClient.sendMessage()` se pase como argumento a `SshSession.write()` ni a ningún handler de `ssh:input`. Esta invariante está cubierta por un test de arquitectura.
