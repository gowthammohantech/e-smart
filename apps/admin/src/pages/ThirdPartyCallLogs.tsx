import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader, Pager, QueryState, EmptyState, SearchInput, TableSkeleton, RefreshBar, StatsSkeleton } from '../components/ui';
import { api, need, type Schema } from '../lib/api';
import { fmtDateTime, fmtInt, fmtMs, GSP_ENV_LABELS, gspTargetLabel, serviceLabel } from '../lib/format';
import { useCursorPager } from '../lib/useCursorPager';

type Call = Schema<'OutboundCall'>;
type Outcome = Call['outcome'];
type OutcomeFilter = Outcome | 'failed';

const OUTCOMES: Record<Outcome, [tone: string, label: string]> = {
  ok: ['good', 'OK'],
  http_error: ['bad', 'HTTP error'],
  envelope_error: ['warn', 'Refused'],
  timeout: ['warn', 'Timed out'],
  network_error: ['bad', 'No answer'],
};

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const [tone, label] = OUTCOMES[outcome];
  return <span className={`badge ${tone}`}>{label}</span>;
}

function EnvBadge({ environment }: { environment?: Call['environment'] }) {
  if (!environment) return null;
  return <span className={`badge plain ${environment === 'production' ? 'warn' : 'info'}`}>{GSP_ENV_LABELS[environment]}</span>;
}

/** The status as the third party sent it, or why there is none. */
const statusText = (c: Call) => (c.status ? String(c.status) : c.outcome === 'timeout' ? 'timeout' : '—');

const HOURS = [
  { value: 1, label: 'Last hour' },
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
];

const dayAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString().slice(0, 10);

/**
 * Every call the API made to a third party. The tiles say where calls went in the period (so switching a
 * company between gateways is visible at once); the table says exactly which call it was.
 */
export function ThirdPartyCallLogs() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') || undefined;
  const environment = (params.get('environment') || undefined) as Call['environment'];
  const outcome = (params.get('outcome') || undefined) as OutcomeFilter | undefined;
  const q = params.get('q') ?? '';
  const companyId = params.get('companyId') || undefined;
  const userId = params.get('userId') || undefined;
  const requestId = params.get('requestId') || undefined;
  const hours = Number(params.get('hours')) || 24;
  const [live, setLive] = useState(false);

  const pager = useCursorPager();
  const { reset } = pager;
  useEffect(reset, [service, environment, outcome, q, companyId, userId, requestId, hours, reset]);

  const setParam = useCallback(
    (key: string, value: string) =>
      setParams(
        (p) => {
          if (value) p.set(key, value);
          else p.delete(key);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  /** Pick a service and environment together (the tiles), or clear both. */
  const pick = (s?: string, e?: string) =>
    setParams(
      (p) => {
        if (s) p.set('service', s);
        else p.delete('service');
        if (e) p.set('environment', e);
        else p.delete('environment');
        return p;
      },
      { replace: true },
    );

  const summary = useQuery({
    queryKey: ['outbound-summary', hours],
    queryFn: async () => need(await api.GET('/admin/outbound-calls/summary', { params: { query: { hours } } })),
    refetchInterval: live ? 10_000 : false,
  });
  const from = dayAgo(hours);
  const query = useQuery({
    queryKey: ['outbound-calls', { service, environment, outcome, q, companyId, userId, requestId, from, cursor: pager.cursor }],
    queryFn: async () =>
      need(await api.GET('/admin/outbound-calls', { params: { query: { service, environment, outcome, q: q || undefined, companyId, userId, requestId, from, cursor: pager.cursor, limit: 25 } } })),
    placeholderData: keepPreviousData,
    refetchInterval: live && !pager.hasPrev ? 10_000 : false,
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const scoped = [
    companyId && { key: 'companyId', label: `Company ${companyId}` },
    userId && { key: 'userId', label: `User ${userId}` },
    requestId && { key: 'requestId', label: `Request ${requestId}` },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div>
      <PageHeader
        title="Third-Party Call Logs"
        sub="Every call this API makes to a third party: what set it off, who it was for, which of their endpoints it went to, and what came back."
        actions={
          <>
            <select className="select" aria-label="Period" value={hours} onChange={(e) => setParam('hours', e.target.value === '24' ? '' : e.target.value)}>
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
            <label className="row muted" title="Refresh every 10 seconds">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live
            </label>
          </>
        }
      />

      <QueryState isPending={summary.isPending} error={summary.error} fallback={<StatsSkeleton count={4} />}>
        {() => {
          const data = summary.data!;
          return (
            <>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                A company with no gateway of its own files through <strong>{gspTargetLabel(data.gspDefault)}</strong>.{' '}
                {data.recording === 'off'
                  ? 'Recording is switched off (OUTBOUND_LOG=off), so nothing below is new.'
                  : data.recording === 'all'
                    ? 'Full requests and answers are kept for every call (OUTBOUND_LOG=all).'
                    : 'Full requests and answers are kept for failures and sandbox calls; other successes keep only what was called and how it went.'}{' '}
                Calls are kept {data.retentionDays} days.
              </p>
              {data.targets.length === 0 ? (
                <EmptyState title="No third-party calls in this period">Calls appear here as soon as the API makes one.</EmptyState>
              ) : (
                <div className="stats" style={{ marginBottom: 16 }}>
                  {data.targets.map((t) => {
                    const active = service === t.service && environment === t.environment;
                    return (
                      <button
                        key={`${t.service}:${t.environment ?? ''}`}
                        type="button"
                        className="card stat"
                        style={{ textAlign: 'left', cursor: 'pointer', outline: active ? '2px solid currentColor' : undefined }}
                        aria-pressed={active}
                        onClick={() => (active ? pick() : pick(t.service, t.environment))}
                      >
                        <div className="label">
                          {serviceLabel(t.service)} <EnvBadge environment={t.environment} />
                        </div>
                        <div className="value num">{fmtInt(t.calls)}</div>
                        <div className="hint">
                          {t.failures > 0 ? <strong>{fmtInt(t.failures)} failed</strong> : 'no failures'} · avg {fmtMs(t.avgMs)} · p95 {fmtMs(t.p95Ms)}
                        </div>
                        <div className="hint">last {fmtDateTime(t.lastCallAt)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          );
        }}
      </QueryState>

      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search operation, endpoint, route or error" />
          <select className="select" aria-label="Outcome" value={outcome ?? ''} onChange={(e) => setParam('outcome', e.target.value)}>
            <option value="">All outcomes</option>
            <option value="failed">Any failure</option>
            <option value="ok">OK</option>
            <option value="http_error">HTTP error</option>
            <option value="envelope_error">Refused (a 200 carrying an error)</option>
            <option value="timeout">Timed out</option>
            <option value="network_error">No answer</option>
          </select>
          {service || environment ? (
            <button className="btn small ghost" type="button" onClick={() => pick()}>
              {[service && serviceLabel(service), environment && GSP_ENV_LABELS[environment]].filter(Boolean).join(' · ')} ✕
            </button>
          ) : null}
          {scoped.map((s) => (
            <button key={s.key} className="btn small ghost" type="button" onClick={() => setParam(s.key, '')}>
              {s.label} ✕
            </button>
          ))}
        </div>
        <RefreshBar active={query.isFetching && query.isPlaceholderData} />
        <QueryState
          isPending={query.isPending}
          error={query.error}
          fallback={<TableSkeleton headers={[{ label: 'When' }, { label: 'Third party' }, { label: 'Operation' }, { label: 'Set off by' }, { label: 'Result' }]} />}
        >
          {() =>
            query.data!.data!.length === 0 ? (
              <EmptyState art="search-empty" title="No calls match">
                Widen the period or clear a filter.
              </EmptyState>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Third party</th>
                        <th>Operation</th>
                        <th>Set off by</th>
                        <th>Result</th>
                        <th className="right">Time</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {query.data!.data!.map((c) => (
                        <Fragment key={c.id}>
                          <tr className="link" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                            <td className="num" style={{ whiteSpace: 'nowrap' }}>
                              {fmtDateTime(c.createdAt)}
                            </td>
                            <td>
                              {serviceLabel(c.service)} <EnvBadge environment={c.environment} />
                              <div className="cell-sub mono">{c.host}</div>
                            </td>
                            <td style={{ maxWidth: 320 }}>
                              {c.operation}
                              <div className="cell-sub mono">
                                {c.method} {c.path}
                              </div>
                            </td>
                            <td style={{ maxWidth: 300 }}>
                              {c.source === 'job' ? <>Background job · {c.jobKind}</> : (c.userName ?? c.userEmail ?? (c.source === 'request' ? 'Not signed in' : 'System'))}
                              <div className="cell-sub">{c.companyName ?? ''}</div>
                              {c.route ? <div className="cell-sub mono">{c.route}</div> : null}
                            </td>
                            <td>
                              <OutcomeBadge outcome={c.outcome} /> <span className="mono">{statusText(c)}</span>
                              {c.error ? (
                                <div className="cell-sub" style={{ maxWidth: 280 }}>
                                  {c.error}
                                </div>
                              ) : null}
                            </td>
                            <td className="right num">{fmtMs(c.durationMs)}</td>
                            <td className="right">
                              <button
                                className="btn small ghost"
                                type="button"
                                aria-expanded={openId === c.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenId(openId === c.id ? null : c.id);
                                }}
                              >
                                {openId === c.id ? 'Hide' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {openId === c.id ? (
                            <tr>
                              <td colSpan={7}>
                                <CallDetail id={c.id} onFilter={setParam} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={pager.page} hasPrev={pager.hasPrev} nextCursor={query.data!.nextCursor} onPrev={pager.prev} onNext={pager.next} />
              </>
            )
          }
        </QueryState>
      </section>
    </div>
  );
}

function pretty(text: string | undefined) {
  if (!text) return undefined;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The call as a shell command. Secrets were redacted when it was recorded, so they show as placeholders. */
export function toCurl(c: Pick<Schema<'OutboundCallDetail'>, 'method' | 'url' | 'requestHeaders' | 'requestBody'>): string {
  const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  let headers: Record<string, string> = {};
  try {
    headers = c.requestHeaders ? (JSON.parse(c.requestHeaders) as Record<string, string>) : {};
  } catch {
    // Unreadable headers: the command goes without them.
  }
  return [`curl -X ${c.method} ${quote(c.url)}`, ...Object.entries(headers).map(([k, v]) => `  -H ${quote(`${k}: ${v}`)}`), ...(c.requestBody ? [`  --data ${quote(c.requestBody)}`] : [])].join(' \\\n');
}

function Block({ title, text }: { title: string; text: string | undefined }) {
  return (
    <div>
      <div className="cell-sub">{title}</div>
      <pre
        style={{ margin: 0, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--card2)', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}
      >
        {text ?? '— not kept'}
      </pre>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn small"
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

function CallDetail({ id, onFilter }: { id: string; onFilter: (key: string, value: string) => void }) {
  const query = useQuery({
    queryKey: ['outbound-call', id],
    queryFn: async () => need(await api.GET('/admin/outbound-calls/{callId}', { params: { path: { callId: id } } })),
  });
  return (
    <QueryState isPending={query.isPending} error={query.error}>
      {() => {
        const c = query.data!;
        return (
          <div className="stack" style={{ padding: '4px 0 8px' }}>
            {c.gsp && !c.gsp.matches ? (
              <div className="alert bad">
                This company is set to file through <strong>{gspTargetLabel(c.gsp.configured ?? c.gsp.default)}</strong>
                {c.gsp.configured ? '' : ' (the deployment default)'}, but this call went to <strong>{gspTargetLabel(c.gsp.went)}</strong>. It may have been made before the setting was changed.
              </div>
            ) : c.gsp ? (
              <div className="muted">
                Went to <strong>{gspTargetLabel(c.gsp.went)}</strong>, which is where this company is set to file{c.gsp.configured ? '' : ' (the deployment default)'}.
              </div>
            ) : null}
            <div className="mono" style={{ overflowWrap: 'anywhere' }}>
              {c.method} {c.url}
            </div>
            <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center' }}>
              <span>Took {fmtMs(c.durationMs)}</span>
              {c.requestBytes !== undefined ? <span>Sent {fmtInt(c.requestBytes)} bytes</span> : null}
              {c.responseBytes !== undefined ? <span>Received {fmtInt(c.responseBytes)} bytes</span> : null}
              {c.truncated ? <span>Bodies cut to the size limit</span> : null}
              {c.requestId ? (
                <span>
                  Request <span className="mono">{c.requestId}</span>
                </span>
              ) : null}
              {c.companyId ? <Link to={`/companies/${c.companyId}`}>{c.companyName ?? c.companyId}</Link> : null}
              {c.userId ? (
                <button className="btn small ghost" type="button" onClick={() => onFilter('userId', c.userId!)}>
                  All calls for {c.userName ?? c.userId}
                </button>
              ) : null}
              {c.requestId ? (
                <button className="btn small ghost" type="button" onClick={() => onFilter('requestId', c.requestId!)}>
                  All calls in this request
                </button>
              ) : null}
            </div>
            {c.error ? <div className="alert bad">{c.error}</div> : null}
            <div className="diff">
              <Block title="Request headers (secrets redacted)" text={pretty(c.requestHeaders)} />
              <Block title="Response headers (kept for failures)" text={pretty(c.responseHeaders)} />
              <Block title="Request body" text={pretty(c.requestBody)} />
              <Block title="Response body" text={pretty(c.responseBody)} />
            </div>
            <div className="row">
              <CopyButton text={toCurl(c)} label="Copy as cURL" />
              <CopyButton text={JSON.stringify(c, null, 2)} label="Copy as JSON" />
            </div>
            {c.related.length > 0 ? (
              <div>
                <div className="cell-sub">Other calls in the same request</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {c.related.map((r) => (
                    <li key={r.id}>
                      {serviceLabel(r.service)} · {r.operation} · <OutcomeBadge outcome={r.outcome} /> <span className="mono">{statusText(r)}</span> · {fmtMs(r.durationMs)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      }}
    </QueryState>
  );
}
