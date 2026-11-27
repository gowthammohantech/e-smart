import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { errorMessage, serverUrl } from '../lib/api';
import { ENTITIES, type Parsed, type SendResult } from '../lib/entities';
import { defaultOptions } from '../lib/options';
import { activeOf, parsePlans, runPlans } from '../lib/run';
import type { Business, PlanResult, SheetPlan } from '../types';

const entityOf = (id: SheetPlan['entity']) => ENTITIES.find((e) => e.id === id);

type Problem = { line: number; message: string; kind: 'fix' | 'duplicate' | 'invalid' };

/**
 * Problems with a sheet's rows: the ones we found reading it, then the ones the server found checking
 * it. With `expand`, a document made of several rows lists each of them (for the file of rows to fix).
 */
export function problemsOf(parsed: Parsed, sent?: SendResult, expand = false): Problem[] {
  const out: Problem[] = parsed.errors.map((e) => ({ ...e, kind: 'fix' as const }));
  for (const r of sent?.results ?? []) {
    const record = parsed.records[r.index];
    if (!record) continue;
    if (r.status === 'created') continue;
    const message = r.status === 'duplicate' ? r.message || 'Already in your business, so it is skipped.' : r.message || 'The server could not accept this row.';
    const kind = r.status === 'duplicate' ? 'duplicate' : 'invalid';
    for (const line of expand ? (record.rows ?? [record.line]) : [record.line]) out.push({ line, kind, message });
  }
  return out.sort((a, b) => a.line - b.line);
}

export function ReviewScreen({
  business,
  plans,
  setPlans,
  onBack,
  onDone,
}: {
  business: Business;
  plans: SheetPlan[];
  setPlans: (plans: SheetPlan[]) => void;
  onBack: () => void;
  onDone: (results: PlanResult[]) => void;
}) {
  const [checked, setChecked] = useState<Record<string, SendResult>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const parsed = useMemo(() => parsePlans(plans, business), [plans, business]);
  const active = useMemo(() => activeOf(plans, parsed), [plans, parsed]);
  const sendable = active.filter((a) => a.parsed.records.length > 0);
  const isChecked = sendable.length > 0 && sendable.every((a) => checked[a.plan.id]);
  const willCreate = sendable.reduce((n, a) => n + (checked[a.plan.id]?.created ?? 0), 0);

  const change = (id: string, patch: Partial<SheetPlan>) => {
    setPlans(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setChecked({});
    setError('');
  };

  const run = async (dryRun: boolean) => {
    setError('');
    try {
      const { results, answers } = await runPlans({ business, active, dryRun, onStep: setBusy });
      if (dryRun) setChecked(answers);
      else onDone(results);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="stack">
      <div className="hero" style={{ marginBottom: 0 }}>
        <h1>Review before importing</h1>
        <p className="lead">Nothing is imported yet. Check that each sheet is read the way you expect. Rows with a problem are left out and listed so you can fix them. Then we check everything with the server before you confirm.</p>
      </div>

      {plans.some((p) => p.demo) && (
        <div className="notice warn">
          <Icon name="alert" size={18} />
          <span>
            <strong>Sample data.</strong> These are made-up records. Importing adds them to <strong>{business.name}</strong> on <strong>{serverUrl()}</strong>, so use a test business, or delete them afterwards (they are tagged “Demo”).
          </span>
        </div>
      )}

      {plans.map((plan) => {
        const entity = entityOf(plan.entity);
        const p = parsed[plans.indexOf(plan)];
        const sent = checked[plan.id];
        const problems = p ? problemsOf(p, sent) : [];
        const header = plan.sheet.rows[0] ?? [];
        const missing = entity ? entity.fields.filter((f) => f.required && plan.mapping[f.key] === undefined) : [];
        return (
          <section key={plan.id} className="card stack">
            <div className="card-head">
              <div>
                <h2>{plan.sheet.name}</h2>
                <span className="muted small">
                  {plan.fileName} · {Math.max(0, plan.sheet.rows.length - 1)} rows
                </span>
              </div>
              <label className="field" style={{ minWidth: 240 }}>
                This sheet has
                <select
                  value={plan.entity}
                  onChange={(e) => {
                    const id = e.target.value as SheetPlan['entity'];
                    const next = entityOf(id);
                    change(plan.id, { entity: id, mapping: next ? next.guess(header) : {}, options: defaultOptions(next, business.ctx) });
                  }}
                >
                  {ENTITIES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                  <option value="skip">Skip this sheet</option>
                </select>
              </label>
            </div>

            {!entity && (
              <div className="notice info">
                <Icon name="info" size={18} />
                <span>This sheet is skipped. Choose what it holds above if you want to bring it in.</span>
              </div>
            )}

            {entity && p && (
              <>
                <div className="stats">
                  <span className="stat" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
                    {p.records.length} ready
                  </span>
                  {p.errors.length > 0 && (
                    <span className="stat" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                      {p.errors.length} {p.errors.length === 1 ? 'row needs' : 'rows need'} fixing
                    </span>
                  )}
                  {sent && (
                    <>
                      <span className="stat" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                        {sent.created} will be created
                      </span>
                      {sent.skipped > 0 && (
                        <span className="stat" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                          {sent.skipped} already exist
                        </span>
                      )}
                      {sent.invalid > 0 && (
                        <span className="stat" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
                          {sent.invalid} rejected
                        </span>
                      )}
                    </>
                  )}
                </div>

                {entity.planNeeds?.(p.records.map((r) => r.value), business.ctx) && (
                  <div className="notice warn">
                    <Icon name="alert" size={18} />
                    <span>{entity.planNeeds(p.records.map((r) => r.value), business.ctx)}</span>
                  </div>
                )}

                {missing.length > 0 && (
                  <div className="notice bad">
                    <Icon name="alert" size={18} />
                    <span>We couldn’t find a column for: {missing.map((f) => f.label).join(', ')}. Choose {missing.length === 1 ? 'it' : 'them'} under “Match columns” below.</span>
                  </div>
                )}
                {sent?.warnings.map((w) => (
                  <div key={w} className="notice warn">
                    <Icon name="alert" size={18} />
                    <span>{w}</span>
                  </div>
                ))}

                {entity.options?.map((o) => (
                  <div key={o.key} className="options">
                    <strong style={{ fontSize: 13.5 }}>{o.label}</strong>
                    {o.type === 'date' ? (
                      <input
                        type="date"
                        value={plan.options[o.key] ?? ''}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => change(plan.id, { options: { ...plan.options, [o.key]: e.target.value } })}
                        style={{ maxWidth: 220 }}
                        aria-label={o.label}
                      />
                    ) : (
                      <div className="seg" role="group" aria-label={o.label}>
                        {(o.choices ?? []).map((c) => (
                          <button key={c.value} type="button" aria-pressed={plan.options[o.key] === c.value} onClick={() => change(plan.id, { options: { ...plan.options, [o.key]: c.value } })}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="muted small">{o.hint}</span>
                  </div>
                ))}

                <details open={missing.length > 0}>
                  <summary>Match columns</summary>
                  <div className="map">
                    {entity.fields.map((f) => (
                      <FieldRow key={f.key} label={f.label} required={f.required} header={header} value={plan.mapping[f.key]} onChange={(v) => change(plan.id, { mapping: { ...plan.mapping, [f.key]: v } })} />
                    ))}
                  </div>
                </details>

                {p.records.length > 0 && (
                  <details>
                    <summary>
                      Preview ({Math.min(6, p.records.length)} of {p.records.length})
                    </summary>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Row</th>
                            {entity.preview.map((c) => (
                              <th key={c.label}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {p.records.slice(0, 6).map((r) => (
                            <tr key={r.line}>
                              <td>{r.line}</td>
                              {entity.preview.map((c) => (
                                <td key={c.label}>{c.value(r.value as never)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {problems.length > 0 && (
                  <details open>
                    <summary>Rows to look at ({problems.length})</summary>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Row</th>
                            <th>What to fix</th>
                          </tr>
                        </thead>
                        <tbody>
                          {problems.slice(0, 100).map((x, i) => (
                            <tr key={`${x.line}-${i}`}>
                              <td>{x.line}</td>
                              <td>
                                <span className={`badge ${x.kind === 'invalid' ? 'bad' : 'warn'}`}>{x.kind === 'duplicate' ? 'Exists' : x.kind === 'invalid' ? 'Rejected' : 'Fix'}</span> {x.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {problems.length > 100 && <p className="muted small">Showing the first 100. The full list is in the file you can download after the import.</p>}
                  </details>
                )}
              </>
            )}
          </section>
        );
      })}

      {error && (
        <div className="notice bad" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="sticky-actions">
        <button className="btn" onClick={onBack} disabled={!!busy}>
          <Icon name="back" size={16} /> Choose another file
        </button>
        {!isChecked ? (
          <button className="btn primary big" disabled={!sendable.length || !!busy} onClick={() => void run(true)}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}
            {busy || 'Check with the server'}
          </button>
        ) : (
          <>
            <button className="btn primary big" disabled={!!busy || willCreate === 0} onClick={() => void run(false)}>
              {busy ? <span className="spinner" /> : <Icon name="upload" size={18} />}
              {busy || (willCreate === 0 ? 'Nothing new to import' : `Import ${plans.some((p) => p.demo) ? 'sample ' : ''}${willCreate} ${willCreate === 1 ? 'record' : 'records'} into ${business.name}`)}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => setChecked({})}>
              Check again
            </button>
          </>
        )}
        {!sendable.length && <span className="muted small">There is nothing ready to import yet.</span>}
      </div>
    </div>
  );
}

function FieldRow({ label, required, header, value, onChange }: { label: string; required?: boolean; header: string[]; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <>
      <label>
        {label}
        {required && <span style={{ color: 'var(--bad)' }}> *</span>}
      </label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">{required ? 'Choose a column…' : 'Not in my file'}</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </>
  );
}
