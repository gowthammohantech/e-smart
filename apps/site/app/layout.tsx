import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Sans } from 'next/font/google';
import { MotionConfig } from 'motion/react';

import { brand } from '@/content/site';
import { DEFAULT_PALETTE, paletteBootScript, paletteCss } from '@/lib/palette';

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
  themeColor: '#05070B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script may change data-palette before hydration.
    <html lang="en" data-palette={DEFAULT_PALETTE} className={`${inter.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: paletteCss() }} />
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript }} />
      </head>
      <body>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
