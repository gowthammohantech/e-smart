'use client';

import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { nav } from '@/content/site';

import { ThemeToggle } from './ThemeToggle';
import { BrandMark } from './ui/BrandMark';
import { Button } from './ui/Button';

/** The in-page sections the nav links to, e.g. `#features` → `features`. */
const SECTION_IDS = nav.links.filter((l) => l.href.startsWith('#')).map((l) => l.href.slice(1));

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** The section under the top third of the screen, highlighted in the nav. */
  const [active, setActive] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const line = window.innerHeight / 3;
      let current: string | null = null;
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The mobile menu closes on Escape (focus back to its button) or a tap outside the header.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const isActive = (href: string) => href === `#${active}`;

  return (
    <header
      ref={header}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? 'border-b border-line bg-bg/80 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <nav className="container-site flex h-[72px] items-center justify-between" aria-label="Main">
        <a href="#top" aria-label="Elixir Books Smart, back to top">
          <BrandMark />
        </a>
        <ul className="hidden items-center gap-8 text-sm text-fg/80 md:flex">
          {nav.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                aria-current={isActive(link.href) ? 'location' : undefined}
                className={`transition-colors hover:text-primary ${isActive(link.href) ? 'text-primary' : ''}`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <a href={nav.demo.href} className="text-sm font-medium text-muted transition-colors hover:text-fg">
            {nav.demo.label}
          </a>
          <Button href={nav.cta.href} variant="outline">
            {nav.cta.label}
          </Button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            ref={toggle}
            type="button"
            className="grid size-10 place-items-center rounded-btn bg-fg text-bg"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden md:hidden"
          >
            <ul className="container-site flex flex-col gap-1 pb-6">
              {nav.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(link.href) ? 'location' : undefined}
                    className={`block rounded-btn px-2 py-3 hover:bg-primary-tint ${isActive(link.href) ? 'text-primary' : 'text-fg/90'}`}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="mt-2 flex flex-col gap-2">
                <Button href={nav.demo.href} variant="outline" className="w-full">
                  {nav.demo.label}
                </Button>
                <Button href={nav.cta.href} className="w-full">
                  {nav.cta.label}
                </Button>
              </li>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
