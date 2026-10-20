import React from 'react';

interface ErrorBoundaryState { error: Error | null }

/** Keep one failed screen/widget from silently turning the entire app into a blank page. */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AGNI RAKSHAK UI]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#050B14', color: '#e2e8f0', padding: 24, fontFamily: 'ui-monospace, monospace' }}>
          <h1 style={{ color: '#fb7185', fontSize: 18, marginBottom: 12 }}>AGNI RAKSHAK could not render this screen</h1>
          <p style={{ color: '#94a3b8', marginBottom: 12 }}>The error is shown below so it can be diagnosed instead of leaving a blank page.</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, background: '#0b1220', border: '1px solid #334155', borderRadius: 6 }}>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 12px', border: '1px solid #0e7490', borderRadius: 5, color: '#67e8f9' }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
