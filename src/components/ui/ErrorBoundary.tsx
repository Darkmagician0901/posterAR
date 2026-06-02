/**
 * ErrorBoundary Component
 * Catches and displays React errors gracefully
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component to catch React errors
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

  static getDerivedStateFromError(_error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // You could also log to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleRetry = (): void => {
    // Reset error state and attempt to re-render
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    // Reload the page
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

            {/* Error details (in development) */}
            {import.meta.env.DEV && error && (
              <details className="error-details">
                <summary className="error-details-summary">
                  Technical Details (Development Only)
                </summary>
                <div className="error-details-content">
                  <p className="error-name">{error.toString()}</p>
                  {errorInfo && (
                    <pre className="error-stack">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action buttons */}
            <div className="error-actions">
              <button
                className="error-button error-button-primary"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              <button
                className="error-button error-button-secondary"
                onClick={this.handleReload}
              >
                Reload Page
              </button>
            </div>

            {/* Help text */}
            <p className="error-help">
              If the problem persists, please try refreshing your browser or
              checking your internet connection.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
