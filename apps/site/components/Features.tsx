import { Check } from 'lucide-react';

import { features } from '@/content/site';

import { ParallaxPhones } from './ParallaxPhones';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

export function Features() {
  return (
    <section id="features" className="section-y">
      <div className="container-site grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading eyebrow={features.eyebrow} title={features.title} align="left" />
          <Reveal index={1}>
            <p className="mx-auto mt-4 max-w-xl text-center text-muted lg:mx-0 lg:text-left">{features.body}</p>
          </Reveal>
          <ul className="mt-10 space-y-6">
            {features.items.map((item, i) => (
              <Reveal as="li" key={item.title} index={i + 2} className="flex gap-4">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-white">
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg tracking-[-0.01em] text-fg">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
        <ParallaxPhones back="eway" front="lixi" layout="upright" />
      </div>
    </section>
  );
}
