import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../lib/api';
import { Art, type ArtName } from './Art';

const APP_TITLE = 'Elixir Books Admin';

/** Names the browser tab after the page, so history and tabs tell routes apart. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${APP_TITLE}`;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}

export function PageHeader({
  title,
  sub,
  crumbs,
  actions,
  docTitle,
}: {
  title: ReactNode;
  sub?: ReactNode;
  crumbs?: { to: string; label: string }[];
  actions?: ReactNode;
  /** The tab title; defaults to `title` when that is plain text. */
  docTitle?: string;
}) {
  useDocumentTitle(docTitle ?? (typeof title === 'string' ? title : undefined));
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

/**
 * Loading and error states for a query; renders children once data is in. `fallback` is the
 * shape of what's coming (a table, tiles, a record); without one, a few shimmering lines.
 */
export function QueryState({
  isPending,
  error,
  children,
  fallback,
  header,
}: {
  isPending: boolean;
  error: unknown;
  children: () => ReactNode;
  fallback?: ReactNode;
  /** Shown above the error so a failed record page still has its title and way back. */
  header?: ReactNode;
}) {
  if (error)
    return (
      <div className="stack">
        {header}
        <div className="state">
          <Art name="error" height={120} />
          <div className="alert bad">{errorMessage(error)}</div>
        </div>
      </div>
    );
  if (isPending) return <>{fallback ?? <Skeleton />}</>;
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

/** One shimmering bar. Hidden from assistive tech; the region around it announces the wait. */
export function Bar({ width, height, className = '' }: { width?: number | string; height?: number; className?: string }) {
  return <i className={`sk ${className}`} aria-hidden style={{ width, height }} />;
}

/** Shown over rows kept from the last page while the next one loads. */
export function RefreshBar({ active }: { active: boolean }) {
  return active ? <div className="refresh-bar" role="status" aria-label="Updating" /> : null;
}

/** Widths vary row to row so a stack of placeholders reads as text, not a grid. */
const cellWidth = (row: number, col: number) => `${50 + ((row * 7 + col * 13) % 40)}%`;

/** A table's rows while its page loads: the real headers, shimmering cells under them. */
export function TableSkeleton({ headers, rows = 8 }: { headers: { label?: string; right?: boolean }[]; rows?: number }) {
  return (
    <div className="table-wrap" role="status" aria-label="Loading" aria-busy>
      <table className="data">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={h.right ? 'right' : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {headers.map((h, c) => (
                <td key={c} className={h.right ? 'right' : undefined}>
                  {h.label === undefined ? null : <Bar width={h.right ? 48 : cellWidth(r, c)} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stat tiles while the figures load: label, figure, hint at the tiles' own size. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stats" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card stat">
          <Bar width="55%" height={11} />
          <Bar width="45%" height={26} className="sk-gap" />
          <Bar width="70%" height={10} className="sk-gap" />
        </div>
      ))}
    </div>
  );
}

/** A chart card while its series loads: the head, then the plot's area. */
export function ChartSkeleton() {
  return (
    <section className="card" aria-hidden>
      <div className="card-head">
        <Bar width={160} height={13} />
      </div>
      <div className="card-body chart">
        <i className="sk sk-block" />
      </div>
    </section>
  );
}

/** A record page while it loads: breadcrumbs stay; the title, facts and tables shimmer. */
export function DetailSkeleton({ crumbs, tables = 2 }: { crumbs?: { to: string; label: string }[]; tables?: number }) {
  return (
    <div className="stack" role="status" aria-label="Loading" aria-busy>
      <PageHeader crumbs={crumbs} title={<Bar width={260} height={24} />} sub={<Bar width={200} height={12} />} />
      <section className="card">
        <div className="card-body">
          <dl className="facts">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <dt>
                  <Bar width={70} height={10} />
                </dt>
                <dd>
                  <Bar width={cellWidth(i, 1)} height={13} className="sk-gap" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      {Array.from({ length: tables }, (_, i) => (
        <section key={i} className="card">
          <div className="card-head">
            <Bar width={140} height={13} />
          </div>
          <TableSkeleton headers={[{ label: '' }, { label: '' }, { label: '' }, { label: '', right: true }]} rows={4} />
        </section>
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
