import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '32px',
            background: 'var(--dm-color-bg-app)',
            color: 'var(--dm-color-fg-secondary)',
          }}
        >
          <span style={{ fontSize: '40px' }}>⚠️</span>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--dm-color-fg-primary)' }}>
            Something went wrong
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--dm-color-fg-tertiary)', maxWidth: '360px', textAlign: 'center' }}>
            {this.state.message}
          </p>
          <button
            onClick={this.reset}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--dm-color-border-default)',
              background: 'var(--dm-color-bg-hover)',
              color: 'var(--dm-color-fg-primary)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            ↩ Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
