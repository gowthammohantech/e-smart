import { marquee } from '@/content/site';

import { Sunburst } from './ui/Sparkle';

function Row() {
  return (
    <div className="flex shrink-0 items-center gap-10 pr-10">
      {marquee.words.map((word) => (
        <span key={word} className="flex items-center gap-10">
          <span className="text-stroke font-display text-5xl font-medium whitespace-nowrap lg:text-[72px]">{word}</span>
          <Sunburst className="animate-spin-slow size-8 text-primary lg:size-11" />
        </span>
      ))}
    </div>
  );
}

export function MarqueePanel() {
  return (
    <section className="container-site relative z-10 mt-4 lg:mt-0" aria-label="What Elixir Books Smart covers">
      <div className="card-glass relative overflow-hidden rounded-media pt-10 pb-10 lg:pt-[230px]">
        <div className="mask-fade-x overflow-hidden" aria-hidden>
          <div className="animate-marquee flex w-max">
            <Row />
            <Row />
          </div>
        </div>
        <p className="mt-10 px-4 text-center text-fg">{marquee.usedBy.label}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4">
          <span className="text-xs tracking-wider text-dim uppercase">{marquee.worksWithLabel}</span>
          {marquee.worksWith.map((name) => (
            <span key={name} className="font-display text-lg font-medium tracking-tight text-muted/70">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
