import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api, errorMessage, need, type Schema } from '../lib/api';
import { Art } from '../components/Art';
import { Skeleton } from '../components/ui';

/**
 * The second step of signing in. With no authenticator yet: scan, confirm a code, keep the recovery
 * codes. With one: enter its code, or a recovery code.
 */
export function MfaGate({ enrolled }: { enrolled: boolean }) {
  const { signOut } = useAuth();
  return (
    <div className="auth backdrop">
      <div className="card">
        <div className="brand">
          <img src="/favicon.png" alt="" />
          <div>
            Elixir Books
            <small>Platform admin</small>
          </div>
        </div>
        <Art name="secure" height={96} />
        {enrolled ? <Verify /> : <Enroll />}
        <button className="btn" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function CodeForm({ label, hint, submitLabel, onCode }: { label: string; hint: string; submitLabel: string; onCode: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCode(code.trim());
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>{label}</span>
        <input className="input mono" autoComplete="one-time-code" inputMode="text" autoFocus required minLength={6} maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        {hint}
      </p>
      {error ? (
        <div className="alert bad" role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn primary" type="submit" disabled={busy || code.trim().length < 6}>
        {busy ? 'Checking…' : submitLabel}
      </button>
    </form>
  );
}

function Verify() {
  const { mfaPassed } = useAuth();
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Enter the 6-digit code from your authenticator app.
      </p>
      <CodeForm
        label="Code"
        hint="Lost your phone? Enter one of your recovery codes instead. Each works once."
        submitLabel="Continue"
        onCode={async (code) => {
          need(await api.POST('/admin/mfa/verify', { body: { code } }));
          mfaPassed();
        }}
      />
    </>
  );
}

function Enroll() {
  const { mfaPassed } = useAuth();
  const [enrollment, setEnrollment] = useState<Schema<'MfaEnrollment'> | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .POST('/admin/mfa/enrollment')
      .then((res) => need(res))
      .then(async (e) => {
        if (!live) return;
        setEnrollment(e);
        setQr(await QRCode.toDataURL(e.otpauthUri, { margin: 1, width: 200 }));
      })
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, []);

  if (codes) {
    return (
      <>
        <Art name="success" height={96} />
        <p style={{ margin: 0 }}>
          <strong>Save these recovery codes.</strong> Each one signs you in once if you lose your phone. They won’t be shown again.
        </p>
        <pre className="mono" data-testid="recovery-codes" style={{ margin: 0, padding: 12, background: 'var(--surface-2, #f4f4f5)', borderRadius: 8, columns: 2 }}>
          {codes.join('\n')}
        </pre>
        <button className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>
          Copy codes
        </button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I’ve saved them somewhere safe
        </label>
        <button className="btn primary" type="button" disabled={!saved} onClick={mfaPassed}>
          Continue
        </button>
      </>
    );
  }

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Operators need an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). Scan this code with it, then enter the 6 digits it shows.
      </p>
      {error ? (
        <div className="alert bad" role="alert">
          {error}
        </div>
      ) : null}
      {enrollment ? (
        <>
          {qr ? <img src={qr} alt="QR code for your authenticator app" width={200} height={200} style={{ alignSelf: 'center' }} /> : null}
          <details>
            <summary className="muted">Can’t scan? Enter this key instead</summary>
            <code className="mono" style={{ wordBreak: 'break-all' }}>
              {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
            </code>
          </details>
          <CodeForm
            label="Code from the app"
            hint="Codes change every 30 seconds."
            submitLabel="Turn on"
            onCode={async (code) => setCodes(need(await api.POST('/admin/mfa/enrollment/confirm', { body: { code } })).recoveryCodes)}
          />
        </>
      ) : error ? null : (
        <Skeleton rows={3} />
      )}
    </>
  );
}
