// Accessibility scan: axe-core (WCAG 2.2 A and AA rules) over the key pages
// of a running web build, in Chromium, light and dark. Fails on any serious
// or critical violation; minor and moderate ones are printed but pass, until
// they are worked down. Also checks the keyboard path the scan can't see:
// the skip link is the first Tab stop and lands on the main region.
//
// Needs the same setup as offline.mjs (API on 4100, web build on 8190, the
// e2e demo account), then:
//   npm run e2e:a11y -w @esmart/web
//
// Writes a11y-report.json next to this file.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, device, signIn, results, APP } from './lib.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

const PAGES = [
  ['dashboard', '/'],
  ['invoice list', '/sales/invoices'],
  ['invoice editor', '/sales/invoices/new'],
  ['item form', '/catalog/items/new'],
  ['customer form', '/contacts/customers/new'],
  ['profit report', '/reports/profit'],
  ['receivables', '/receivables'],
  ['company settings', '/settings/company'],
];

async function scan(page) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), summary: n.failureSummary?.split('\n')[1]?.trim() })),
      count: v.nodes.length,
    }));
  }, TAGS);
}

const r = results();
const report = {};
const b = await launch();

async function check(label, page) {
  // Let the page settle: data loads and the first frame of any entrance animation passes.
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const violations = await scan(page);
  report[label] = violations;
  const blocking = violations.filter((v) => BLOCKING.has(v.impact));
  for (const v of violations) {
    console.log(`   ${BLOCKING.has(v.impact) ? '✗' : '·'} [${v.impact}] ${v.id} ×${v.count}: ${v.help}`);
    if (BLOCKING.has(v.impact)) for (const n of v.nodes) console.log(`       ${n.target}${n.summary ? ` — ${n.summary}` : ''}`);
  }
  r.check(`${label}: no serious or critical violations`, blocking.length === 0, blocking.map((v) => v.id).join(', '));
}

for (const theme of ['light', 'dark']) {
  const ctx = await device(b);
  await ctx.addInitScript((mode) => {
    localStorage.setItem('ebs.ui.v1', JSON.stringify({ state: { themeMode: mode, language: 'en' }, version: 2 }));
  }, theme);
  const page = await ctx.newPage();

  await page.goto(`${APP}/sign-in`, { waitUntil: 'networkidle', timeout: 120_000 });
  await check(`${theme} · sign in`, page);

  await signIn(page);
  for (const [label, path] of PAGES) {
    await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded' });
    await check(`${theme} · ${label}`, page);
  }

  if (theme === 'light') {
    // Keyboard: the first Tab stop is the skip link, and following it lands in main.
    await page.goto(`${APP}/sales/invoices`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // Fresh from navigation, focus is on the document, so the next Tab is the page's first stop.
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    r.check('first Tab stop is the skip link', first === 'Skip to content', `got "${first}"`);
    await page.keyboard.press('Enter');
    const landed = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    r.check('skip link moves focus to main', landed === 'main', `focus on role "${landed}"`);
  }
  await ctx.close();
}

writeFileSync(new URL('./a11y-report.json', import.meta.url), JSON.stringify(report, null, 2));
await b.close();
process.exit(r.summary() ? 1 : 0);
