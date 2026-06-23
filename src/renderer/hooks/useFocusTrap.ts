import { useEffect, useRef } from 'react'

export function useFocusTrap<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const focusable = (): HTMLElement[] =>
      Array.from(el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))

    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    el.addEventListener('keydown', handler)
    const firstFocusable = focusable()[0]
    if (firstFocusable) firstFocusable.focus()
    return () => el.removeEventListener('keydown', handler)
  }, [])

  return ref
}
