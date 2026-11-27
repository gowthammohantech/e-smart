import { useState } from 'react';
import { Icon } from '../components/Icon';
import { ENTITIES } from '../lib/entities';
import { buildProblemsFile } from '../lib/sheets';
import { saveFile } from '../lib/save';
import type { Business, PlanResult } from '../types';
import { problemsOf } from './ReviewScreen';

export function DoneScreen({ business, results, onAnother }: { business: Business; results: PlanResult[]; onAnother: () => void }) {
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const created = results.reduce((n, r) => n + r.sent.created, 0);
  const rows = results.map((r) => ({ r, problems: problemsOf(r.parsed, r.sent) }));
  const skipped = rows.reduce((n, x) => n + x.problems.length, 0);

  const download = async () => {
    setError('');
    setSaved('');
    try {
      const sheets = results
        .map((r) => ({ r, problems: problemsOf(r.parsed, r.sent, true) }))
        .filter((x) => x.problems.length)
        .map(({ r, problems }) => {
          const header = r.plan.sheet.rows[0] ?? [];
          return {
            name: `${r.plan.sheet.name} - to fix`,
            header: [...header, 'Problem'],
            rows: problems.map((p) => [...(r.plan.sheet.rows[p.line - 1] ?? []), p.message]),
          };
        });
      const out = await saveFile('Rows-to-fix.xlsx', await buildProblemsFile(sheets));
      if (out.path) setSaved(out.path);
    } catch (err) {
      setError(`The file could not be saved. ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="stack">
      <div className="hero" style={{ marginBottom: 0 }}>
        <h1>{created > 0 ? 'Your data is in' : 'Nothing new was imported'}</h1>
        <p className="lead">
          {created > 0 ? (
            <>
              We added <strong>{created}</strong> {created === 1 ? 'record' : 'records'} to <strong>{business.name}</strong>. Open Elixir Books Smart to see them.
            </>
          ) : (
            <>Every row was already in {business.name} or needs fixing. See below.</>
          )}
        </p>
      </div>

      <div className="grid">
        {rows.map(({ r, problems }) => {
          const entity = ENTITIES.find((e) => e.id === r.plan.entity);
          return (
            <div key={r.plan.id} className="card stack tight">
              <h2>{entity?.title}</h2>
              <span className="muted small">From “{r.plan.sheet.name}”</span>
              <div className="stats">
                <span className="stat" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
                  {r.sent.created} added
                </span>
                {problems.length > 0 && (
                  <span className="stat" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                    {problems.length} left out
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {skipped > 0 && (
        <div className="notice warn">
          <Icon name="alert" size={18} />
          <span>
            {skipped} {skipped === 1 ? 'row was' : 'rows were'} left out. Download them with the reason beside each, fix them, and import that file again. What is already in is skipped, so nothing is doubled.
          </span>
        </div>
      )}
      {saved && (
        <div className="notice good" role="status">
          <Icon name="check" size={18} />
          <span>
            Saved to <strong>{saved}</strong>.
          </span>
        </div>
      )}
      {error && (
        <div className="notice bad" role="alert">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="row">
        {skipped > 0 && (
          <button className="btn primary big" onClick={() => void download()}>
            <Icon name="download" size={18} /> Download rows to fix
          </button>
        )}
        <button className={skipped > 0 ? 'btn big' : 'btn primary big'} onClick={onAnother}>
          Import another file
        </button>
      </div>
    </div>
  );
}
