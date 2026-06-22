# conventions.md — Convenciones de código

## TypeScript

- `strict: true` en todos los tsconfig. Sin `any` sin justificación explícita.
- Tipos explícitos en firmas de funciones públicas; inferencia en variables locales.
- `interface` para contratos (tipos de datos públicos); `type` para uniones y aliases.
- Enums solo si el conjunto de valores es cerrado y semánticamente significativo; si no, `as const`.

## Nombrado

| Elemento | Convención | Ejemplo |
|---|---|---|
| Clases | PascalCase | `SshSession`, `Redactor` |
| Funciones/métodos | camelCase | `getVisibleContent()` |
| Variables | camelCase | `sessionId`, `terminalSnapshot` |
| Constantes de módulo | SCREAMING_SNAKE | `MAX_SCROLLBACK_LINES` |
| Canales IPC | `dominio:acción` en kebab-case | `ssh:connect`, `ai:sendMessage` |
| Ficheros de componentes React | PascalCase | `Terminal.tsx`, `AiChat.tsx` |
| Ficheros de utilidades/módulos | camelCase | `redactor.ts`, `ssh-session.ts` |
| Ficheros de tests | `<módulo>.test.ts` | `redactor.test.ts` |
| CSS Modules | camelCase en el objeto | `styles.chatPanel` |

## Estructura de ficheros

- Un componente React = una carpeta con su `.tsx` y su `.module.css`.
- Hooks extraídos en ficheros `use<Nombre>.ts` separados.
- Sin barrel files (`index.ts` re-exportadores) a menos que el directorio tenga >4 exports públicos.

## Comentarios

- Solo donde el POR QUÉ no es obvio (restricción oculta, invariante sutil, workaround).
- No documentar lo que el nombre ya dice.
- En interfaces IPC y de seguridad: sí comentar las garantías o ausencias deliberadas (p. ej. `// No existe canal de vuelta a SSH por diseño`).

## Manejo de errores

- Errores del dominio: clases de error personalizadas (`SshConnectionError`, `RedactorError`).
- En handlers IPC: capturar SIEMPRE, devolver `{ success: false, error: string }` sin incluir secretos ni stack traces completos en el mensaje.
- Logs: `console.error` solo en desarrollo. En producción, logger estructurado sin datos sensibles.
- Nunca hacer `throw` con credenciales u objetos SSH en el mensaje.

## React

- Componentes funcionales únicamente.
- Props tipadas con `interface` explícita encima del componente.
- Estado local con `useState`; efectos con `useEffect` limpiando siempre los listeners.
- Sin prop drilling de más de 2 niveles: usar un contexto React o un hook compartido.

## IPC

- Todos los nombres de canal definidos en `src/shared/ipc-channels.ts` como constantes.
- `ipcMain.handle` para request/response (devuelve Promise).
- `webContents.send` para notificaciones push del main al renderer (ej: output SSH).
- Validar y sanitizar inputs en el main antes de usarlos (nunca confiar en el renderer).

## CSS

- Variables CSS en `:root` de `globals.css` para colores, espaciados y tipografía.
- CSS Modules por componente: `.module.css` en la misma carpeta.
- Tema oscuro como predeterminado (adecuado para una app de terminal).
- Sin librerías de componentes UI externas en v1 (mantener las dependencias mínimas).
