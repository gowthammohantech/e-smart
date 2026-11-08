import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Sans } from 'next/font/google';
import { MotionConfig } from 'motion/react';

import { brand } from '@/content/site';
import { DEFAULT_THEME, themeBootScript, themeCss } from '@/lib/theme';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' });

/** The public address, for absolute OG and canonical URLs. Same default as the apps' EXPO_PUBLIC_SITE_URL. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://elixirbooks.smart').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Every other page names itself and gets "· Elixir Books Smart" after it.
  title: { default: `${brand.name} — Invoicing, GST and stock for Indian businesses`, template: `%s · ${brand.name}` },
  description:
    'Bill, file e-invoices and e-way bills, chase payments and keep stock from your phone. GST compliance on every plan, your books in sync on every device, with Lixi, your AI assistant.',
  icons: { icon: '/brand/elixir-mark-dark.png' },
  openGraph: {
    title: brand.name,
    description: brand.tagline,
    type: 'website',
    siteName: brand.name,
    images: [{ url: '/brand/elixir-books.png', width: 784, height: 378, alt: brand.name }],
  },
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
