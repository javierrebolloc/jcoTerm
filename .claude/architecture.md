# architecture.md — Process Architecture

## Process Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (privileged Node.js)                              │
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
                              │ contextBridge (minimal API)
┌─────────────────────────────│───────────────────────────────────┐
│  PRELOAD (src/preload/index.ts)                                 │
│  Exposes window.electronAPI with allowed methods                │
└─────────────────────────────│───────────────────────────────────┘
                              │ window.electronAPI.*
┌─────────────────────────────│───────────────────────────────────┐
│  RENDERER PROCESS (sandboxed, no Node.js)                       │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ SessionList │  │   Terminal   │  │       AiChat           │ │
│  │             │  │  (xterm.js)  │  │  (read-only terminal)  │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## IPC Data Flow

### SSH Connection and Terminal

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

### AI Panel (READ-ONLY — no return channel to SSH)

```
Renderer                    Main                    Anthropic API
   │                          │                          │
   │──ai:sendMessage({        │                          │
   │    userMessage,          │                          │
   │    terminalSnapshot      │                          │
   │  })─────────────────────▶│                          │
   │                          │── redact secrets         │
   │                          │── build prompt ──────────▶│
   │                          │◀─ response ──────────────│
   │◀─{reply, redactedCtx} ───│                          │
   │                          │
   │  ✗ ai:writeToTerminal DOES NOT EXIST
   │  ✗ NO channel from AI → ssh:input EXISTS
```

### Sessions and Settings

```
Renderer                    Main                    Disk (userData)
   │──sessions:list() ───────▶│──── electron-store ────▶│
   │◀─ SavedSession[] ────────│◀────────────────────────│
   │──sessions:save(s,creds)─▶│──── AES-256-GCM ───────▶│ (encrypted with lock key)
   │──sessions:delete(id) ───▶│──── delete ────────────▶│
   │──settings:get() ─────────▶│                         │
   │──settings:set(patch) ────▶│                         │
```

## BrowserWindow Security Configuration

```typescript
webPreferences: {
  contextIsolation: true,      // renderer cannot access Node/Electron objects
  nodeIntegration: false,      // no Node in renderer
  sandbox: true,               // renderer in Chromium sandbox
  preload: path.join(__dirname, 'preload/index.js'),
}
```

## UI Layout

```
┌──────────────────────────────────────────────────────┐
│  Title bar (no native frame)                         │
├──────────────┬───────────────────────────────────────┤
│              │                                        │
│  Session     │         Terminal (xterm.js)            │
│  List        │                                        │
│  (sidebar)   │                                        │
│              ├───────────────────────────────────────┤
│  [+ New]     │         AI Chat Panel                  │
│  [Settings]  │   (redaction preview + chat)           │
└──────────────┴───────────────────────────────────────┘
```
