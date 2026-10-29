import { about } from '@/content/site';

import { ParallaxPhones } from './ParallaxPhones';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

export function About() {
  return (
    <section id="about" className="section-y">
      <div className="container-site grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <ParallaxPhones back="dashboard" front="aging" />
        <div>
          <SectionHeading eyebrow={about.eyebrow} title={about.title} align="left" />
          <Reveal index={1}>
            <p className="mx-auto mt-4 max-w-xl text-center text-muted lg:mx-0 lg:text-left">{about.body}</p>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {about.stats.map((stat, i) => (
              <Reveal as="li" key={stat.label} index={i + 2}>
                <Card className="h-full !p-5">
                  <span className="grid size-8 place-items-center rounded-btn bg-primary-tint text-primary">
                    <Icon name={stat.icon} />
                  </span>
                  <p className="mt-4 text-sm text-muted">{stat.label}</p>
                  <p className="mt-1 font-display text-[40px] leading-none font-medium tracking-[-0.02em] text-fg">{stat.value}</p>
                </Card>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
