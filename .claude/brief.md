# brief.md — Encargo original del proyecto

> Este fichero contiene el encargo inicial tal cual fue recibido. No modificar salvo instrucción explícita del usuario.

---

Quiero construir una aplicación de escritorio para Windows: un cliente SSH con un panel de chat de IA integrado (de solo lectura). Actúa como ingeniero senior y sigue los estándares de la industria en todo momento. Antes de escribir código, propón la estructura del proyecto y espera mi confirmación.

## Objetivo de la app

Un cliente SSH para conectarme a servidores Linux desde Windows, con un panel lateral de chat con IA. La IA puede leer el contenido de la terminal cuando yo le pregunto, y sugerir, pero NUNCA escribe en la sesión SSH ni ejecuta comandos. El acceso de la IA a la terminal es estrictamente de solo lectura, garantizado por diseño (no debe existir ningún canal por el que la IA pueda enviar input a la sesión).

## Stack

- Electron + TypeScript
- xterm.js para el emulador de terminal
- ssh2 para las conexiones SSH
- Empaquetado como instalable de Windows (electron-builder)
- Arquitectura con separación estricta de procesos: lógica de SSH y secretos SOLO en el proceso main; el renderer no maneja credenciales en claro. Comunicación por IPC con contextIsolation activado, nodeIntegration desactivado y un preload con API mínima expuesta por contextBridge.

## Funcionalidades de la v1

1. Conectar a un servidor Linux por SSH (usuario/contraseña y también clave privada).
2. Terminal funcional con xterm.js (colores, redimensionado, scrollback).
3. Gestión de sesiones guardadas: puedo guardar un servidor (nombre, host, puerto, usuario, método de autenticación) y reconectarme con doble clic desde una lista de sesiones. Las credenciales se guardan cifradas usando DPAPI de Windows (a través de safeStorage de Electron), nunca en texto plano. La configuración no sensible se guarda en el directorio de userData.
4. Panel lateral de chat con IA que habla con la API de Anthropic mediante HTTP. La API key la introduzco yo en ajustes y se guarda cifrada con safeStorage.
5. Contexto que recibe la IA: por defecto, solo el contenido visible en pantalla de la terminal, más cualquier texto que yo seleccione manualmente. Antes de enviar nada a la API, aplica una redacción básica de secretos evidentes (contraseñas, tokens, claves privadas, cabeceras Authorization) mediante patrones, y muéstrame de forma clara qué se va a enviar. No envíes nunca el scrollback completo automáticamente.

## Tests automáticos

La app debe tener tests automáticos siguiendo los estándares de la industria:

- Tests unitarios y de integración con Vitest (en TypeScript). Cubre como mínimo: la lógica de redacción de secretos, el cifrado/descifrado y persistencia de sesiones guardadas, el parseo y construcción del contexto que se envía a la IA, y la capa de manejo de errores. La lógica de seguridad debe tener cobertura prioritaria.
- Tests end-to-end con Playwright (que tiene soporte oficial para Electron), cubriendo al menos: arranque de la app, guardar una sesión y reconectar con doble clic, y el flujo del panel de IA mostrando qué se va a enviar antes de enviarlo.
- Configura los tests para poder ejecutarlos con un comando claro (p. ej. npm test y npm run test:e2e), documentado en el README y en CLAUDE.md.
- Escribe los tests a medida que implementas cada fase, no todos al final. Una fase no se considera terminada sin sus tests.
- No uses credenciales ni servidores reales en los tests; usa mocks/stubs para SSH y para la API de Anthropic.

## Documentación para el agente (memoria de proyecto)

Como este proyecto lo desarrollaremos juntos a lo largo de muchas sesiones, quiero que mantengas una capa de documentación pensada para que TÚ te orientes rápido sin releer todo el código cada vez (para ahorrar tokens). Crea y mantén esto:

Un fichero CLAUDE.md en la raíz, que es lo primero que leerás en cada sesión. Debe ser breve y contener: resumen del proyecto en pocas líneas, el stack, comandos clave (build, dev, lint, test, test:e2e), las reglas de seguridad inviolables (la IA es solo lectura, secretos solo en main, etc.) y punteros a los documentos de .claude/.

Una carpeta .claude/ con documentos cortos y estables, en español:

- brief.md: el encargo original del proyecto. Guarda aquí, literalmente y sin reescribir, este prompt que te estoy dando, como referencia inmutable de qué se pidió y por qué. No lo modifiques en el futuro salvo que yo te lo pida explícitamente.
- architecture.md: arquitectura de procesos (main/renderer/preload), flujo de datos y diagrama textual.
- code-map.md: mapa del código. Para cada módulo importante, una línea diciendo qué hace y en qué fichero/carpeta vive. Este es el documento que consultarás para ir directo al fichero correcto en vez de escanear todo.
- conventions.md: convenciones de código, estilo, nombrado y patrones que seguimos.
- decisions.md: registro de decisiones técnicas (estilo ADR ligero) con fecha y motivo.
- progress.md: estado actual, qué fase está hecha, qué falta y próximos pasos.
- security.md: el modelo de seguridad detallado (manejo de credenciales, redacción de secretos, límites de la IA).
- testing.md: estrategia de tests, qué se cubre, cómo ejecutarlos y convenciones de testing.

Reglas sobre esta documentación:

- Mantén estos ficheros como RESÚMENES CON PUNTEROS, nunca copias del código. La fuente de verdad es el código; estos documentos solo te ayudan a navegar. (Excepción: brief.md, que sí contiene el encargo literal.)
- Cada vez que completes una fase o tomes una decisión relevante, ACTUALIZA progress.md, code-map.md y decisions.md antes de terminar.
- Mantenlos concisos. Si un documento crece demasiado, resúmelo.
- Al empezar cada sesión, lee CLAUDE.md y los documentos de .claude/ relevantes antes de tocar código.

## Estándares que debes seguir

- TypeScript en modo strict.
- ESLint + Prettier configurados.
- Manejo de errores robusto y sin secretos en logs.
- Gestión segura de credenciales como se ha descrito; revisa el modelo de seguridad de Electron y aplícalo.
- Código modular y comentado donde aporte valor, con una estructura de carpetas clara.
- README con instrucciones de build, ejecución y tests.
- Si vas a usar dependencias, justifícalas brevemente y prefiere librerías mantenidas.

## Cómo quiero trabajar

Primero, crea la estructura de carpetas y los ficheros de documentación (CLAUDE.md y .claude/, incluyendo brief.md con este encargo literal) con su contenido inicial, y enséñamelos. Después explícame el plan y la estructura de archivos del código, y espera mi confirmación. Luego implementa por fases: primero la terminal SSH básica, después las sesiones guardadas, y por último el panel de IA. Cada fase incluye sus tests. Al terminar cada fase, actualiza la documentación del agente, párate y dime qué has hecho antes de seguir.
