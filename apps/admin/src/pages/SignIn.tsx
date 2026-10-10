import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';

/** The seeded demo owner (see `packages/db/src/seed.ts`), pre-filled in development builds only. */
const DEV_EMAIL = import.meta.env.DEV ? 'gowtham@vertextraders.in' : '';
const DEV_PASSWORD = import.meta.env.DEV ? 'demo1234' : '';

export function SignIn() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/sign-in' ? from : '/'} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const notice = state.status === 'signedOut' ? state.notice : undefined;
  return (
    <div className="auth">
      <div className="card">
        <form onSubmit={submit}>
          <div className="brand">
            <img src="/favicon.png" alt="" />
            <div>
              Elixir Books
              <small>Platform admin</small>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            For platform operators only. Sign in with your Elixir Books account.
          </p>
          {notice ? <div className="alert warn">{notice}</div> : null}
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? (
            <div className="alert bad" role="alert">
              {error}
            </div>
          ) : null}
          <button className="btn primary" type="submit" disabled={busy || state.status === 'loading'}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
