'use client';

import { useState } from 'react';

import { earlyAccess } from '@/content/site';

import { PhoneFrame } from './mockups/Screens';
import { Eyebrow } from './ui/Eyebrow';
import { Reveal } from './ui/Reveal';

export function Waitlist() {
  const [done, setDone] = useState(false);

  return (
    <section id="early-access" className="container-site pb-[72px] lg:pb-[120px]">
      <Reveal className="relative overflow-hidden rounded-media bg-deep">
        <div className="pointer-events-none absolute top-1/2 -right-40 size-[620px] -translate-y-1/2 rounded-full bg-deep-2/80" aria-hidden />
        <div className="pointer-events-none absolute top-1/2 -right-16 size-[420px] -translate-y-1/2 rounded-full bg-deep-2" aria-hidden />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-2 lg:p-14">
          <div className="text-center lg:text-left">
            <Eyebrow className="!bg-white/10 !text-white">{earlyAccess.eyebrow}</Eyebrow>
            <h2 className="h-section mt-5 text-white">{earlyAccess.title}</h2>
            <p className="mt-3 text-white/75">{earlyAccess.body}</p>
            {done ? (
              <p className="mt-8 rounded-btn bg-white/10 px-4 py-3 text-white" role="status">
                {earlyAccess.thanks}
              </p>
            ) : (
              <form
                className="mt-8 flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  // TODO: post to the signup endpoint once it exists.
                  setDone(true);
                }}
              >
                <label htmlFor="early-email" className="sr-only">
                  Email
                </label>
                <input
                  id="early-email"
                  type="email"
                  required
                  placeholder={earlyAccess.placeholder}
                  className="min-w-0 flex-1 rounded-btn border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
                />
                <button type="submit" className="rounded-btn bg-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-pressed">
                  {earlyAccess.button}
                </button>
              </form>
            )}
            <p className="mt-4 text-xs text-white/60">
              {earlyAccess.note}{' '}
              <a href={earlyAccess.terms.href} className="text-primary-soft underline-offset-2 hover:underline">
                {earlyAccess.terms.label}
              </a>
              .
            </p>
          </div>
          {/* Phones bleed off the bottom edge of the banner. */}
          <div className="relative -mb-6 hidden h-[340px] sm:-mb-10 lg:-mb-14 lg:block">
            <div className="absolute top-6 left-[12%] rotate-[-6deg]">
              <PhoneFrame screen="dashboard" width={220} />
            </div>
            <div className="absolute top-0 right-[10%] rotate-[5deg]">
              <PhoneFrame screen="invoice" width={230} />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
