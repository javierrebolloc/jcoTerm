# security.md — Security Model

## Fundamental Principles

1. **Least privilege in the renderer.** The renderer cannot access Node.js or Electron directly. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
2. **Credentials only in main.** SSH passwords, private keys, and the Anthropic API key never cross IPC in plaintext nor are stored unencrypted.
3. **AI has no write channel.** There is no IPC handler that connects AI output to SSH input. Structural guarantee.
4. **Redaction before sending context to AI.** The user sees the redacted text before confirming submission.

## Lock Password (LockStore)

The app requires a password on startup. If none exists, the user is asked to create one on first launch.

| Aspect | Detail |
|---|---|
| KDF | PBKDF2 (SHA-512, 100,000 iterations) |
| Salt | 32 random bytes (crypto.randomBytes) |
| Key length | 64 bytes |
| Storage | `lock.json` in userData: `{ salt, hash, iterations }` |
| Comparison | `crypto.timingSafeEqual` (prevents timing attacks) |

The plaintext password is never stored or transmitted to the renderer. The renderer sends the password via IPC, and main hashes and compares it.

## Credential Storage

| Data | Where it is stored | How |
|---|---|---|
| SSH Password | userData/credentials.json | AES-256-GCM (key derived from the lock password) |
| SSH Private Key | userData/credentials.json | AES-256-GCM (key derived from the lock password) |
| Anthropic API Key | userData/credentials.json | AES-256-GCM (key derived from the lock password) |
| Gemini API Key | userData/credentials.json | AES-256-GCM (key derived from the lock password) |
| Sessions (host, port, user) | userData/sessions.json | electron-store (unencrypted — not sensitive) |
| UI Preferences | userData/config.json | electron-store (unencrypted) |

The encryption key is derived from the lock password with PBKDF2 and only exists in memory while the app is unlocked. It is never written to disk or passed to the renderer. If the lock password changes, old credentials are deleted (the new key cannot decrypt them).

## Portable Mode

If a `portable` file exists next to the executable, the app enters portable mode:
- `app.setPath('userData', './data/')` — all data is stored alongside the .exe
- Sessions are saved in `data/sessions.json` instead of Documents
- Credentials use AES-256-GCM (derived from the lock password) — portable across machines
- Does not depend on DPAPI or the Windows user

## Credential Flow During SSH Connection

```
Renderer ──ssh:connect({ sessionId })──> Main
                                          |
                                    SessionStore.getCredentials(id)
                                          | (decrypts with AES-256-GCM + key in memory)
                                          v
                                    SshSession.connect(host, user, creds)
                                          |
                                    creds = null (clear reference)
                                          v
                                    SSH stream active
```

The renderer never receives the credentials. It only sends the `sessionId`.
The decryption key only exists in memory after unlocking.

## Encryption Key Lifecycle

```
App starts -> splash 5s -> lock screen
                            |
                      user enters password
                            |
                      PBKDF2(password, encryptionSalt) -> encryptionKey (32 bytes, in memory)
                            |
                      CredentialStore.setEncryptionKey(key)
                            |
                      App unlocked — credentials accessible
                            |
                      On app close -> key discarded -> credentials inaccessible
```

If the lock password is changed:
1. New `encryptionSalt` + `verifySalt` are generated
2. All credentials are deleted (`wipeCredentials`)
3. New encryption key is derived

## Secret Redaction (Redactor.ts)

Patterns applied before sending context to Anthropic:

| Pattern | What it detects |
|---|---|
| `password\s*[:=]\s*\S+` | Passwords in text |
| `-----BEGIN .* PRIVATE KEY-----[\s\S]*-----END .* PRIVATE KEY-----` | PEM private keys |
| `Authorization:\s*(Bearer\s+\S+\|Basic\s+\S+)` | HTTP auth headers |
| `[A-Za-z0-9+/]{40,}={0,2}` (context-aware) | Long base64 tokens |
| `sk-[A-Za-z0-9]{32,}` | OpenAI/Anthropic-style API keys |
| `ghp_[A-Za-z0-9]{36}` | GitHub personal access tokens |
| `export \w*(TOKEN\|KEY\|SECRET\|PASS)\w*=\S+` | Environment variables with secrets |

The patterns replace the value with `[REDACTED]`. The redacted text is shown to the user in `RedactionPreview` before confirming submission.

## Content Security Policy (BrowserWindow)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'none';         <- the renderer does not fetch directly
img-src 'self' data:;
font-src 'self';
```

HTTP calls to Anthropic are made by the main process, never the renderer.

## IPC Input Validation

In `src/main/security.ts`:
- Validate type and range of all IPC input parameters.
- Limit string length (prevent memory attacks).
- The SSH hostname is validated against a hostname/IP regex before connecting.
- The `sessionId` is validated as UUID v4 before looking it up in the Map.

## Logs

- In development: standard `console.log/error`.
- In production: no credentials, no stack traces with sensitive data, no terminal content.
- SSH connection errors expose only the error code, not the session configuration.

## Privacy in the Gemini Free Tier

The Gemini API free tier (Google AI Studio, no active billing) has the following implications that the user should be aware of:

- **Guaranteed zero cost**: without a billing account associated with the API key, Google will reject requests beyond the free daily/per-minute limit. It is not possible to incur costs accidentally.
- **Data use for training**: in the free tier, Google may use prompts and responses to improve their models. The paid tier (with active billing) does not use data for training by default.
- **Mitigation in the app**: the Redactor removes secrets from the terminal snapshot before sending it. The `RedactionPreview` screen allows the user to review what will be sent. Even so, the app displays an explicit warning in Settings discouraging the sending of sensitive information when using Gemini on the free tier.

HTTP calls to Gemini are made by the main process via native `fetch` (Node 18+). The renderer's CSP (`connect-src 'none'`) prevents the renderer from contacting the Gemini API directly.

## AI Read-Only Guarantee (Verifiable in Code)

Search the code: there must be no call where the result of `AnthropicClient.sendMessage()` is passed as an argument to `SshSession.write()` or to any `ssh:input` handler. This invariant is covered by an architecture test.
