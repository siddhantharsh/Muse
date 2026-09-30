// ============================================================
// Muse — Top-Level Error Boundary
// Catches render-time exceptions so a bug in one view degrades
// to a recoverable screen instead of a blank white page.
// ============================================================

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Muse] Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-nord0 font-mono p-6">
          <div className="w-full max-w-sm border border-nord3 bg-nord1">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-nord3/50">
              <AlertTriangle size={16} className="text-nord11" />
              <span className="text-sm font-semibold text-nord6">Something went wrong</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-nord4 leading-relaxed">
                Muse hit an unexpected error and stopped this view to avoid corrupting your
                data. Your tasks and events are safe in storage — reloading will restore them.
              </p>
              <p className="text-[10px] text-nord3 font-mono break-words">
                {this.state.error.message}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary w-full flex items-center justify-center gap-2 text-xs"
              >
                <RefreshCw size={12} />
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
