import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level error boundary. A render/runtime throw anywhere below it (e.g. a bad
 * card, a hooks bug, malformed markdown) shows a recoverable fallback instead of
 * blanking the whole SPA. Colors are hardcoded (not CSS vars) so the fallback
 * still renders if the stylesheet itself is the problem.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Denki] Uncaught render error:', error, info.componentStack);
  }

  private handleReset = () => this.setState({ hasError: false, error: undefined });

  private handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          background: '#09090b',
          color: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontSize: '40px' }}>⚡</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: '440px', lineHeight: 1.5, color: '#a1a1aa', margin: 0 }}>
          Denki hit an unexpected error. Your decks and review history are stored
          locally in this browser and are safe.
        </p>
        {this.state.error?.message && (
          <pre
            style={{
              maxWidth: '90vw',
              overflowX: 'auto',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.05)',
              color: '#f87171',
              fontSize: '12px',
              margin: 0,
            }}
          >
            {this.state.error.message}
          </pre>
        )}
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#f3f4f6',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
