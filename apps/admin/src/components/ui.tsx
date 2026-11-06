import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../lib/api';
import { Art, type ArtName } from './Art';

export function PageHeader({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { to: string; label: string }[]; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {crumbs?.length ? (
          <div className="crumbs muted">
            {crumbs.map((c, i) => (
              <span key={c.to}>
                <Link to={c.to}>{c.label}</Link>
                {i < crumbs.length - 1 ? ' / ' : ''}
              </span>
            ))}
          </div>
        ) : null}
        <h1>{title}</h1>
        {sub ? <p className="muted">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

/** Loading and error states for a query; renders children once data is in. */
export function QueryState({ isPending, error, children }: { isPending: boolean; error: unknown; children: () => ReactNode }) {
  if (error)
    return (
      <div className="state">
        <Art name="error" height={120} />
        <div className="alert bad">{errorMessage(error)}</div>
      </div>
    );
  if (isPending) return <Skeleton />;
  return <>{children()}</>;
}

/** Shimmering placeholder rows while something loads. */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

/** An illustrated "nothing here" for a table or list. */
export function EmptyState({ art = 'empty', title, children }: { art?: ArtName; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="state">
      <Art name={art} height={110} />
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** A search box that reports its value after typing pauses. */
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  // Follow outside changes (back/forward, a cleared filter) without an effect.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return <input className="input search" type="search" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />;
}

export function Pager({ page, hasPrev, nextCursor, onPrev, onNext }: { page: number; hasPrev: boolean; nextCursor: string | null | undefined; onPrev: () => void; onNext: (c: string) => void }) {
  if (!hasPrev && !nextCursor) return null;
  return (
    <div className="pager">
      <span className="muted">Page {page}</span>
      <div className="row">
        <button className="btn small" type="button" disabled={!hasPrev} onClick={onPrev}>
          Previous
        </button>
        <button className="btn small" type="button" disabled={!nextCursor} onClick={() => nextCursor && onNext(nextCursor)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** The link inside a clickable table row; it handles its own click so the row doesn't navigate twice. */
export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}
