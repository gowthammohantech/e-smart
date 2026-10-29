import { testimonials } from '@/content/site';

import { Card } from './ui/Card';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

function Quote() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 text-primary-soft" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M13 9c-4.5 1.5-7 5-7 10v4h7v-7H9.5c0-3 1.5-5 4.5-6L13 9Zm13 0c-4.5 1.5-7 5-7 10v4h7v-7h-3.5c0-3 1.5-5 4.5-6L26 9Z" />
    </svg>
  );
}

function Stars() {
  return (
    <span className="flex gap-0.5" aria-label="5 out of 5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="grid size-4 place-items-center bg-star text-white">
          <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
            <path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6L12 2Z" />
          </svg>
        </span>
      ))}
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

export function Testimonials() {
  return (
    <section id="testimonials" className="section-y">
      <div className="container-site">
        <SectionHeading eyebrow={testimonials.eyebrow} title={testimonials.title} />
        {/* A swipe row on phones, a grid from tablet up. */}
        <ul className="-mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {testimonials.items.map((t, i) => (
            <Reveal as="li" key={t.name} index={i} className="w-[85%] shrink-0 snap-center md:w-auto">
              <Card className="flex h-full flex-col">
                <Quote />
                <blockquote className="mt-5 flex-1 text-fg">{t.quote}</blockquote>
                <div className="mt-6 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-deep-2 text-sm font-semibold text-white">{initials(t.name)}</span>
                  <div>
                    <Stars />
                    <p className="mt-1 text-sm font-medium text-fg">{t.name}</p>
                    <p className="text-xs text-muted">{t.role}</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
