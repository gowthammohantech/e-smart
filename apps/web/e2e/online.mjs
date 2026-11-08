// Online-only scenarios against a running API and web build, in Chromium: a save reaches the server
// and nothing is kept in the browser; with the API unreachable the app says so, saving is off, and
// nothing waits to be sent later.
//
//   docker compose up -d postgres
//   createdb esmart_e2e; DATABASE_URL=…/esmart_e2e SEED_DEMO_ACCOUNT=true \
//     DEMO_ACCOUNT_EMAIL=e2e@vertextraders.in DEMO_ACCOUNT_PASSWORD=e2e-pass-1234 npm run db:migrate -w @esmart/db
//   DATABASE_URL=…/esmart_e2e PORT=4100 npx tsx apps/api/src/server.ts &
//   EXPO_PUBLIC_API_URL=http://localhost:4100 npx expo export -p web   (in apps/web), serve dist on 8190
//   npm run e2e:online -w @esmart/web
//
// It writes to that database only.
import { launch, device, signIn, addCustomer, keepsBook, serverParties, results, APP, apiOffline } from './lib.mjs';

const r = results();
const b = await launch();
const stamp = Date.now().toString(36);
const ctx = await device(b);
const page = await ctx.newPage();
await signIn(page);

{
  const name = `E2E Online ${stamp}`;
  const res = await addCustomer(page, name);
  r.check('save: the server has it once', serverParties(name) === 1, `server count ${serverParties(name)}`);
  r.check('save: the detail page uses the server id', res.url.split('/').pop().startsWith('pty_'), res.url);
  r.check('save: answered quickly', res.ms < 8000, `${res.ms} ms; toast "${res.toast}"`);
  await page.reload({ waitUntil: 'networkidle' });
  r.check('reload: still signed in, books loaded from the server', !page.url().includes('sign-in'), page.url());
  r.check('reload: nothing kept in the browser', !(await keepsBook(page)));
}

{
  const name = `E2E Cut off ${stamp}`;
  await page.goto(`${APP}/contacts/customers/new`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Business name').waitFor({ timeout: 30_000 });
  await apiOffline(ctx, true);
  // The app finds out from NetInfo or from its own next request.
  await page.getByPlaceholder('Business name').fill(name);
  await page.getByText('Add customer', { exact: true }).last().click().catch(() => {});
  const banner = await page.getByText('No internet connection').first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
  r.check('no connection: the header says so', banner);
  await apiOffline(ctx, false);
  await page.waitForTimeout(3000);
  r.check('no connection: nothing was saved, or kept to send later', serverParties(name) === 0, `server count ${serverParties(name)}`);
}

await b.close();
process.exit(r.summary() ? 1 : 0);
