'use client';

import { ChevronDown } from 'lucide-react';
import { usePathname } from 'next/navigation';

type Part = { dir: string; title: string; pages: { slug: string; title: string }[] };

function Links({ parts, current }: { parts: Part[]; current: string }) {
  const item = (href: string, label: string) => {
    const active = current === href;
    return (
      <a
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`block rounded-md px-2.5 py-1.5 text-[13.5px] leading-snug transition-colors ${
          active ? 'bg-primary-tint font-medium text-primary' : 'text-fg/75 hover:bg-surface-2 hover:text-fg'
        }`}
      >
        {label}
      </a>
    );
  };
  return (
    <nav aria-label="Guide" className="space-y-6">
      {item('/docs', 'Overview')}
      {parts.map((part) => (
        <div key={part.dir}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-dim">{part.title}</p>
          <ul className="space-y-0.5">
            {part.pages.map((p) => (
              <li key={p.slug}>{item(`/docs/${p.slug}`, p.title)}</li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The guide's table of contents: a fixed column on wide screens, a fold-out list on phones. */
export function DocsSidebar({ parts }: { parts: Part[] }) {
  // The static export may serve pages with a trailing slash.
  const current = (usePathname() ?? '/docs').replace(/\/$/, '') || '/docs';
  const here = parts.flatMap((p) => p.pages).find((p) => `/docs/${p.slug}` === current)?.title ?? 'Overview';
  return (
    <>
      <details className="group rounded-card border border-line bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-fg">
          <span>
            <span className="text-muted">Guide · </span>
            {here}
          </span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-2 py-4">
          <Links parts={parts} current={current} />
        </div>
      </details>
      <aside className="sticky top-[88px] hidden max-h-[calc(100vh-104px)] overflow-y-auto pb-10 pr-2 lg:block">
        <Links parts={parts} current={current} />
      </aside>
    </>
  );
}
