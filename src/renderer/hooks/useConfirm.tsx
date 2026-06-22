import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import styles from './ConfirmDialog.module.css'

interface ConfirmState {
  message: string
  danger: boolean
  resolve: (result: boolean) => void
}

type ConfirmFn = (message: string, danger?: boolean) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((message: string, danger = false): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ message, danger, resolve })
    })
  }, [])

  const handleResult = (result: boolean): void => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className={styles.overlay} onClick={() => handleResult(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <pre className={styles.message}>{state.message}</pre>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={() => handleResult(false)}>
                Cancel
              </button>
              <button
                className={state.danger ? styles.dangerBtn : styles.confirmBtn}
                onClick={() => handleResult(true)}
                autoFocus
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
