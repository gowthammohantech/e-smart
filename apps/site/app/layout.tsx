import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Sans } from 'next/font/google';
import { MotionConfig } from 'motion/react';

import { brand } from '@/content/site';
import { DEFAULT_THEME, themeBootScript, themeCss } from '@/lib/theme';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  title: `${brand.name} — Invoicing, GST and stock for Indian businesses`,
  description:
    'Bill, file e-invoices and e-way bills, chase payments and keep stock from your phone. GST compliance on every plan, works offline, with Lixi, your AI assistant.',
  icons: { icon: '/brand/elixir-mark-dark.png' },
  openGraph: { title: brand.name, description: brand.tagline, type: 'website' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#05070B' },
    { media: '(prefers-color-scheme: light)', color: '#F4F6FA' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script may change data-theme before hydration.
    <html lang="en" data-theme={DEFAULT_THEME} className={`${inter.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      {/* Browser extensions (e.g. Testim) add attributes to <body> before React loads. */}
      <body suppressHydrationWarning>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
