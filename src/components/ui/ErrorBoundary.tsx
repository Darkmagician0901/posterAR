/**
 * ErrorBoundary — top-level catch-all for render-time React errors.
 *
 * Wraps the AR and desktop branches in App.tsx. When a descendant component
 * throws during render, shows a fallback screen with Try Again (reset state)
 * and Reload Page actions instead of a white screen. Must be a class
 * component: React only exposes error-boundary hooks
 * (getDerivedStateFromError / componentDidCatch) on classes.
 *
 * Exports: ErrorBoundary.
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  /** Subtree to guard; rendered as-is until a descendant throws. */
  children: ReactNode;
}

interface State {
  /** True once a descendant has thrown; switches render to the fallback UI. */
  hasError: boolean;
  /** The thrown error, stored by componentDidCatch for display. */
  error: Error | null;
  /** React error info (component stack), stored by componentDidCatch. */
  errorInfo: ErrorInfo | null;
}

/**
 * Catches render errors from children and shows a recoverable fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * React calls this first, during render, so the very next render already
   * shows the fallback UI. Side effects are not allowed here — the error
   * details are captured in componentDidCatch below.
   *
   * @param _error — The thrown error (unused here; stored in componentDidCatch).
   * @returns State patch that flips rendering to the fallback UI.
   */
  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  /**
   * Called after the fallback has rendered; safe place for side effects
   * (logging) and for storing the error + component stack for display.
   *
   * @param error — The error thrown by a descendant during render.
   * @param errorInfo — React-provided info, including the component stack.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // You could also log to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  /**
   * Clears the error state so children re-mount; if the underlying problem
   * persists they will throw again and land back here.
   */
  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /** Hard-reloads the page — the heavier recovery option. */
  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-content">
            {/* Error icon */}
            <div className="error-icon">⚠️</div>

            {/* Error title */}
            <h1 className="error-title">Oops! Something went wrong</h1>

            {/* Error message */}
            <p className="error-message">
              We're sorry, but something unexpected happened. Please try again.
            </p>

            {/* TEMPORARY diagnostic — surface the error + React component stack
                on-device (no desktop inspector available on the phone). Shown in
                ALL builds and expanded by default so the failing component is
                readable. Remove with the rest of the diag instrumentation once
                the placement crash is fixed. */}
            {error && (
              <details className="error-details" open>
                <summary className="error-details-summary">Technical Details</summary>
                <div className="error-details-content">
                  <p className="error-name">{error.toString()}</p>
                  {errorInfo && <pre className="error-stack">{errorInfo.componentStack}</pre>}
                </div>
              </details>
            )}

            {/* Action buttons */}
            <div className="error-actions">
              <button className="error-button error-button-primary" onClick={this.handleRetry}>
                Try Again
              </button>
              <button className="error-button error-button-secondary" onClick={this.handleReload}>
                Reload Page
              </button>
            </div>

            {/* Help text */}
            <p className="error-help">
              If the problem persists, please try refreshing your browser or checking your internet
              connection.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
