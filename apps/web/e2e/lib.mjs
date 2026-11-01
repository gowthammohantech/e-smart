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
function findChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  for (const d of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const bin = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(bin)) return bin;
  }
}
export const launch = () => chromium.launch({ executablePath: findChrome() });
export async function device(browser, view = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport: view });
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
export const queue = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ebs.remote.v1') ?? '{"state":{}}').state.syncQueue ?? []);
export const book = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ebs.remote.v1') ?? '{"state":{}}').state);

export function sql(q) {
  return execFileSync('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'esmart', '-d', DB, '-At', '-c', q]).toString().trim();
}
export const serverParties = (name) => Number(sql(`select count(*) from parties where name = '${name.replace(/'/g, "''")}'`));

/** Toast text shown after an action, collected as it appears. */
export async function addCustomer(page, name) {
  await page.goto(`${APP}/contacts/customers/new`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Business name').waitFor({ timeout: 30_000 });
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
  if (off) await ctx.route(`${API_ORIGIN}/**`, (route) => route.abort('internetdisconnected'));
  else await ctx.unroute(`${API_ORIGIN}/**`);
}
