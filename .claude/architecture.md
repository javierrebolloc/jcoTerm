# architecture.md — Arquitectura de procesos

## Diagrama de procesos

```
┌─────────────────────────────────────────────────────────────────┐
│  PROCESO MAIN (Node.js privilegiado)                            │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │  SshManager  │  │  SessionStore  │  │  AnthropicClient   │  │
│  │  SshSession  │  │  SettingsStore │  │  Redactor          │  │
│  └──────┬───────┘  └────────────────┘  └────────────────────┘  │
│         │ ssh2                AES-256-GCM / electron-store       │
│  ┌──────┴───────────────────────────────────────────────────┐   │
│  │  IPC Handlers: ssh.handlers | session.handlers | ai.handlers │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────│───────────────────────────────────┘
                              │ contextBridge (API mínima)
┌─────────────────────────────│───────────────────────────────────┐
│  PRELOAD (src/preload/index.ts)                                 │
│  Expone window.electronAPI con los métodos permitidos           │
└─────────────────────────────│───────────────────────────────────┘
                              │ window.electronAPI.*
┌─────────────────────────────│───────────────────────────────────┐
│  PROCESO RENDERER (sandboxed, sin Node.js)                      │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ SessionList │  │   Terminal   │  │       AiChat           │ │
│  │             │  │  (xterm.js)  │  │  (solo lee terminal)   │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Flujo de datos IPC

### Conexión SSH y terminal

```
Renderer                    Main                    SSH Server
   │                          │                          │
   │──ssh:connect(params)────▶│                          │
   │◀─{sessionId} ───────────│──── TCP/SSH ────────────▶│
   │                          │◀─── shell stream ────────│
   │◀─ssh:output(data) ───────│                          │
   │──ssh:input(data) ────────│──── stdin ──────────────▶│
   │──ssh:resize(cols,rows) ──│──── pty resize ─────────▶│
   │──ssh:disconnect(id) ─────│──── close ──────────────▶│
```

### Panel de IA (SOLO LECTURA — sin canal de vuelta a SSH)

```
Renderer                    Main                    Anthropic API
   │                          │                          │
   │──ai:sendMessage({        │                          │
   │    userMessage,          │                          │
   │    terminalSnapshot      │                          │
   │  })─────────────────────▶│                          │
   │                          │── redactar secretos      │
   │                          │── construir prompt ─────▶│
   │                          │◀─ respuesta ─────────────│
   │◀─{reply, redactedCtx} ───│                          │
   │                          │
   │  ✗ NO EXISTE ai:writeToTerminal
   │  ✗ NO EXISTE ningún canal IA → ssh:input
```

### Sesiones y ajustes

```
Renderer                    Main                    Disco (userData)
   │──sessions:list() ───────▶│──── electron-store ────▶│
   │◀─ SavedSession[] ────────│◀────────────────────────│
   │──sessions:save(s,creds)─▶│──── AES-256-GCM ───────▶│ (cifrado con lock key)
   │──sessions:delete(id) ───▶│──── borrar ────────────▶│
   │──settings:get() ─────────▶│                         │
   │──settings:set(patch) ────▶│                         │
```

## Configuración de seguridad BrowserWindow

```typescript
webPreferences: {
  contextIsolation: true,      // renderer no accede a objetos Node/Electron
  nodeIntegration: false,      // sin Node en renderer
  sandbox: true,               // renderer en sandbox de Chromium
  preload: path.join(__dirname, 'preload/index.js'),
}
```

## Layout de la UI

```
┌──────────────────────────────────────────────────────┐
│  Barra de título (sin frame nativo)                  │
├──────────────┬───────────────────────────────────────┤
│              │                                        │
│  Session     │         Terminal (xterm.js)            │
│  List        │                                        │
│  (sidebar)   │                                        │
│              ├───────────────────────────────────────┤
│  [+ Nueva]   │         AI Chat Panel                  │
│  [Ajustes]   │   (redaction preview + chat)           │
└──────────────┴───────────────────────────────────────┘
```
