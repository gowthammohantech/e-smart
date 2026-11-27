import { useEffect, useState } from 'react';
import { api, errorMessage, tokenStore } from '../lib/api';
import type { Account } from '../types';
import { Icon } from '../components/Icon';
import { BusinessForm } from './BusinessForm';

type Mode = 'checking' | 'ask' | 'signin' | 'signup' | 'business' | 'resume';

/**
 * "Do you already have an account?" comes before anything else: the data has to land in somebody's
 * business, so we need to know whose. Someone new signs up and sets up their business right here.
 */
export function AccountScreen({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (account: Account, businessId?: string) => void }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [account, setAccount] = useState<Account | null>(null);

  // A session from last time: offer to carry on with it.
  useEffect(() => {
    if (!tokenStore.get()) {
      setMode('ask');
      return;
    }
    api()
      .GET('/me')
      .then((res) => {
        const u = res.data?.user;
        if (u) {
          setAccount({ name: u.name ?? '', email: u.email ?? '' });
          setMode('resume');
        } else setMode('ask');
      })
      .catch(() => {
        tokenStore.set(null);
        setMode('ask');
      });
  }, []);

  if (mode === 'checking') return <p className="muted"><span className="spinner" /> Checking your session…</p>;

  return (
    <div className="stack">
      {mode === 'resume' && account && (
        <>
          <div className="hero">
            <h1>Welcome back</h1>
            <p className="lead">You are signed in as {account.name || account.email}.</p>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => onSignedIn(account)}>
              Continue as {account.name || account.email}
            </button>
            <button
              className="btn"
              onClick={() => {
                tokenStore.set(null);
                setMode('ask');
              }}
            >
              Use a different account
            </button>
          </div>
        </>
      )}

      {mode === 'ask' && (
        <>
          <div className="hero">
            <h1>Do you already have an Elixir Books Smart account?</h1>
            <p className="lead">We bring your data into your business, so we need to know which one. It takes a minute either way.</p>
          </div>
          <div className="choices">
            <button className="choice" onClick={() => setMode('signin')}>
              <span className="mark">
                <Icon name="user" size={22} />
              </span>
              <strong>Yes, I have an account</strong>
              <span className="muted">Sign in, then choose the business to bring your data into.</span>
            </button>
            <button className="choice" onClick={() => setMode('signup')}>
              <span className="mark">
                <Icon name="building" size={22} />
              </span>
              <strong>No, I’m new</strong>
              <span className="muted">Create your account and set up your business. Then bring your data in.</span>
            </button>
          </div>
          <div>
            <button className="btn link" onClick={onBack}>
              ← Back
            </button>
          </div>
        </>
      )}

      {mode === 'signin' && <SignIn onBack={() => setMode('ask')} onDone={(a) => onSignedIn(a)} />}
      {mode === 'signup' && (
        <SignUp
          onBack={() => setMode('ask')}
          onDone={(a) => {
            setAccount(a);
            setMode('business');
          }}
        />
      )}
      {mode === 'business' && account && (
        <>
          <div className="hero">
            <h1>Now set up your business</h1>
            <p className="lead">Hi {account.name}. Tell us about your business. You can change all of this later in Elixir Books Smart.</p>
          </div>
          <BusinessForm onCreated={(id) => onSignedIn(account, id)} />
        </>
      )}
    </div>
  );
}

function SignIn({ onBack, onDone }: { onBack: () => void; onDone: (a: Account) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api().POST('/auth/sign-in', { body: { email: email.trim(), password } });
      if (!data?.accessToken || !data.refreshToken) throw new Error('Sign-in did not return a session.');
      tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      onDone({ name: data.user?.name ?? '', email: data.user?.email ?? email });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="hero">
        <h1>Sign in</h1>
        <p className="lead">Use the email and password you use for Elixir Books Smart.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button className="btn link" type="button" onClick={onBack}>
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}

function SignUp({ onBack, onDone }: { onBack: () => void; onDone: (a: Account) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api().POST('/auth/sign-up', { body: { name: name.trim(), email: email.trim(), password } });
      if (!data?.accessToken || !data.refreshToken) throw new Error('Sign-up did not return a session.');
      tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      onDone({ name: name.trim(), email: email.trim() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="hero">
        <h1>Create your account</h1>
        <p className="lead">Step 1 of 2. Next you set up your business.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Your name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
        </label>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          Password <span className="opt">(at least 8 characters)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div className="row">
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <button className="btn link" type="button" onClick={onBack}>
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}
