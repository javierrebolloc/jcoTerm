import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
  title: string
  message: string
  buttonText: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    window.electronAPI.log(
      'error',
      `[ErrorBoundary] ${error.message}\n${info.componentStack ?? ''}`,
    )
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className={styles.overlay}>
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden="true">!</span>
          <h2 className={styles.title}>{this.props.title}</h2>
          <p className={styles.message}>{this.props.message}</p>
          {this.state.error && (
            <pre className={styles.errorBlock}>
              <code>{this.state.error.message}</code>
            </pre>
          )}
          <button className={styles.reloadBtn} onClick={this.handleReload}>
            {this.props.buttonText}
          </button>
        </div>
      </div>
    )
  }
}
