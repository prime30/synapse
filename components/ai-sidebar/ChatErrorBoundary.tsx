'use client';

import React from 'react';

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback UI. If not provided, a default recovery UI is shown. */
  fallback?: React.ReactNode;
}

interface ChatErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary for the AI chat panel.
 *
 * Catches render crashes in the chat UI and displays a recovery interface
 * instead of a blank screen. Users can click "Reset" to recover.
 */
export class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ChatErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium ide-text-2">
              Chat encountered an error
            </p>
            <p className="mt-1 text-xs ide-text-muted">
              Something went wrong rendering the chat. Your conversation is safe.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="mt-1 rounded-md ide-surface-input ide-text-2 hover:ide-text ide-hover px-4 py-1.5 text-xs font-medium transition-colors"
          >
            Reset Chat View
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-2 max-w-full overflow-x-hidden rounded ide-surface-panel border ide-border p-2 text-left text-[10px] text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
