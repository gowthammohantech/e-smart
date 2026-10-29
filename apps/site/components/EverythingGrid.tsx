import { everything } from '@/content/site';

import { Icon } from './ui/Icon';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

export function EverythingGrid() {
  return (
    <section className="pb-[72px] lg:pb-[120px]">
      <div className="container-site">
        <SectionHeading eyebrow={everything.eyebrow} title={everything.title} />
        {/* A 1px gap over the line colour draws the hairlines between cells. */}
        <ul className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {everything.items.map((item, i) => (
            <Reveal
              as="li"
              key={item.title}
              index={i % 4}
              className="flex gap-3 bg-surface p-5 transition-colors hover:bg-surface-2"
            >
              <span className="text-primary">
                <Icon name={item.icon} className="size-5" />
              </span>
              <div>
                <h3 className="font-sans text-[15px] font-medium text-fg">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-snug text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
