// Offline-first scenarios against a running API and web build, in Chromium:
// online save and refusal, offline save, reload and reconnect, a tab closed
// mid-sync, a slow network, a failing token refresh, two tabs, two devices.
// Offline means the API is unreachable while the app's own files still load.
//
//   docker compose up -d postgres
//   createdb esmart_e2e; DATABASE_URL=…/esmart_e2e SEED_DEMO_ACCOUNT=true \
//     DEMO_ACCOUNT_EMAIL=e2e@vertextraders.in DEMO_ACCOUNT_PASSWORD=e2e-pass-1234 npm run db:migrate -w @esmart/db
//   DATABASE_URL=…/esmart_e2e PORT=4100 npx tsx apps/api/src/server.ts &
//   EXPO_PUBLIC_API_URL=http://localhost:4100 npx expo export -p web   (in apps/web), serve dist on 8190
//   npm run e2e:offline -w @esmart/web [-- online,offline,…]
//
// It writes to that database only. Screenshots land next to this file.
import { launch, device, signIn, addCustomer, queue, book, serverParties, results, APP, toastText, sql, apiOffline, ensureCanWrite } from './lib.mjs';
const r = results();
const b = await launch();
const stamp = Date.now().toString(36);
const waitQueueEmpty = async (page, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if ((await queue(page)).length === 0) return true; await page.waitForTimeout(500); }
  return false;
};
const pick = process.argv[2];
const want = (k) => !pick || pick.split(',').includes(k);

// ---- one device
const ctx = await device(b);
const page = await ctx.newPage();
await signIn(page);

if (want('online')) {
  const name = `E2E Online ${stamp}`;
  const res = await addCustomer(page, name);
  const id = res.url.split('/').pop();
  r.check('online save: server has it once', serverParties(name) === 1, `server count ${serverParties(name)}`);
  r.check('online save: detail page uses the server id', id.startsWith('pty_'), res.url);
  r.check('online save: server-assigned code shown', (await page.locator('body').innerText()).match(/C-\d{3}/), '');
  r.check('online save: nothing left queued', (await queue(page)).length === 0, `queue ${(await queue(page)).length}`);
  r.check('online save: answered quickly', res.ms < 8000, `${res.ms} ms; toast "${res.toast}"`);
}

if (want('refused')) {
  // A customer with invoices can't be deleted: the server refuses (PARTY_IN_USE).
  const pid = sql(`select p.id from parties p join documents d on d.party_id = p.id where p.company_id = (select id from companies where name='Vertex Traders' limit 1) limit 1`);
  await page.goto(`${APP}/contacts/customers/${pid}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'refused-before.png' });
  await page.getByText('Actions', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'refused-menu.png' });
  const del = page.getByText(/^Delete/).first();
  if (await del.count()) {
    await del.click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /delete/i }).last().click().catch(() => {});
    let toast = '';
    for (let i = 0; i < 40 && !toast; i++) { await page.waitForTimeout(150); toast = await toastText(page); }
    await page.screenshot({ path: 'refused-after.png' });
    const still = (await book(page)).parties.some((p) => p.id === pid);
    r.check('online refusal: error shown', /refused|in use|cannot|invoice/i.test(toast), `toast "${toast}"`);
    r.check('online refusal: customer restored on device', still);
    r.check('online refusal: nothing left queued', (await queue(page)).length === 0, `queue ${(await queue(page)).length}`);
  } else r.check('online refusal: delete action found', false, 'no Delete action on the customer page (see refused-before.png)');
}

if (want('offline')) {
  await apiOffline(ctx, true);
  const name = `E2E Offline ${stamp}`;
  const res = await addCustomer(page, name);
  r.check('offline save: kept on device', (await book(page)).parties.some((p) => p.name === name));
  r.check('offline save: queued, not on server', (await queue(page)).length === 1 && serverParties(name) === 0, `queue ${(await queue(page)).length}`);
  r.check('offline save: no waiting', res.ms < 3000, `${res.ms} ms; toast "${res.toast}"`);

  // Reload while offline: the book stays.
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  const s = await book(page);
  r.check('offline reload: book and queue survive', s.parties?.some((p) => p.name === name) && (s.syncQueue ?? []).length === 1 && s.session?.authenticated);

  await apiOffline(ctx, false);
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const synced = await waitQueueEmpty(page, 90_000);
  r.check('reconnect: queue sent', synced);
  r.check('reconnect: server has it once', serverParties(name) === 1, `server count ${serverParties(name)}`);
  r.check('reconnect: local id replaced by server id', (await book(page)).parties.some((p) => p.name === name && p.id.startsWith('pty_')));
}

if (want('kill')) {
  // Changes made offline; the app is closed while the push is in flight.
  await apiOffline(ctx, true);
  const names = [1, 2, 3].map((i) => `E2E Kill ${stamp} ${i}`);
  for (const n of names) await addCustomer(page, n);
  let held;
  await page.route('**/v1/sync/push', async (route) => { held = route; await new Promise((res) => setTimeout(res, 60_000)); await route.continue().catch(() => {}); });
  await apiOffline(ctx, false);
  await page.waitForTimeout(3000);
  // The request reached the server's proxy point; close the tab mid-flight, then let it through anyway.
  await page.close();
  await held?.continue().catch(() => {});
  const p2 = await ctx.newPage();
  await p2.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await waitQueueEmpty(p2, 90_000);
  const counts = names.map(serverParties);
  r.check('kill mid-sync: each customer on the server exactly once', counts.every((c) => c === 1), `counts ${counts.join(',')}`);
  r.check('kill mid-sync: queue empty after relaunch', (await queue(p2)).length === 0, `queue ${(await queue(p2)).length}`);
  globalThis.page2 = p2;
}

const live = globalThis.page2 ?? page;

if (want('pwa')) {
  // The browser itself offline: can the web app even open?
  await ctx.setOffline(true);
  const opened = await live.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }).then(() => true, () => false);
  r.check('web app opens with no connection at all (needs a service worker)', opened);
  await ctx.setOffline(false);
  await live.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await live.waitForTimeout(3000);
}

if (want('slow')) {
  // No answer in 8 s: the save falls back to the device, and still lands once.
  await live.route('**/v1/sync/push', async (route) => { await new Promise((res) => setTimeout(res, 11_000)); await route.continue().catch(() => {}); });
  const name = `E2E Slow ${stamp}`;
  const res = await addCustomer(live, name);
  r.check('slow network: falls back after the wait', res.ms >= 7000 && res.ms < 12000, `${res.ms} ms; toast "${res.toast}"`);
  await live.unroute('**/v1/sync/push');
  await waitQueueEmpty(live, 60_000);
  r.check('slow network: server has it exactly once', serverParties(name) === 1, `server count ${serverParties(name)}`);
}

if (want('refresh500')) {
  // An expired access token, and a refresh the server can't answer.
  let refreshes = 0;
  await live.route('**/v1/auth/refresh', (route) => { refreshes++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }); });
  await live.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k);
      if (v && v.includes('accessToken')) { const j = JSON.parse(v); if (j.accessToken) { j.accessToken = 'expired'; localStorage.setItem(k, JSON.stringify(j)); } }
    }
  });
  const before = (await book(live)).parties.length;
  await live.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await live.waitForTimeout(6000);
  const s = await book(live);
  r.check('refresh 500: a refresh was attempted', refreshes > 0, `${refreshes} refresh calls`);
  r.check('refresh 500: still signed in', s.session?.authenticated === true && !live.url().includes('sign-in'), live.url());
  r.check('refresh 500: book kept', s.parties.length === before, `${s.parties.length} vs ${before}`);
  await live.unroute('**/v1/auth/refresh');
}

if (want('tabs')) {
  // Two tabs of one browser, both changing things offline, then back online.
  const tabA = live, tabB = await ctx.newPage();
  await tabB.goto(`${APP}/`, { waitUntil: 'domcontentloaded' }); await tabB.waitForTimeout(3000);
  await apiOffline(ctx, true);
  const a = `E2E TabA ${stamp}`, bb = `E2E TabB ${stamp}`;
  await addCustomer(tabA, a);
  await tabB.waitForTimeout(1500);
  await addCustomer(tabB, bb);
  await apiOffline(ctx, false);
  await tabA.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await waitQueueEmpty(tabA, 90_000);
  await tabB.waitForTimeout(3000);
  r.check('two tabs: both offline changes reach the server once', serverParties(a) === 1 && serverParties(bb) === 1, `A ${serverParties(a)}, B ${serverParties(bb)}`);
  await tabB.close();
}
await ctx.close();

if (want('conflict')) {
  // Two devices (separate storage) edit the same customer.
  const d1 = await device(b), d2 = await device(b);
  const p1 = await d1.newPage(), p2 = await d2.newPage();
  await signIn(p1); await signIn(p2);
  const pid = sql(`select id from parties where name like 'E2E Online ${stamp}'`);
  await apiOffline(d2, true);
  const rename = async (p, to) => {
    await p.goto(`${APP}/contacts/customers/${pid}/edit`, { waitUntil: 'domcontentloaded' });
    const f = p.getByPlaceholder('Business name'); await f.waitFor({ timeout: 30_000 }); await f.fill(to);
    await ensureCanWrite(p);
    const t0 = Date.now(); await p.getByText(/^Save/).last().click();
    await p.waitForTimeout(1500);
    return Date.now() - t0;
  };
  await rename(p2, `Device two ${stamp}`);
  await rename(p1, `Device one ${stamp}`);
  await apiOffline(d2, false);
  await p2.goto(`${APP}/settings/sync`, { waitUntil: 'domcontentloaded' });
  // Back from offline, a device waits for the connection to hold (15 s) before sending: wait for the answer.
  let q2 = await queue(p2);
  for (let i = 0; i < 90 && q2.some((e) => e.status === 'pending' && !e.conflict); i++) {
    await p2.waitForTimeout(500);
    q2 = await queue(p2);
  }
  const server = sql(`select name from parties where id='${pid}'`);
  r.check('two devices: first save kept on server', server === `Device one ${stamp}`, `server "${server}"`);
  r.check('two devices: second shows a conflict, not an overwrite', q2.some((e) => e.conflict), `queue ${JSON.stringify(q2.map((e) => ({ s: e.status, c: !!e.conflict })))}`);
  await p2.screenshot({ path: 'conflict-sync-screen.png' });
  await d1.close(); await d2.close();
}

await b.close();
process.exitCode = r.summary() ? 1 : 0;
