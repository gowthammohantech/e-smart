import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Art } from './Art';

function report(err: unknown) {
  // The seam for an error-tracking service, as in the API and the apps.
  console.error('[admin]', err);
}

function Fallback({ detail }: { detail?: string }) {
  return (
    <div className="auth backdrop">
      <div className="card" role="alert">
        <Art name="error" height={110} />
        <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
        <p className="muted" style={{ margin: 0 }}>
          This page hit an error. Nothing was changed. Reload to try again.
        </p>
        {detail ? <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detail}</pre> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn" href="/">
            Go to overview
          </a>
        </div>
      </div>
    </div>
  );
}

/** A route that throws while loading or rendering (react-router's `errorElement`). */
export function RouteError() {
  const err = useRouteError();
  report(err);
  return <Fallback detail={isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : undefined} />;
}

/** Anything outside the router: providers, the auth gate. */
export class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    report({ error, componentStack: info.componentStack });
  }

  render() {
    return this.state.error ? <Fallback detail={this.state.error.message} /> : this.props.children;
  }
}

/** A production build made without VITE_API_URL: it would otherwise call localhost on the operator's machine. */
export function Misconfigured() {
  return <Fallback detail="This build has no API address (VITE_API_URL). Rebuild it with one." />;
}
