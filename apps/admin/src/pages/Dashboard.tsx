import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { PageHeader, QueryState } from '../components/ui';
import { api, need, type Schema } from '../lib/api';
import { fmtDate, fmtDay, fmtInt, PLAN_LABELS } from '../lib/format';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Marks take the series tokens; text and gridlines stay on text/line tokens.
const AXIS = { stroke: 'var(--muted-soft)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false } as const;

type Overview = Schema<'PlatformOverview'>;

function Tip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="muted" style={{ marginBottom: 4 }}>
        {typeof label === 'string' && /^\d{4}-/.test(label) ? fmtDate(label) : PLAN_LABELS[String(label)] ?? label}
      </div>
      {payload.map((p) => (
        <div className="tip-row" key={String(p.dataKey)}>
          <i style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong className="num" style={{ marginLeft: 'auto', paddingLeft: 12 }}>
            {fmtInt(Number(p.value))}
          </strong>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value num">{fmtInt(value)}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/** The chart's numbers as a table, for screen readers and exact values. */
function TableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="table-view">
      <summary>Show as table</summary>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} className={i ? 'right' : ''}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])}>
                {r.map((v, i) => (
                  <td key={i} className={i ? 'right num' : ''}>
                    {typeof v === 'number' ? fmtInt(v) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Charts({ data }: { data: Overview }) {
  const totalCompanies = data.plans.reduce((s, p) => s + p.companies, 0);
  const paid = data.plans.filter((p) => p.plan !== 'free').reduce((s, p) => s + p.companies, 0);
  const newAccounts = data.signups.reduce((s, d) => s + d.accounts, 0);
  const tickEvery = Math.max(0, Math.ceil(data.signups.length / 8) - 1);
  return (
    <div className="stack">
      <div className="stats">
        <StatTile label="Accounts" value={data.totals.accounts} hint={`${fmtInt(newAccounts)} new in range`} />
        <StatTile label="Companies" value={data.totals.companies} hint={totalCompanies ? `${Math.round((paid / totalCompanies) * 100)}% on a paid plan` : undefined} />
        <StatTile label="Users" value={data.totals.users} />
        <StatTile label="Active users" value={data.totals.activeUsers30d} hint="Seen in the last 30 days" />
        <StatTile label="Suspended accounts" value={data.totals.suspendedAccounts} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Signups per day</h2>
          <div className="legend" aria-hidden="true">
            <span>
              <i style={{ background: 'var(--series-1)' }} />
              Accounts
            </span>
            <span>
              <i style={{ background: 'var(--series-2)' }} />
              Companies
            </span>
          </div>
        </div>
        <div className="card-body chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.signups} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--muted-soft)" />
              <XAxis dataKey="date" tickFormatter={fmtDay} interval={tickEvery} {...AXIS} />
              <YAxis allowDecimals={false} axisLine={false} {...AXIS} />
              <Tooltip content={<Tip />} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} />
              <Line type="monotone" dataKey="accounts" name="Accounts" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
              <Line type="monotone" dataKey="companies" name="Companies" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <TableView columns={['Date', 'Accounts', 'Companies']} rows={data.signups.map((d) => [fmtDate(d.date), d.accounts, d.companies])} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Documents created per day</h2>
          </div>
          <div className="card-body chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.documents} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--muted-soft)" />
                <XAxis dataKey="date" tickFormatter={fmtDay} interval={tickEvery} {...AXIS} />
                <YAxis allowDecimals={false} axisLine={false} {...AXIS} />
                <Tooltip content={<Tip />} cursor={{ fill: 'var(--chip)' }} />
                <Bar dataKey="count" name="Documents" fill="var(--series-1)" isAnimationActive={false} maxBarSize={24} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableView columns={['Date', 'Documents']} rows={data.documents.map((d) => [fmtDate(d.date), d.count])} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Companies by plan</h2>
            <span className="muted">All time</span>
          </div>
          <div className="card-body chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.plans} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--muted-soft)" />
                <XAxis type="number" allowDecimals={false} {...AXIS} />
                <YAxis type="category" dataKey="plan" width={72} tickFormatter={(p: string) => PLAN_LABELS[p] ?? p} axisLine={false} {...AXIS} />
                <Tooltip content={<Tip />} cursor={{ fill: 'var(--chip)' }} />
                <Bar
                  dataKey="companies"
                  name="Companies"
                  fill="var(--series-1)"
                  maxBarSize={24}
                  radius={[0, 4, 4, 0]}
                >
                  <LabelList dataKey="companies" position="right" fill="var(--text)" fontSize={12} formatter={(v: unknown) => fmtInt(Number(v))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableView columns={['Plan', 'Companies']} rows={data.plans.map((p) => [PLAN_LABELS[p.plan], p.companies])} />
        </section>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [today] = useState(() => new Date());
  const to = isoDay(today);
  const from = isoDay(new Date(today.getTime() - (days - 1) * 86_400_000));
  const query = useQuery({
    queryKey: ['overview', from, to],
    queryFn: async () => need(await api.GET('/admin/metrics/overview', { params: { query: { from, to } } })),
  });
  return (
    <div>
      <PageHeader
        title="Overview"
        sub={`${fmtDate(from)} – ${fmtDate(to)} (UTC)`}
        actions={
          <div className="row" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r.days} type="button" className={`btn small ${r.days === days ? 'primary' : ''}`} aria-pressed={r.days === days} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <QueryState isPending={query.isPending} error={query.error}>
        {() => <Charts data={query.data!} />}
      </QueryState>
    </div>
  );
}
