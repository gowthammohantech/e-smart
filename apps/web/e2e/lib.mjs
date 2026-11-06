import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
export const APP = process.env.APP_URL ?? 'http://localhost:8190';
export const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4100';
export const EMAIL = process.env.DEMO_EMAIL ?? 'e2e@vertextraders.in';
export const PASSWORD = process.env.DEMO_PASSWORD ?? 'e2e-pass-1234';
const DB = process.env.E2E_DB ?? 'esmart_e2e';
const COMPOSE = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));
/** A Mac's cached Chrome for Testing; elsewhere (CI) the browser `npx playwright-core install chromium` put in place. */
function findChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const d of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const bin = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(bin)) return bin;
  }
  return undefined;
}
export const launch = () => chromium.launch({ executablePath: findChrome() });
export async function device(browser, view = { width: 1280, height: 860 }) {
  // The app's CSP is script-src 'self'; the axe scan injects its own script, so the test browser skips it.
  const ctx = await browser.newContext({ viewport: view, bypassCSP: true });
  await ctx.addInitScript(() => localStorage.setItem('ebs.ui.v1', JSON.stringify({ state: { themeMode: 'light', language: 'en' }, version: 2 })));
  return ctx;
}
export async function signIn(page) {
  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByPlaceholder('you@business.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).last().click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 90_000 });
  await page.waitForTimeout(3000);
}
/**
 * The book as the web app saved it: IndexedDB `ebs-book`, one record per collection
 * (packages/app/store/bookBackend.web.ts). Never creates the database itself.
 */
export const book = (page) =>
  page.evaluate(async () => {
    const known = (await indexedDB.databases?.()) ?? [];
    if (!known.some((d) => d.name === 'ebs-book')) return {};
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('ebs-book');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('book')) return resolve({});
        const store = db.transaction('book', 'readonly').objectStore('book');
        const keys = store.getAllKeys();
        const values = store.getAll();
        store.transaction.oncomplete = () => {
          const out = {};
          keys.result.forEach((k, i) => (out[k] = JSON.parse(values.result[i])));
          db.close();
          resolve(out);
        };
      };
    });
  });
export const queue = async (page) => (await book(page)).syncQueue ?? [];

/** A query against the e2e database: `psql` on E2E_DATABASE_URL (CI), or inside the compose Postgres. */
export function sql(q) {
  const url = process.env.E2E_DATABASE_URL;
  if (url) return execFileSync('psql', [url, '-At', '-c', q]).toString().trim();
  return execFileSync('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'esmart', '-d', DB, '-At', '-c', q]).toString().trim();
}
export const serverParties = (name) => Number(sql(`select count(*) from parties where name = '${name.replace(/'/g, "''")}'`));

/** Browser contexts whose API calls `apiOffline` is failing. */
const cutOff = new WeakSet();

/**
 * With the API cut off, the app is view-only until the person agrees to work offline (since
 * 5c875d8): saving is greyed out and a "Work offline" badge shows. This agrees, as a person would:
 * once the app has noticed (the badge), the badge opens the prompt, whose "Work offline" accepts.
 * Does nothing for a context that is online.
 */
export async function ensureCanWrite(page, waitMs = 30_000) {
  if (!cutOff.has(page.context())) return;
  const badge = page.getByRole('button', { name: 'Work offline' });
  // Already agreed this session (the app still in offline mode from before): the plain "Offline" badge.
  const agreed = page.getByText(/^Offline( · \d+ waiting)?$/);
  const end = Date.now() + waitMs;
  while (Date.now() < end) {
    if (await agreed.count()) return;
    if (await badge.count()) {
      await badge.first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Work offline' }).last().click();
      await agreed.first().waitFor({ timeout: 5_000 }).catch(() => {});
      return;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('The app never noticed it was offline (no "Work offline" or "Offline" badge)');
}

/** Toast text shown after an action, collected as it appears. */
export async function addCustomer(page, name) {
  await page.goto(`${APP}/contacts/customers/new`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Business name').waitFor({ timeout: 30_000 });
  await ensureCanWrite(page);
  await page.getByPlaceholder('Business name').fill(name);
  const started = Date.now();
  await page.getByText('Add customer', { exact: true }).last().click();
  await page.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: 20_000 }).catch(() => {});
  return { ms: Date.now() - started, url: page.url(), toast: await toastText(page) };
}
export async function toastText(page) {
  const texts = await page.locator('[role="alert"], [aria-live]').allInnerTexts().catch(() => []);
  return texts.join(' | ').replace(/\s+/g, ' ').trim();
}
export function results() {
  const out = [];
  return {
    check(name, ok, detail = '') {
      out.push({ name, ok: !!ok, detail });
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    },
    summary() {
      const failed = out.filter((r) => !r.ok);
      console.log(`\n${out.length - failed.length}/${out.length} passed`);
      return failed.length;
    },
  };
}

/** No internet, as the app sees it: every call to the API fails like a dropped connection. */
export async function apiOffline(ctx, off) {
  if (off) {
    cutOff.add(ctx);
    await ctx.route(`${API_ORIGIN}/**`, (route) => route.abort('internetdisconnected'));
  } else {
    cutOff.delete(ctx);
    await ctx.unroute(`${API_ORIGIN}/**`);
  }
}
