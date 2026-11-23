import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  detail?: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let errorMessage = error.message || 'An unexpected application error occurred.';
    let detail: string | undefined;

    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string | null;
      };
      if (parsed && parsed.error) {
        errorMessage = parsed.error.includes('Quota exceeded')
          ? 'Daily Firestore free-tier quota exceeded. Quota resets tomorrow.'
          : `Database operation failed (${parsed.operationType ?? 'unknown'} on ${parsed.path ?? 'collection'}).`;
        detail = parsed.error;
      }
    } catch {
      // Plain error string
    }

    return {
      hasError: true,
      errorMessage,
      detail,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: '', detail: undefined });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-8">
            <div className="flex items-center gap-3 text-red-700 mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-lg font-semibold text-slate-900">
                Application Error
              </h1>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              {this.state.errorMessage}
            </p>
            {this.state.detail && (
              <p className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded p-3 mb-6 break-words">
                {this.state.detail}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1e3a8a] hover:bg-[#1e40af] rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
