import { useState } from 'react';
import { Icon } from '../components/Icon';
import { serverUrl, setServerUrl } from '../lib/api';
import { SOURCES } from '../lib/sources';

export function SourceScreen({ onPick, onServerChange }: { onPick: (id: string) => void; onServerChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(serverUrl());

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="hero" style={{ marginBottom: 0 }}>
        <h1>Where is your data coming from?</h1>
        <p className="lead">Bring your customers, items, invoices and more into Elixir Books Smart without typing them in again. Pick where you are starting from.</p>
      </div>

      <div className="sources">
        {SOURCES.map((s) => (
          <button key={s.id} className="source" disabled={s.status !== 'available'} onClick={() => onPick(s.id)}>
            <span className="mark">
              <Icon name={s.icon} size={26} />
            </span>
            <h2>
              {s.name}
              {s.status === 'soon' && <span className="badge">Coming soon</span>}
            </h2>
            <p>{s.blurb}</p>
            {s.status === 'available' && (
              <span className="row" style={{ color: 'var(--brand)', fontWeight: 650, gap: 6 }}>
                Start <Icon name="next" size={16} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 880 }}>
        <div className="row spread">
          <span className="row muted small" style={{ gap: 8 }}>
            <Icon name="server" size={16} />
            Connected to <strong style={{ color: 'var(--text)' }}>{serverUrl()}</strong>
          </span>
          <button className="btn link small" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Change server'}
          </button>
        </div>
        {editing && (
          <form
            className="row"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              setServerUrl(url);
              setEditing(false);
              onServerChange();
            }}
          >
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com" style={{ maxWidth: 400 }} required />
            <button className="btn primary" type="submit">
              Save
            </button>
            <span className="muted small">Paste the server’s address, with or without /v1. Changing it signs you out.</span>
          </form>
        )}
      </div>
    </div>
  );
}
