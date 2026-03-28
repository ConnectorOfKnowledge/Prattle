import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Prattle] Uncaught render error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h2 className="text-lg font-semibold text-cd-text mb-2">Something went wrong</h2>
            <p className="text-cd-subtle text-sm mb-4">
              An unexpected error occurred. Try reloading the app.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cd-accent text-white rounded hover:opacity-90 transition-opacity"
            >
              Reload
            </button>
            <details className="mt-4 text-left">
              <summary className="text-cd-subtle text-xs cursor-pointer">Error details</summary>
              <pre className="mt-2 text-xs text-red-400 bg-cd-surface p-3 rounded overflow-auto max-h-40">
                {this.state.error?.message || 'Unknown error'}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
