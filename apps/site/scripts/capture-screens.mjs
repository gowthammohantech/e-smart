// Captures the real app screens the site shows, in light and dark, from a
// running web app (apps/web) signed in to the seeded demo account. Run by
// hand when the app changes; the output is committed, so builds don't need it.
//
//   docker compose up -d postgres
//   npm run db:migrate -w @esmart/db        (SEED_DEMO_ACCOUNT=true in apps/api/.env)
//   npm run api  &  EXPO_PUBLIC_API_URL=http://localhost:4000 npm run web
//   npm run capture -w @esmart/site
//
// Env: APP_URL (default http://localhost:8081), DEMO_EMAIL, DEMO_PASSWORD,
// CHROME (a Chromium binary; defaults to the newest Playwright download).
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const EMAIL = process.env.DEMO_EMAIL ?? 'gowtham@vertextraders.in';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/screens');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const bin = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(bin)) return bin;
  }
  return undefined; // let Playwright look for its own
}

/** Each shot: a route, an optional step once there, and the viewport it needs. */
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const SHOTS = [
  { name: 'dashboard', path: '/', view: PHONE },
  {
    name: 'invoice',
    path: '/sales/invoices',
    view: PHONE,
    // Open an invoice with an IRN, then scroll to its totals and signed QR.
    step: async (page) => {
      await page.getByText('Mehta Hardware').first().click();
      await settle(page);
      await page.mouse.move(195, 400);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(800);
    },
  },
  { name: 'compliance', path: '/compliance', view: PHONE },
  {
    name: 'eway',
    path: '/compliance?tab=eway',
    view: PHONE,
    step: async (page) => {
      await page.getByText('Active', { exact: true }).nth(1).click();
      await settle(page);
    },
  },
  { name: 'receivables', path: '/receivables', view: PHONE },
  { name: 'inventory', path: '/inventory', view: PHONE },
  { name: 'report', path: '/reports/sales-summary', view: PHONE },
  { name: 'lixi', path: '/lixi', view: PHONE },
  { name: 'desktop-invoices', path: '/sales/invoices', view: DESKTOP },
  { name: 'desktop-home', path: '/', view: DESKTOP },
];

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
}

/** Re-encodes a PNG as WebP with Chromium's own encoder, so no image library is needed. */
async function toWebp(page, png) {
  const dataUrl = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.86);
  }, `data:image/png;base64,${png.toString('base64')}`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const browser = await chromium.launch({ executablePath: findChrome() });

for (const theme of ['light', 'dark']) {
  mkdirSync(join(OUT, theme), { recursive: true });
  for (const view of [PHONE, DESKTOP]) {
    const shots = SHOTS.filter((s) => s.view === view);
    const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, colorScheme: theme });
    // The app keeps its theme in this persisted store (packages/app/store/uiStore.ts).
    await ctx.addInitScript((mode) => {
      localStorage.setItem('ebs.ui.v1', JSON.stringify({ state: { themeMode: mode, language: 'en' }, version: 2 }));
    }, theme);
    const page = await ctx.newPage();
    await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.getByPlaceholder('you@business.com').fill(EMAIL);
    await page.getByPlaceholder('Your password').fill(PASSWORD);
    await page.getByText('Sign in', { exact: true }).last().click();
    await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 60_000 });
    await page.waitForTimeout(4000);

    for (const shot of shots) {
      await page.goto(`${APP}${shot.path}`, { waitUntil: 'networkidle' });
      await settle(page);
      if (shot.step) await shot.step(page);
      // Carets and the scrollbar change between runs; hide them.
      await page.addStyleTag({ content: '*{caret-color:transparent!important;scrollbar-width:none!important}' });
      const png = await page.screenshot();
      const file = join(OUT, theme, `${shot.name}.webp`);
      writeFileSync(file, await toWebp(page, png));
      console.log(`${theme} ${shot.name}`);
    }
    await ctx.close();
  }
}

await browser.close();
