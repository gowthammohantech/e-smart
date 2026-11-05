import type { LegalDoc } from '@/content/legal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BrandMark } from '@/components/ui/BrandMark';

/** The privacy, terms, refund, deletion and support pages: plain reading pages in the cookbook's quiet shell. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[72px] max-w-[820px] items-center justify-between px-4 sm:px-6">
          <a href="/" aria-label="Elixir Books Smart, home">
            <BrandMark />
          </a>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-fg/80 hover:text-primary">
              Back to site
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[820px] px-4 pb-24 pt-10 sm:px-6">
        {doc.draft ? (
          <p role="note" className="mb-8 rounded-lg border border-line px-4 py-3 text-sm text-fg/80">
            <strong>Draft, under legal review.</strong> This page describes how the service works today and will be finalised before launch.
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-fg/60">Last updated {doc.updated}</p>
        {doc.intro ? <p className="mt-6 leading-7 text-fg/85">{doc.intro}</p> : null}
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-xl font-semibold">{s.heading}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mt-3 leading-7 text-fg/85">
                {p}
              </p>
            ))}
            {s.list ? (
              <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-fg/85">
                {s.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </main>
    </div>
  );
}
