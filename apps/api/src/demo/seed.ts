/**
 * The public "Give it a try" account: checks the database and builds or refreshes it on its own.
 *
 *   DEMO_ENABLED   on unless false/0/off. Off suspends the demo (nobody can sign in); it never deletes.
 *   DEMO_EMAIL     the sign-in the app prefills (default demo@elixir-books.com)
 *   DEMO_PASSWORD  public on purpose: the account is read-only
 *
 * It runs at start-up and once a day (jobs/registry.ts, `demo.refresh`). A rebuild happens when there
 * is no demo, when PUBLIC_DEMO_SEED_VERSION moved on, or when it is a week old, so "overdue" and
 * "this month" stay true.
 *
 * The new demo is built beside the old one, under a temporary sign-in, through the API itself (an
 * in-process server with the simulators for every outside service, so nothing reaches a GST portal,
 * a bank, or anyone's inbox). Then one transaction hands it the demo sign-in and retires the old
 * account, whose data is then erased. Visitors on the old one are signed out; nobody sees half a demo.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import { PUBLIC_DEMO_REFRESH_DAYS, PUBLIC_DEMO_SEED_VERSION, publicDemoConfig } from '@esmart/db/demo/public/config';
import type { Config } from '../config';
import type { Deps } from '../context';
import { createProviders } from '../providers';
import type { Gstr2bEntry } from '../providers/returns';
import { DemoApi } from './client';
import { buildBusiness, type Built } from './build';
import { PROFILES } from './profiles';

type Log = { info: (o: object | string, m?: string) => void; warn: (o: object | string, m?: string) => void; error: (o: object | string, m?: string) => void };

/** Two instances starting at once must not both build: whoever holds this builds, the other leaves it. */
const LOCK_KEY = 0x0de0_5eed;

export type DemoOutcome = 'disabled' | 'current' | 'built' | 'busy';

export async function ensurePublicDemo(deps: Deps, log: Log, opts: { force?: boolean; env?: Record<string, string | undefined> } = {}): Promise<DemoOutcome> {
  const cfg = publicDemoConfig(opts.env ?? process.env);
  const A = schema.accounts;
  const U = schema.users;

  if (!cfg.enabled) {
    // Off: whoever is in is signed out and nobody else gets in. The data stays, for switching back on.
    const live = await deps.db.select({ id: A.id }).from(A).where(and(eq(A.isDemo, true), isNull(A.suspendedAt)));
    if (live.length) await retire(deps, live.map((a) => a.id), { erase: false });
    return 'disabled';
  }

  const client = await deps.pool.connect();
  try {
    const [{ locked }] = (await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [LOCK_KEY])).rows;
    if (!locked) return 'busy';
    try {
      const [current] = await deps.db
        .select({ id: A.id, version: A.demoSeedVersion, seededAt: A.demoSeededAt })
        .from(A)
        .innerJoin(U, eq(U.id, A.ownerUserId))
        .where(and(eq(A.isDemo, true), isNull(A.suspendedAt), eq(U.email, cfg.email)));
      const fresh = current?.seededAt && deps.now().getTime() - current.seededAt.getTime() < PUBLIC_DEMO_REFRESH_DAYS * 86_400_000;
      if (current && !opts.force && (current.version ?? 0) >= PUBLIC_DEMO_SEED_VERSION && fresh) return 'current';

      const started = Date.now();
      const accountId = await build(deps, cfg, log);
      log.info({ accountId, ms: Date.now() - started }, 'demo account built');
      return 'built';
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Builds a fresh demo and swaps it in. Returns the new account's id. */
async function build(deps: Deps, cfg: { email: string; password: string }, log: Log): Promise<string> {
  // The same server the app talks to, but every outside service is its simulator and every message
  // stays in a local outbox: building the demo calls no portal, no bank and mails nobody.
  const config: Config = {
    ...deps.config,
    LOG_LEVEL: 'silent',
    SMS_PROVIDER: 'log',
    EMAIL_PROVIDER: 'log',
    WHATSAPP_PROVIDER: 'log',
    PUSH_PROVIDER: 'log',
    COMPLIANCE_PROVIDER: 'simulator',
    RETURNS_PROVIDER: 'simulator',
    PAYMENTS_PROVIDER: 'simulator',
    OCR_PROVIDER: 'simulator',
    ASSISTANT_PROVIDER: 'simulator',
    GSTIN_PROVIDER: 'simulator',
    FX_PROVIDER: 'static',
    GST_FILING_ENABLED: true,
  } as Config;
  const quiet = { info: () => {} };
  const sandbox = createProviders(config, quiet, deps.db, deps.now);
  // Files (logos, PDFs) still go to the real store, so they are there when visitors open them.
  const providers = { ...sandbox, storage: deps.providers.storage, pdf: deps.providers.pdf };
  const { buildApp } = await import('../app');
  const app = await buildApp({ ...deps, config, providers }, { logger: false });
  await app.ready();

  const stamp = Date.now().toString(36);
  const buildEmail = `demo-build-${stamp}@example.invalid`;
  let accountId: string | null = null;
  try {
    const signUp = await app.inject({ method: 'POST', url: '/v1/auth/sign-up', payload: { name: 'Demo Owner', email: buildEmail, password: cfg.password } });
    if (signUp.statusCode !== 201) throw new Error(`demo sign-up failed: ${signUp.statusCode} ${signUp.body}`);
    const session = JSON.parse(signUp.body) as { accessToken: string; user: { id: string } };
    const [owner] = await deps.db.select({ accountId: schema.users.accountId }).from(schema.users).where(eq(schema.users.id, session.user.id));
    accountId = owner.accountId;
    // A demo from the first moment: jobs leave it alone, and only the seeder can write to it.
    await deps.db.update(schema.accounts).set({ isDemo: true, name: 'Elixir Books demo' }).where(eq(schema.accounts.id, accountId));
    await deps.db.update(schema.users).set({ name: 'Demo Owner', avatarColor: '#1F6FEB' }).where(eq(schema.users.id, session.user.id));

    const api = new DemoApi(app, session.accessToken);
    const today = businessDate(deps.now());
    // A different set of GSTINs from the demo being replaced (see BuildContext.variant).
    const variant = Math.floor(deps.now().getTime() / 1000) % 9973;
    const built: Built[] = [];
    let team: { accountant: DemoApi; accountantId: string } | null = null;

    for (const profile of PROFILES) {
      const b = await buildBusiness(api, profile, {
        today,
        get team() {
          return team!;
        },
        log: (msg) => log.info({ business: profile.name }, msg),
        variant,
        gstr2b: (sandbox.returns as unknown as { gstr2b: Map<string, Gstr2bEntry[]> }).gstr2b,
        onCompany: async (companyId) => {
          await makeBusiness(deps, companyId, today);
          // The team is invited with the first business; every later one is shared with them as it is made.
          if (!team) team = await inviteTeam(api, app, sandbox.outbox, companyId, stamp);
          else await shareWithTeam(deps, accountId!, companyId);
        },
      });
      built.push(b);
      // The books must hold together exactly as a real business's would; a demo that doesn't is not swapped in.
      const integrity = await api.get<{ checks: { key?: string; label?: string; ok: boolean }[] }>(`/companies/${b.companyId}/books/integrity?from=${addDaysISO(today, -400)}&to=${today}`);
      const failed = integrity.checks.filter((x) => !x.ok);
      if (failed.length) throw new Error(`${b.name}: books integrity failed: ${JSON.stringify(failed).slice(0, 1500)}`);
      log.info({ business: b.name, calls: api.calls }, 'demo business built');
    }

    await backdate(deps, built.map((b) => b.companyId), today);

    // The swap: the new account takes the demo sign-in; the old one is retired in the same moment.
    const previous = (await deps.db.select({ id: schema.accounts.id }).from(schema.accounts).where(and(eq(schema.accounts.isDemo, true), sql`${schema.accounts.id} <> ${accountId}`))).map((a) => a.id);
    await deps.db.transaction(async (tx) => {
      if (previous.length) {
        await tx.update(schema.users).set({ email: sql`'retired-' || ${schema.users.id} || '@example.invalid'` }).where(inArray(schema.users.accountId, previous));
        await tx.update(schema.accounts).set({ suspendedAt: deps.now(), suspendedReason: 'demo replaced' }).where(and(inArray(schema.accounts.id, previous), isNull(schema.accounts.suspendedAt)));
        await tx.update(schema.deviceSessions).set({ revokedAt: deps.now() }).where(and(isNull(schema.deviceSessions.revokedAt), inArray(schema.deviceSessions.userId, tx.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.accountId, previous)))));
      }
      // Anyone already holding the address (an old demo from before is_demo, say) keeps their account; the demo can't take it.
      const [clash] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, cfg.email), sql`${schema.users.accountId} <> ${accountId}`));
      if (clash) throw new Error(`${cfg.email} already belongs to another account; set DEMO_EMAIL to a free address`);
      await tx.update(schema.users).set({ email: cfg.email, emailVerifiedAt: deps.now() }).where(eq(schema.users.id, session.user.id));
      await tx.update(schema.users).set({ email: sql`replace(${schema.users.email}, ${'+' + stamp + '@'}, '@')` }).where(and(eq(schema.users.accountId, accountId!), sql`${schema.users.email} like ${'%+' + stamp + '@%'}`));
      await tx.update(schema.accounts).set({ demoSeedVersion: PUBLIC_DEMO_SEED_VERSION, demoSeededAt: deps.now() }).where(eq(schema.accounts.id, accountId!));
    });
    if (previous.length) await retire(deps, previous, { erase: true }, log);
    return accountId;
  } catch (err) {
    log.error({ err }, 'demo build failed; the previous demo (if any) stays');
    // DEMO_KEEP_FAILED=1 (development) leaves a failed build in place to look at; it stays suspended.
    if (accountId) await retire(deps, [accountId], { erase: process.env.DEMO_KEEP_FAILED !== '1' }, log);
    throw err;
  } finally {
    await app.close();
  }
}

/** The Business plan, as a paid subscription would leave it. */
async function makeBusiness(deps: Deps, companyId: string, today: string) {
  const now = deps.now();
  await deps.db.update(schema.companies).set({ plan: 'business' }).where(eq(schema.companies.id, companyId));
  const start = new Date(`${addDaysISO(today, -120)}T00:00:00+05:30`);
  const end = new Date(`${addDaysISO(today, 245)}T00:00:00+05:30`);
  await deps.db
    .insert(schema.subscriptions)
    .values({ companyId, plan: 'business', cycle: 'yearly', status: 'active', currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: schema.subscriptions.companyId, set: { plan: 'business', cycle: 'yearly', status: 'active', currentPeriodStart: start, currentPeriodEnd: end, updatedAt: now } });
}

/** An accountant, a branch-limited salesperson, a viewer, and someone invited who hasn't joined. */
async function inviteTeam(api: DemoApi, app: Awaited<ReturnType<typeof import('../app').buildApp>>, outbox: { messages: { channel?: string; to?: string; text?: string }[] }, companyId: string, stamp: string) {
  // While the old demo is live its team holds the plain addresses; this one takes them at the swap.
  const during = (email: string) => email.replace('@', `+${stamp}@`);
  const join = async (name: string, plain: string, role: string, branchIds?: string[]) => {
    const email = during(plain);
    await api.post('/users', { name, email, role, companyIds: [companyId], ...(branchIds && { branchIds }) });
    const mail = [...outbox.messages].reverse().find((m) => m.to === email);
    const token = /accept-invite\?token=([\w-]+)/.exec(mail?.text ?? '')?.[1];
    if (!token) throw new Error(`no invite for ${email}`);
    const res = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, payload: { password: `demo-${token.slice(0, 12)}` } });
    if (res.statusCode !== 200) throw new Error(`accept failed for ${email}: ${res.body}`);
    return JSON.parse(res.body) as { accessToken: string; user: { id: string } };
  };
  const branches = (await api.get<{ data: { id: string; isPrimary: boolean }[] }>(`/companies/${companyId}/branches`)).data;
  const accountant = await join('Meera Iyer', 'meera.iyer@example.com', 'accountant');
  await join('Rahul Shetty', 'rahul.shetty@example.com', 'sales', [branches.find((b) => !b.isPrimary)!.id]);
  await join('Farah Khan', 'farah.khan@example.com', 'viewer');
  await api.post('/users', { name: 'Vikram Rao', email: during('vikram.rao@example.com'), role: 'admin', companyIds: [companyId] });
  return { accountant: new DemoApi(app, accountant.accessToken), accountantId: accountant.user.id };
}

/** Gives the team the same businesses as the owner, as an owner would from Settings → Users. */
async function shareWithTeam(deps: Deps, accountId: string, companyId: string) {
  const team = await deps.db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(and(eq(schema.users.accountId, accountId), sql`${schema.users.role} <> 'owner'`));
  if (!team.length) return;
  await deps.db
    .insert(schema.userCompanies)
    .values(team.map((u) => ({ userId: u.id, companyId })))
    .onConflictDoNothing();
}

/**
 * Everything was written today; the records say when it happened. Each row's timestamps move to its
 * own date (mid-morning IST), so the activity feed, "created" columns and audit trail read like six
 * months of real work rather than one busy minute.
 */
async function backdate(deps: Deps, companyIds: string[], today: string) {
  if (!companyIds.length) return;
  const ids = sql.join(companyIds.map((id) => sql`${id}`), sql`, `);
  const at = (col: string) => sql.raw(`((${col})::timestamp + interval '10 hours' + (random() * interval '7 hours')) at time zone 'Asia/Kolkata'`);
  const start = sql`${addDaysISO(today, -205)}::date`;
  await deps.db.execute(sql`update companies set created_at = (${start})::timestamp at time zone 'Asia/Kolkata', updated_at = now(), onboarding_completed_at = (${start})::timestamp at time zone 'Asia/Kolkata' where id in (${ids})`);
  for (const t of ['parties', 'items', 'branches', 'item_categories', 'brands', 'custom_fields', 'vehicles', 'transporters', 'cost_centres', 'ledger_accounts', 'payment_accounts', 'tax_categories', 'expense_categories']) {
    await deps.db.execute(sql`update ${sql.identifier(t)} set created_at = (${start})::timestamp at time zone 'Asia/Kolkata' where company_id in (${ids})`);
  }
  await deps.db.execute(sql`update documents set created_at = ${at('date')}, updated_at = ${at('date')}, finalized_at = case when finalized_at is null then null else ${at('date')} end where company_id in (${ids})`);
  await deps.db.execute(sql`update payments set created_at = ${at('date')}, updated_at = ${at('date')} where company_id in (${ids})`);
  await deps.db.execute(sql`update expenses set created_at = ${at('date')}, updated_at = ${at('date')} where company_id in (${ids})`);
  await deps.db.execute(sql`update vouchers set created_at = ${at('date')}, updated_at = ${at('date')}, posted_at = case when posted_at is null then null else ${at('date')} end where company_id in (${ids})`);
  await deps.db.execute(sql`update stock_movements set created_at = ${at('date')} where company_id in (${ids})`);
  await deps.db.execute(sql`update fixed_assets set created_at = ${at('acquired_on')}, updated_at = ${at('acquired_on')} where company_id in (${ids})`);
  await deps.db.execute(sql`update bank_statements set created_at = ${at('to_date')} where company_id in (${ids})`);
  // The trail follows what it describes.
  for (const [entity, table] of [
    ['document', 'documents'],
    ['payment', 'payments'],
    ['expense', 'expenses'],
    ['voucher', 'vouchers'],
  ] as const) {
    await deps.db.execute(sql`update audit_events a set created_at = x.created_at from ${sql.identifier(table)} x where a.entity_type = ${entity} and a.entity_id = x.id and a.company_id in (${ids})`);
    await deps.db.execute(sql`update notifications n set created_at = x.created_at from ${sql.identifier(table)} x where n.entity_type = ${entity} and n.entity_id = x.id and n.company_id in (${ids})`);
  }
  await deps.db.execute(sql`update audit_events set created_at = (${start})::timestamp at time zone 'Asia/Kolkata' + (random() * interval '3 days') where company_id in (${ids}) and created_at > now() - interval '1 day' and entity_type in ('party', 'item', 'company', 'branch')`);
}

/**
 * Signs everyone on these accounts out and keeps them out. With `erase`, their businesses' records and
 * files are deleted too (the account and user rows stay, marked, as the purge leaves them).
 */
async function retire(deps: Deps, accountIds: string[], opts: { erase: boolean }, log?: Log) {
  // Their addresses are freed, so the next demo can use the same team and sign-in.
  await deps.db.update(schema.users).set({ email: sql`'retired-' || ${schema.users.id} || '@example.invalid'` }).where(and(inArray(schema.users.accountId, accountIds), sql`${schema.users.email} not like 'retired-%'`));
  await deps.db.update(schema.accounts).set({ suspendedAt: deps.now(), suspendedReason: opts.erase ? 'demo replaced' : 'demo switched off' }).where(and(inArray(schema.accounts.id, accountIds), isNull(schema.accounts.suspendedAt)));
  await deps.db
    .update(schema.deviceSessions)
    .set({ revokedAt: deps.now() })
    .where(and(isNull(schema.deviceSessions.revokedAt), inArray(schema.deviceSessions.userId, deps.db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.accountId, accountIds)))));
  if (!opts.erase) return;
  const { purgeAccount } = await import('../modules/platform/purge');
  for (const id of accountIds) {
    try {
      await purgeAccount(deps, id, { dryRun: false });
    } catch (err) {
      log?.warn({ err, accountId: id }, 'old demo account not fully erased; it stays suspended');
    }
  }
}
