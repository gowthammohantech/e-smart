'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';

import { hero } from '@/content/site';
import { useWebGL } from '@/lib/hooks';

import { PhoneFrame } from './mockups/Screens';
import { Reveal } from './ui/Reveal';
import { StoreBadge } from './ui/StoreBadge';

const HeroPhone = dynamic(() => import('./three/HeroPhone'), { ssr: false });

const avatarTints = ['#F0B429', '#34C88A', '#FF6B6B'];
const chipTone = { good: 'bg-good', warn: 'bg-warn', primary: 'bg-primary' } as const;

function Chips() {
  const spots = ['top-[4%] -right-2 lg:-right-8', 'top-[50%] -right-4 lg:-right-16', 'bottom-[24%] -left-2 lg:-left-14'];
  return (
    <>
      {hero.chips.map((chip, i) => (
        <div
          key={chip.title}
          className={`animate-float absolute z-30 hidden rounded-xl border border-line bg-surface/85 px-3 py-2 backdrop-blur-md sm:block ${spots[i]}`}
          style={{ animationDelay: `${i * -2}s` }}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-fg">
            <span className={`size-1.5 rounded-full ${chipTone[chip.tone]}`} />
            {chip.title}
          </div>
          <div className="text-[11px] text-muted">{chip.detail}</div>
        </div>
      ))}
    </>
  );
}

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const webgl = useWebGL();

  return (
    <section ref={section} id="top" className="relative pt-[112px] lg:pt-[132px]">
      <div className="container-site grid items-start gap-10 lg:grid-cols-[1.15fr_1fr_1.15fr] lg:gap-6">
        <Reveal className="text-center lg:pt-10 lg:text-left">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-primary-tint py-1 pr-3 pl-1 text-xs text-fg">
            <span className="flex -space-x-1.5">
              {avatarTints.map((c) => (
                <span key={c} className="size-5 rounded-full border-2 border-bg" style={{ background: c }} />
              ))}
            </span>
            {hero.reviews.label}
          </span>
          <h1 className="mt-6 text-[40px] leading-[1.05] tracking-[-0.03em] text-fg sm:text-5xl lg:text-[58px]">
            {hero.title.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-muted lg:mx-0">{hero.sub}</p>
        </Reveal>

        {/* The phone overhangs the panel below it, so it sits above that panel. */}
        <div className="relative z-20 order-last mx-auto h-[520px] w-full max-w-[340px] lg:order-none lg:-mb-[220px] lg:h-[700px] lg:max-w-none">
          <Chips />
          {webgl ? (
            <HeroPhone anchor={section} />
          ) : (
            <div className="animate-float flex h-full items-start justify-center pt-4">
              <PhoneFrame screen="invoice" width={260} />
            </div>
          )}
        </div>

        <Reveal index={1} className="text-center lg:pt-24 lg:text-left">
          <p className="mx-auto max-w-md text-muted lg:mx-0">{hero.side}</p>
          <p className="mt-8 font-medium text-fg">{hero.downloadLabel}</p>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            {hero.stores.map((s) => (
              <StoreBadge key={s.store} store={s.store} top={s.top} name={s.name} href={s.href} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
