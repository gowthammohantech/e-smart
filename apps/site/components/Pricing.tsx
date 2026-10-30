'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { PlanCard } from '@/content/site';

import { Button } from './ui/Button';
import { SectionHeading } from './ui/SectionHeading';
import { Reveal } from './ui/Reveal';

type Copy = {
  eyebrow: string;
  title: string;
  sub: string;
  monthlyLabel: string;
  yearlyLabel: string;
  badge: string;
  footnote: string;
  plans: PlanCard[];
};

const inr = new Intl.NumberFormat('en-IN');

/** Counts from the previous price to the new one when billing switches. */
function Price({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = last.current;
    last.current = value;
    if (reduced || from === value) {
      el.textContent = inr.format(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.5,
      ease: 'easeOut',
      onUpdate: (v) => (el.textContent = inr.format(Math.round(v))),
    });
    return () => controls.stop();
  }, [value, reduced]);
  return <span ref={ref}>{inr.format(value)}</span>;
}

export function Pricing({ copy }: { copy: Copy }) {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="section-y">
      <div className="container-site">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <Reveal className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className={yearly ? 'text-muted' : 'text-fg'}>{copy.monthlyLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label="Bill yearly"
            onClick={() => setYearly((v) => !v)}
            className={`relative h-7 w-12 rounded-full transition-colors ${yearly ? 'bg-primary' : 'bg-line-strong'}`}
          >
            <span className={`absolute top-1 left-1 size-5 rounded-full bg-white transition-transform ${yearly ? 'translate-x-5' : ''}`} />
          </button>
          <span className={yearly ? 'text-fg' : 'text-muted'}>{copy.yearlyLabel}</span>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-deep">{copy.badge}</span>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {copy.plans.map((plan, i) => {
            const price = yearly ? plan.yearly : plan.monthly;
            return (
              <Reveal key={plan.key} index={i} className="h-full">
                <article
                  className={`card-glass relative flex h-full flex-col rounded-card p-6 lg:p-7 ${plan.popular ? 'card-glass-strong' : ''}`}
                >
                  {plan.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold tracking-wider text-white uppercase">
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="text-2xl tracking-[-0.01em] text-fg">{plan.name}</h3>
                  <p className="mt-2 min-h-[3em] text-sm text-muted">{plan.blurb}</p>
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-[40px] leading-none font-medium tracking-[-0.02em] text-fg">
                      ₹<Price value={price} />
                    </span>
                    <span className="text-lg text-muted">{price === 0 ? '' : yearly ? '/yr' : '/mo'}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {price === 0 ? (
                      'Free forever'
                    ) : yearly ? (
                      <>
                        That&apos;s <span className="text-primary">₹{inr.format(Math.round(plan.yearly / 12))}</span> a month
                      </>
                    ) : (
                      <>
                        or <span className="text-primary">₹{inr.format(plan.yearly)}</span> billed yearly
                      </>
                    )}
                  </p>
                  <hr className="my-6 border-line" />
                  <Button href="#top" variant={plan.popular ? 'filled' : 'outline'} className="w-full">
                    {price === 0 ? 'Start free' : 'Choose plan'}
                  </Button>
                  <p className="mt-7 text-sm font-medium text-fg">Plan details:</p>
                  <ul className="mt-3 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-fg/90">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                    {plan.missing.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-dim line-through decoration-dim/50">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-dim" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-dim">{copy.footnote}</p>
      </div>
    </section>
  );
}
