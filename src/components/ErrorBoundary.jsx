import React from 'react'
import { AlertTriangle, RefreshCw, Camera } from 'lucide-react'

/**
 * ErrorBoundary — render-phase safety net for the scan result subtree.
 *
 * Why this exists: the mobile white-screen investigation established that
 * every network/parse failure in the scan flow already renders a visible
 * error message; the only path that can blank the whole page is an uncaught
 * render-phase exception inside the result tree (with no boundary, React
 * unmounts the entire root). This boundary converts that failure into a
 * visible in-app error card while keeping the surrounding app shell alive.
 *
 * Behavior contract:
 * - Zero effect on normal successful rendering (renders children as-is).
 * - Logs the full error + component stack via console.error (not hidden).
 * - No automatic page reload.
 * - "Try Again" re-renders the result subtree in place.
 * - "Back to Scan" (when onReset is provided) runs the parent's existing
 *   scan reset flow.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Render-phase error in result subtree:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleTryAgain = () => {
    this.setState({ error: null, errorInfo: null })
  }

  handleBackToScan = () => {
    this.setState({ error: null, errorInfo: null })
    if (this.props.onReset) this.props.onReset()
  }

  render() {
    const { error, errorInfo } = this.state
    const { children, onReset } = this.props

    if (!error) return children

    return (
      <div className="bg-white rounded-lg border border-danger-200 p-6 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-danger-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-neutral-900">
              We couldn't display your scan result
            </h3>
            <p className="text-sm text-neutral-600 mt-1">
              The scan completed and the result was received, but the result view
              failed to render on this device. Your scan may already be saved in
              your history. No data was lost — you can safely scan again.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                onClick={this.handleTryAgain}
                className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium flex items-center justify-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              {onReset && (
                <button
                  onClick={this.handleBackToScan}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm"
                >
                  <Camera className="w-4 h-4" />
                  Back to Scan
                </button>
              )}
            </div>

            {/* Underlying exception is never hidden — full detail on demand. */}
            <details className="mt-4">
              <summary className="text-xs font-medium text-neutral-500 cursor-pointer hover:text-neutral-700">
                Technical details
              </summary>
              <pre className="mt-2 text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                {error?.toString()}
              </pre>
              {errorInfo?.componentStack && (
                <pre className="mt-2 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {errorInfo.componentStack}
                </pre>
              )}
            </details>
          </div>
        </div>
      </div>
    )
  }
}
