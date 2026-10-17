import { useSearchParams } from 'react-router';
import { AuditList } from '../components/AuditList';
import { PageHeader } from '../components/ui';
import type { Schema } from '../lib/api';

type TargetType = Schema<'PlatformAuditEvent'>['targetType'];

export function AuditLog() {
  const [params, setParams] = useSearchParams();
  const targetType = (params.get('targetType') || undefined) as TargetType | undefined;
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  return (
    <div>
      <PageHeader title="Audit log" sub="Every action a platform operator has taken, with the reason they gave. Read-only." />
      <section className="card">
        <div className="toolbar">
          <select className="select" aria-label="Target" value={targetType ?? ''} onChange={(e) => set('targetType', e.target.value)}>
            <option value="">All targets</option>
            <option value="account">Accounts</option>
            <option value="company">Companies</option>
            <option value="user">Users</option>
          </select>
          <label className="row muted">
            From
            <input className="input" type="date" value={from ?? ''} max={to} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="row muted">
            To
            <input className="input" type="date" value={to ?? ''} min={from} onChange={(e) => set('to', e.target.value)} />
          </label>
        </div>
        {/* Keyed on the filters so paging starts over when they change. */}
        <AuditList key={`${targetType}|${from}|${to}`} filters={{ targetType, from, to }} />
      </section>
    </div>
  );
}
