import { Bot, ShieldCheck } from 'lucide-react';

import { bento } from '@/content/site';

import { FakeQr } from './mockups/Screens';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

/** Card A art: the IRN, the cancel countdown and the e-way bill validity. */
function ComplianceArt() {
  const steps = [
    { label: 'Validated', pct: 100 },
    { label: 'IRN', pct: 100 },
    { label: 'E-way bill', pct: 72 },
    { label: 'Delivered', pct: 38 },
  ];
  return (
    <div className="relative mt-8 overflow-hidden rounded-media bg-deep p-5">
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-deep-2/70 blur-2xl" />
      <div className="relative grid grid-cols-3 gap-2 text-white">
        {[
          ['Filed today', '42'],
          ['Accepted', '41'],
          ['To fix', '1'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
            <div className="text-[11px] text-white/70">{k}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex items-center gap-4 rounded-xl bg-white/10 p-3 text-white">
        <FakeQr size={68} seed={19} />
        <div className="text-xs leading-relaxed">
          <div className="font-semibold">IRN a5c9…4be8 · signed</div>
          <div className="text-white/70">Cancel window closes in 22h 41m</div>
          <div className="text-white/70">EWB valid 1d 18h · 412 km</div>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-4 gap-2">
        {steps.map((s) => (
          <div key={s.label} className="flex flex-col gap-2">
            <div className="relative h-20 overflow-hidden rounded-lg bg-white/5">
              <div
                className="absolute inset-x-0 bottom-0 rounded-lg"
                style={{ height: `${s.pct}%`, background: 'linear-gradient(180deg, var(--card-art-from), var(--card-art-to))' }}
              />
            </div>
            <span className="text-center text-[11px] text-white/70">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card B art: a question, Lixi's answer and the draft waiting for approval. */
function LixiArt() {
  return (
    <div className="relative mt-8 overflow-hidden rounded-media border border-line bg-gradient-to-b from-primary-tint to-transparent p-5">
      <img src="/brand/lixi-orb-animated.webp" alt="" className="absolute -right-6 -bottom-8 size-40 opacity-80" />
      <div className="relative flex max-w-[86%] flex-col gap-3 text-sm">
        <div className="self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-white">What is low on stock this week?</div>
        <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3 text-fg">
          Three items are below reorder level. Cotton yarn 40s has 18 kg left — about four days at your usual rate.
        </div>
        <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3">
          <div className="text-xs text-muted">Draft purchase order · not saved</div>
          <div className="mt-1 font-medium text-fg">PO to Deccan Yarns · 3 items · ₹64,200</div>
          <div className="mt-3 flex gap-2 text-xs">
            <span className="rounded-btn bg-primary px-3 py-1.5 text-white">Review & confirm</span>
            <span className="rounded-btn border border-line px-3 py-1.5 text-fg">Edit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Bento() {
  const [compliance, lixi] = bento.large;
  return (
    <section id="all-in-one" className="section-y">
      <div className="container-site">
        <SectionHeading
          eyebrow={bento.eyebrow}
          title={
            <>
              {bento.title[0]}
              <br className="hidden sm:block" /> {bento.title[1]}
            </>
          }
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {[
            { card: compliance, icon: <ShieldCheck className="size-3.5" />, art: <ComplianceArt /> },
            { card: lixi, icon: <Bot className="size-3.5" />, art: <LixiArt /> },
          ].map(({ card, icon, art }, i) => (
            <Reveal key={card.key} index={i} className="h-full">
              <Card as="article" className="flex h-full flex-col">
                <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary-tint px-2.5 py-1 text-xs font-medium text-primary">
                  {icon}
                  {card.label}
                </span>
                <h3 className="mt-4 text-xl tracking-[-0.01em] text-fg lg:text-2xl">{card.title}</h3>
                <p className="mt-2 text-sm text-muted">{card.body}</p>
                <div className="mt-auto">{art}</div>
              </Card>
            </Reveal>
          ))}
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {bento.small.map((card, i) => (
            <Reveal key={card.title} index={i} className="h-full">
              <Card as="article" className="h-full">
                <span className="grid size-9 place-items-center rounded-btn bg-deep-2 text-white">
                  <Icon name={card.icon} />
                </span>
                <h3 className="mt-4 text-lg tracking-[-0.01em] text-fg">{card.title}</h3>
                <p className="mt-2 text-sm text-muted">{card.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
