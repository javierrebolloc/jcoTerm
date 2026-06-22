import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { t } from '../../../shared/i18n'
import 'xterm/css/xterm.css'

export interface UseTerminalOptions {
  sessionId: string
  isActive: boolean
  scrollback: number
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  multiExecTargets?: string[]
  onClose: () => void
}

export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement>
  getVisibleContent: () => string
}

export function useTerminal({ sessionId, isActive, scrollback, fontSize, fontFamily, cursorStyle, cursorBlink, multiExecTargets, onClose }: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const isActiveRef = useRef(isActive)

  const multiExecRef = useRef<string[] | undefined>(multiExecTargets)
  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  useEffect(() => { multiExecRef.current = multiExecTargets }, [multiExecTargets])

  // Mount once per sessionId
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      fontSize,
      fontFamily,
      scrollback,
      cursorStyle,
      cursorBlink,
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    const openTerminal = (attempt = 0): void => {
      try {
        term.open(container)
      } catch {
        if (attempt < 5) requestAnimationFrame(() => openTerminal(attempt + 1))
      }
    }
    openTerminal()

    termRef.current = term
    fitAddonRef.current = fitAddon

    const dataDisposable = term.onData((data) => {
      const targets = multiExecRef.current
      if (targets && targets.length > 0) {
        for (const targetId of targets) window.electronAPI.ssh.sendInput(targetId, data)
      } else {
        window.electronAPI.ssh.sendInput(sessionId, data)
      }
    })

    const handleMouseUp = (): void => {
      const selection = term.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    }
    container.addEventListener('mouseup', handleMouseUp)

    const handleContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        if (!text) return
        const targets = multiExecRef.current
        if (targets && targets.length > 0) {
          for (const targetId of targets) window.electronAPI.ssh.sendInput(targetId, text)
        } else {
          window.electronAPI.ssh.sendInput(sessionId, text)
        }
      }).catch((err) => {
        window.electronAPI.log('warn', '[clipboard] Paste failed:', (err as Error).message)
      })
    }
    container.addEventListener('contextmenu', handleContextMenu)

    const unsubOutput = window.electronAPI.ssh.onOutput((sid, data) => {
      if (sid === sessionId) term.write(data)
    })

    const unsubClose = window.electronAPI.ssh.onClose((sid) => {
      if (sid === sessionId) {
        term.write(`\r\n\x1b[33m${t('terminal.sessionClosed')}\x1b[0m\r\n`)
        onClose()
      }
    })

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (!isActiveRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit()
          window.electronAPI.ssh.resize(sessionId, term.cols, term.rows)
        } catch {
          // fitAddon may throw if the terminal is disposed
        }
      }, 100)
    })
    observer.observe(container)

    return () => {
      dataDisposable.dispose()
      unsubOutput()
      unsubClose()
      if (resizeTimer) clearTimeout(resizeTimer)
      observer.disconnect()
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('contextmenu', handleContextMenu)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Re-fit when this pane becomes active (tab switch or split activation)
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(() => {
      const fitAddon = fitAddonRef.current
      const term = termRef.current
      if (!fitAddon || !term) return
      try {
        fitAddon.fit()
        window.electronAPI.ssh.resize(sessionId, term.cols, term.rows)
      } catch { /* disposed */ }
    }, 10)
    return () => clearTimeout(timer)
  }, [isActive, sessionId])

  // Live-update terminal options when settings change
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    term.options.fontFamily = fontFamily
    term.options.cursorStyle = cursorStyle
    term.options.cursorBlink = cursorBlink
    const fitAddon = fitAddonRef.current
    if (fitAddon && isActiveRef.current) {
      try {
        fitAddon.fit()
        window.electronAPI.ssh.resize(sessionId, term.cols, term.rows)
      } catch { /* disposed */ }
    }
  }, [fontSize, fontFamily, cursorStyle, cursorBlink, sessionId])

  const getVisibleContent = useCallback((): string => {
    const term = termRef.current
    if (!term) return ''
    const buffer = term.buffer.active
    const totalLines = buffer.length
    const maxLines = Math.min(totalLines, 2000)
    const start = totalLines - maxLines
    const lines: string[] = []
    for (let i = start; i < totalLines; i++) {
      lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    }
    return lines.join('\n').trimEnd()
  }, [])

  return { containerRef, getVisibleContent }
}
