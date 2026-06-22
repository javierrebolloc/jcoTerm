# brief.md — Original Project Brief

> This file contains the initial brief exactly as it was received. Do not modify unless explicitly instructed by the user.

---

I want to build a desktop application for Windows: an SSH client with an integrated AI chat panel (read-only). Act as a senior engineer and follow industry standards at all times. Before writing code, propose the project structure and wait for my confirmation.

## App Objective

An SSH client to connect to Linux servers from Windows, with a sidebar AI chat panel. The AI can read the terminal content when I ask, and suggest, but it NEVER writes to the SSH session or executes commands. The AI's access to the terminal is strictly read-only, guaranteed by design (there must be no channel through which the AI can send input to the session).

## Stack

- Electron + TypeScript
- xterm.js for the terminal emulator
- ssh2 for SSH connections
- Packaged as a Windows installer (electron-builder)
- Architecture with strict process separation: SSH logic and secrets ONLY in the main process; the renderer does not handle plaintext credentials. Communication via IPC with contextIsolation enabled, nodeIntegration disabled, and a preload with a minimal API exposed via contextBridge.

## v1 Features

1. Connect to a Linux server via SSH (username/password and also private key).
2. Functional terminal with xterm.js (colors, resizing, scrollback).
3. Saved session management: I can save a server (name, host, port, user, authentication method) and reconnect with a double-click from a session list. Credentials are saved encrypted using Windows DPAPI (via Electron's safeStorage), never in plaintext. Non-sensitive configuration is saved in the userData directory.
4. Sidebar AI chat panel that communicates with the Anthropic API via HTTP. I enter the API key in settings and it is saved encrypted with safeStorage.
5. Context the AI receives: by default, only the visible on-screen terminal content, plus any text I manually select. Before sending anything to the API, apply basic redaction of obvious secrets (passwords, tokens, private keys, Authorization headers) using patterns, and clearly show me what is going to be sent. Never send the full scrollback automatically.

## Automated Tests

The app must have automated tests following industry standards:

- Unit and integration tests with Vitest (in TypeScript). Cover at minimum: secret redaction logic, encryption/decryption and persistence of saved sessions, parsing and construction of the context sent to the AI, and the error handling layer. Security logic must have priority coverage.
- End-to-end tests with Playwright (which has official Electron support), covering at least: app startup, saving a session and reconnecting with double-click, and the AI panel flow showing what will be sent before sending it.
- Configure the tests to run with a clear command (e.g. npm test and npm run test:e2e), documented in the README and in CLAUDE.md.
- Write tests as you implement each phase, not all at the end. A phase is not considered complete without its tests.
- Do not use real credentials or servers in tests; use mocks/stubs for SSH and for the Anthropic API.

## Agent Documentation (Project Memory)

Since we will develop this project together over many sessions, I want you to maintain a documentation layer designed for YOU to orient yourself quickly without re-reading all the code each time (to save tokens). Create and maintain:

A CLAUDE.md file at the root, which is the first thing you will read in each session. It should be brief and contain: project summary in a few lines, the stack, key commands (build, dev, lint, test, test:e2e), the inviolable security rules (AI is read-only, secrets only in main, etc.) and pointers to the .claude/ documents.

A .claude/ folder with short, stable documents, in Spanish:

- brief.md: the original project brief. Store here, literally and without rewriting, this prompt I am giving you, as an immutable reference of what was requested and why. Do not modify it in the future unless I explicitly ask you to.
- architecture.md: process architecture (main/renderer/preload), data flow, and text diagram.
- code-map.md: code map. For each important module, one line saying what it does and which file/folder it lives in. This is the document you will consult to go directly to the correct file instead of scanning everything.
- conventions.md: code conventions, style, naming, and patterns we follow.
- decisions.md: technical decision log (lightweight ADR style) with date and rationale.
- progress.md: current status, which phase is done, what is missing, and next steps.
- security.md: detailed security model (credential management, secret redaction, AI limitations).
- testing.md: test strategy, what is covered, how to run them, and testing conventions.

Rules for this documentation:

- Keep these files as SUMMARIES WITH POINTERS, never copies of the code. The source of truth is the code; these documents only help you navigate. (Exception: brief.md, which does contain the literal brief.)
- Every time you complete a phase or make a relevant decision, UPDATE progress.md, code-map.md, and decisions.md before finishing.
- Keep them concise. If a document grows too large, summarize it.
- At the start of each session, read CLAUDE.md and the relevant .claude/ documents before touching code.

## Standards You Must Follow

- TypeScript in strict mode.
- ESLint + Prettier configured.
- Robust error handling with no secrets in logs.
- Secure credential management as described; review the Electron security model and apply it.
- Modular and commented code where it adds value, with a clear folder structure.
- README with build, execution, and test instructions.
- If you are going to use dependencies, justify them briefly and prefer maintained libraries.

## How I Want to Work

First, create the folder structure and documentation files (CLAUDE.md and .claude/, including brief.md with this literal brief) with their initial content, and show them to me. Then explain the plan and the code file structure, and wait for my confirmation. Then implement in phases: first the basic SSH terminal, then saved sessions, and finally the AI panel. Each phase includes its tests. After completing each phase, update the agent documentation, stop, and tell me what you did before continuing.
