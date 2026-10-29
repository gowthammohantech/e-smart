import { footer } from '@/content/site';

import { IconTile } from './ui/IconTile';

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface-footer">
      <div className="container-site py-12">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
          <ul className="flex gap-2 lg:w-1/3">
            {footer.socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  className="grid h-7 min-w-7 place-items-center rounded-md border border-line px-2 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <img src="/brand/elixir-books.png" alt="Elixir Books" width={784} height={378} className="h-14 w-auto dark:hidden" />
          <img src="/brand/elixir-books-dark.png" alt="Elixir Books" width={784} height={378} className="hidden h-14 w-auto dark:block" />
          <ul className="flex flex-wrap justify-center gap-2 lg:w-1/3 lg:justify-end" aria-label="Payment methods">
            {footer.payments.map((p) => (
              <li key={p} className="rounded-md border border-line bg-bg px-2.5 py-1 text-[11px] font-semibold text-muted">
                {p}
              </li>
            ))}
          </ul>
        </div>
        <hr className="my-10 border-line" />
        <ul className="grid gap-8 text-center sm:grid-cols-3">
          {footer.contacts.map((c) => (
            <li key={c.title} className="flex flex-col items-center">
              <IconTile name={c.icon} />
              <p className="mt-3 font-medium text-fg">{c.title}</p>
              {c.lines.map((line) => (
                <p key={line} className="text-sm text-muted">
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <hr className="my-10 border-line" />
        <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted sm:flex-row">
          <p>{footer.copyright}</p>
          <p className="flex gap-3">
            {footer.legal.map((l, i) => (
              <span key={l.label} className="flex gap-3">
                {i > 0 ? <span aria-hidden>|</span> : null}
                <a href={l.href} className="hover:text-fg">
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
