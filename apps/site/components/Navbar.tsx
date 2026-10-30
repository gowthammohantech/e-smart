'use client';

import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { nav } from '@/content/site';

import { ThemeToggle } from './ThemeToggle';
import { BrandMark } from './ui/BrandMark';
import { Button } from './ui/Button';

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
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
              <a href={link.href} className="transition-colors hover:text-primary">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Button href={nav.cta.href} variant="outline">
            {nav.cta.label}
          </Button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
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
                    className="block rounded-btn px-2 py-3 text-fg/90 hover:bg-primary-tint"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="mt-2">
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
