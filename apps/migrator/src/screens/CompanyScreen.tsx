import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { loadBusiness } from '../lib/business';
import type { Business } from '../types';
import { BusinessForm } from './BusinessForm';

type Listed = { id: string; name: string; role?: string };

/** Which business gets the data. A person with one business sees it already chosen. */
export function CompanyScreen({ preselect, onBack, onPicked }: { preselect?: string; onBack: () => void; onPicked: (b: Business) => void }) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [picked, setPicked] = useState<string>(preselect ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () =>
    api()
      .GET('/companies')
      .then((res) => {
        const rows = ((res.data?.data ?? []) as unknown as Listed[]).map((c) => ({ id: c.id, name: c.name }));
        setList(rows);
        setPicked((p) => p || rows[0]?.id || '');
      })
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void load();
  }, []);

  const open = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      onPicked(await loadBusiness(id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (!list && !error) return <p className="muted"><span className="spinner" /> Loading your businesses…</p>;

  if (list && (list.length === 0 || creating)) {
    return (
      <div className="stack">
        <div className="hero">
          <h1>{list.length === 0 ? 'Set up your business' : 'Add a business'}</h1>
          <p className="lead">{list.length === 0 ? 'This account has no business yet. Add one to bring your data into.' : 'Create a new business to bring your data into.'}</p>
        </div>
        <BusinessForm onCreated={(id) => void open(id)} />
        {creating && (
          <div>
            <button className="btn link" onClick={() => setCreating(false)}>
              ← Choose an existing business
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="hero">
        <h1>Which business is this data for?</h1>
        <p className="lead">Everything you import goes into the business you pick. Check the name before you continue.</p>
      </div>
      <div className="stack tight" style={{ maxWidth: 560 }}>
        {(list ?? []).map((c) => (
          <label key={c.id} className={`pick ${picked === c.id ? 'on' : ''}`}>
            <input type="radio" name="company" checked={picked === c.id} onChange={() => setPicked(c.id)} />
            <span>
              <strong>{c.name}</strong>
            </span>
          </label>
        ))}
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={!picked || busy} onClick={() => void open(picked)}>
          {busy ? 'Opening…' : 'Continue'}
        </button>
        <button className="btn" onClick={() => setCreating(true)}>
          Add a new business
        </button>
        <button className="btn link" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
