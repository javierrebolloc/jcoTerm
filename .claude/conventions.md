# conventions.md — Code Conventions

## TypeScript

- `strict: true` in all tsconfig files. No `any` without explicit justification.
- Explicit types in public function signatures; inference for local variables.
- `interface` for contracts (public data types); `type` for unions and aliases.
- Enums only if the value set is closed and semantically meaningful; otherwise, `as const`.

## Naming

| Element | Convention | Example |
|---|---|---|
| Classes | PascalCase | `SshSession`, `Redactor` |
| Functions/methods | camelCase | `getVisibleContent()` |
| Variables | camelCase | `sessionId`, `terminalSnapshot` |
| Module constants | SCREAMING_SNAKE | `MAX_SCROLLBACK_LINES` |
| IPC channels | `domain:action` in kebab-case | `ssh:connect`, `ai:sendMessage` |
| React component files | PascalCase | `Terminal.tsx`, `AiChat.tsx` |
| Utility/module files | camelCase | `redactor.ts`, `ssh-session.ts` |
| Test files | `<module>.test.ts` | `redactor.test.ts` |
| CSS Modules | camelCase in the object | `styles.chatPanel` |

## File Structure

- One React component = one folder with its `.tsx` and its `.module.css`.
- Hooks extracted into separate `use<Name>.ts` files.
- No barrel files (`index.ts` re-exporters) unless the directory has >4 public exports.

## Comments

- Only where the WHY is not obvious (hidden constraint, subtle invariant, workaround).
- Do not document what the name already says.
- In IPC and security interfaces: do comment guarantees or deliberate absences (e.g., `// No return channel to SSH by design`).

## Error Handling

- Domain errors: custom error classes (`SshConnectionError`, `RedactorError`).
- In IPC handlers: ALWAYS catch, return `{ success: false, error: string }` without including secrets or full stack traces in the message.
- Logs: `console.error` only in development. In production, structured logger without sensitive data.
- Never `throw` with credentials or SSH objects in the message.

## React

- Functional components only.
- Props typed with an explicit `interface` above the component.
- Local state with `useState`; effects with `useEffect` always cleaning up listeners.
- No prop drilling beyond 2 levels: use a React context or a shared hook.

## IPC

- All channel names defined in `src/shared/ipc-channels.ts` as constants.
- `ipcMain.handle` for request/response (returns Promise).
- `webContents.send` for push notifications from main to renderer (e.g., SSH output).
- Validate and sanitize inputs in main before using them (never trust the renderer).

## CSS

- CSS variables in `:root` of `globals.css` for colors, spacing, and typography.
- CSS Modules per component: `.module.css` in the same folder.
- Dark theme as default (suitable for a terminal app).
- No external UI component libraries in v1 (keep dependencies minimal).
