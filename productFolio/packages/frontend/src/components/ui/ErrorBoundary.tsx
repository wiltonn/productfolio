import { Component, ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          reset={this.resetError}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  title?: string;
  description?: string;
}

export function DefaultErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again or contact support if the problem persists.',
}: ErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full">
        <div className="card p-8">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-red-100">
            <svg
              className="w-8 h-8 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-display font-semibold text-surface-900 text-center mb-2">
            {title}
          </h2>

          <p className="text-sm text-surface-600 text-center mb-6">
            {description}
          </p>

          <details className="mb-6">
            <summary className="cursor-pointer text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors">
              Technical Details
            </summary>
            <div className="mt-3 p-4 bg-surface-50 rounded-lg border border-surface-200">
              <p className="text-xs font-mono text-danger break-all">
                {error.name}: {error.message}
              </p>
              {error.stack && (
                <pre className="mt-2 text-[10px] font-mono text-surface-600 overflow-auto max-h-32">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="btn-primary flex-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="btn-secondary flex-1"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact error display for smaller sections
export function CompactErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 mb-3 rounded-full bg-red-100 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1">
        Error Loading Content
      </h3>
      <p className="text-xs text-surface-500 mb-4 max-w-xs">
        {error.message}
      </p>
      <button onClick={reset} className="btn-secondary text-sm">
        Try Again
      </button>
    </div>
  );
}

// Hook for functional components to use error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
