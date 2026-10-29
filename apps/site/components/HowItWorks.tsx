'use client';

import { Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { howItWorks } from '@/content/site';

import { DesktopScreen } from './mockups/Desktop';
import { Card } from './ui/Card';
import { Reveal } from './ui/Reveal';
import { SectionHeading } from './ui/SectionHeading';

function VideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Product demo"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-media border border-line bg-surface"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        {howItWorks.demo.videoUrl ? (
          <video src={howItWorks.demo.videoUrl} className="size-full" controls autoPlay />
        ) : (
          <div className="grid size-full place-items-center p-6 text-center text-muted">
            The product demo video is on its way. Set howItWorks.demo.videoUrl in content/site.ts.
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          aria-label="Close demo"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/60 text-white"
        >
          <X className="size-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}

/** Scales the 1120px desktop mockup to whatever width its frame has. */
function ScaledDesktop() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1120));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="origin-top-left" style={{ width: 1120, transform: `scale(${scale})` }}>
        <DesktopScreen />
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section id="how-it-works" className="section-y">
      <div className="container-site">
        <SectionHeading eyebrow={howItWorks.eyebrow} title={howItWorks.title} />
        <Reveal className="relative mt-12 aspect-[16/9] overflow-hidden rounded-media border border-line bg-surface">
          <ScaledDesktop />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group absolute bottom-4 left-4 flex items-center gap-3 text-sm font-medium text-white sm:bottom-6 sm:left-6"
          >
            <span className="grid size-12 place-items-center rounded-btn bg-white text-primary transition-transform group-hover:scale-105">
              <Play className="size-5 fill-current" />
            </span>
            {howItWorks.demo.label}
          </button>
        </Reveal>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          {howItWorks.steps.map((step, i) => (
            <Reveal as="li" key={step.title} index={i}>
              <Card className="h-full">
                <span className="text-numeral block font-display text-[56px] leading-none font-medium">{i + 1}</span>
                <h3 className="mt-4 text-lg tracking-[-0.01em] text-fg">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </div>
      <AnimatePresence>{open ? <VideoModal onClose={() => setOpen(false)} /> : null}</AnimatePresence>
    </section>
  );
}
