'use client';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';

import { faq } from '@/content/site';

import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

export function Faq() {
  const [open, setOpen] = useState(0);
  const base = useId();

  return (
    <section id="faq" className="section-y">
      <div className="container-site grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <SectionHeading eyebrow={faq.eyebrow} title={faq.title} sub={faq.sub} align="left" />
        <ul className="space-y-3">
          {faq.items.map((item, i) => {
            const isOpen = open === i;
            const panel = `${base}-panel-${i}`;
            return (
              <Reveal as="li" key={item.q} index={i}>
                <div className={`card-glass relative rounded-xl ${isOpen ? 'card-glass-strong' : ''}`}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panel}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-fg"
                  >
                    <span className="font-medium">{item.q}</span>
                    <ChevronDown className={`size-5 shrink-0 text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        id={panel}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mx-5 border-t border-line pt-3 pb-5 text-sm text-muted">{item.a}</div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
