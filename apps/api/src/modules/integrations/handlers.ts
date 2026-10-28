import { randomBytes } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type Deps } from '../../context';
import { notFound, planUpgradeRequired } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { encrypt } from '../../lib/crypto';
import { compact } from '../../lib/wire';

const INT = schema.integrations;
const CI = schema.companyIntegrations;
type IntegrationRow = typeof INT.$inferSelect;
type Tier = Schema<'PlanTier'>;

/**
 * The two government portals are not a free switch. They are connected when a login is stored for them *and*
 * the portal is switched on (`compliance_settings.einvoice_enabled` / `eway_bill_enabled`, the same flag the
 * e-invoicing screen and the compliance rules read). A flag alone could say "connected" for a business that never
 * entered a login, so without one the switch cannot turn on; the app sends the user to enter it instead.
 * Switching off keeps the login, so switching back on needs no retyping.
 */
const PORTAL_OF: Record<string, 'einvoice' | 'ewaybill'> = { int_einvoice: 'einvoice', int_eway: 'ewaybill' };

async function portalState(db: Deps['db'], company: { id: string }) {
  const CR = schema.complianceCredentials;
  const S = schema.complianceSettings;
  const stored = new Set((await db.select({ portal: CR.portal }).from(CR).where(eq(CR.companyId, company.id))).map((r) => r.portal));
  const [flags] = await db.select({ einvoice: S.einvoiceEnabled, ewaybill: S.ewayBillEnabled }).from(S).where(eq(S.companyId, company.id));
  return {
    stored,
    connected: (portal: 'einvoice' | 'ewaybill') => stored.has(portal) && !!flags?.[portal],
  };
}

async function setPortalEnabled(tx: Parameters<Parameters<Deps['db']['transaction']>[0]>[0], ctx: { user: Parameters<typeof recordChange>[1]; now: Date }, companyId: string, portal: 'einvoice' | 'ewaybill', enabled: boolean, label: string) {
  const S = schema.complianceSettings;
  const [updated] = await tx
    .update(S)
    .set({ ...(portal === 'einvoice' ? { einvoiceEnabled: enabled } : { ewayBillEnabled: enabled }), version: sql`${S.version} + 1`, updatedAt: ctx.now })
    .where(eq(S.companyId, companyId))
    .returning({ version: S.version });
  if (!updated) return;
  await recordChange(tx, ctx.user, {
    companyId,
    action: enabled ? 'connected' : 'disconnected',
    entityType: 'compliance_settings',
    entityId: companyId,
    entityLabel: label,
    version: updated.version,
    after: { portal, enabled },
  });
}

const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, pro: 2, business: 3 };

/** Config keys that are secrets: encrypted at rest, never stored in `config` or returned. */
const SECRET_KEY = /secret|password|token|api_?key|auth_?key|private_?key/i;

/** Connected through the provider's consent screen unless credentials are supplied directly. */
const OAUTH: Record<string, (deps: Deps, state: string) => string> = {
  int_drive: (deps, state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      response_type: 'code',
      access_type: 'offline',
      scope: 'https://www.googleapis.com/auth/drive.file',
      redirect_uri: `${deps.config.PUBLIC_BASE_URL}/v1/oauth/google-drive/callback`,
      state,
    })}`,
  int_razorpay: (deps, state) =>
    `https://auth.razorpay.com/authorize?${new URLSearchParams({
      response_type: 'code',
      scope: 'read_write',
      redirect_uri: `${deps.config.PUBLIC_BASE_URL}/v1/oauth/razorpay/callback`,
      state,
    })}`,
};

function integrationToWire(row: IntegrationRow, connected: boolean): Schema<'Integration'> {
  return compact({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    category: row.category,
    connected,
    configRoute: row.configRoute,
  });
}

function splitConfig(config: Record<string, unknown>) {
  const plain: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) (SECRET_KEY.test(k) ? secrets : plain)[k] = v;
  return { plain, secrets };
}

async function findIntegration(db: Deps['db'], id: string): Promise<IntegrationRow> {
  const [row] = await db.select().from(INT).where(eq(INT.id, id));
  if (!row) throw notFound('Integration');
  return row;
}

/** Integrations: listIntegrations, connectIntegration, disconnectIntegration. */
export const integrationsHandlers = defineHandlers({
  async listIntegrations(ctx) {
    const rows = await ctx.db
      .select({ i: INT, connected: CI.connected })
      .from(INT)
      .leftJoin(CI, and(eq(CI.integrationId, INT.id), eq(CI.companyId, ctx.company.id)))
      .orderBy(asc(INT.category), asc(INT.name));
    const portals = await portalState(ctx.db, ctx.company);
    return { data: rows.map((r) => integrationToWire(r.i, PORTAL_OF[r.i.id] ? portals.connected(PORTAL_OF[r.i.id]) : !!r.connected)) };
  },

  /**
   * Plain settings go to `config`; anything secret-looking is encrypted into
   * `credentials_encrypted`. An OAuth provider without credentials in the
   * body stays disconnected and gets an `authorizeUrl`; the provider's
   * callback completes it.
   */
  async connectIntegration(ctx) {
    const integration = await findIntegration(ctx.db, ctx.params.integrationId);
    if (TIER_RANK[ctx.company.plan] < TIER_RANK[integration.minPlan]) throw planUpgradeRequired(integration.minPlan, integration.name);
    // A portal switches on only once it has a login. Without one it stays off, and the app opens the screen to
    // enter it.
    const portal = PORTAL_OF[integration.id];
    if (portal) {
      if (!(await portalState(ctx.db, ctx.company)).stored.has(portal)) return { integration: integrationToWire(integration, false) };
      await ctx.db.transaction((tx) => setPortalEnabled(tx, ctx, ctx.company.id, portal, true, integration.name));
      return { integration: integrationToWire(integration, true) };
    }
    const { plain, secrets } = splitConfig(ctx.body?.config ?? {});
    const hasSecrets = Object.keys(secrets).length > 0;
    const oauth = OAUTH[integration.id];
    const pending = !!oauth && !hasSecrets;
    const state = pending ? randomBytes(16).toString('base64url') : null;
    const config = state ? { ...plain, oauthState: state } : plain;
    const credentials = hasSecrets ? encrypt(JSON.stringify(secrets), ctx.deps.config.CREDENTIALS_KEY) : null;

    await ctx.db.transaction(async (tx) => {
      const values = {
        connected: !pending,
        config,
        credentialsEncrypted: credentials,
        connectedBy: ctx.user.id,
        connectedAt: pending ? null : ctx.now,
        disconnectedAt: null,
      };
      await tx
        .insert(CI)
        .values({ companyId: ctx.company.id, integrationId: integration.id, ...values })
        .onConflictDoUpdate({ target: [CI.companyId, CI.integrationId], set: values });
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: pending ? 'authorization started' : 'connected',
        entityType: 'integration',
        entityId: integration.id,
        entityLabel: integration.name,
        version: 1,
        after: { connected: !pending, config: plain },
      });
    });
    return compact({
      integration: integrationToWire(integration, !pending),
      authorizeUrl: pending ? oauth(ctx.deps, state!) : undefined,
    });
  },

  /** Credentials are wiped; plain settings are kept for a later reconnect. (A government portal keeps its login.) */
  async disconnectIntegration(ctx) {
    const integration = await findIntegration(ctx.db, ctx.params.integrationId);
    const portal = PORTAL_OF[integration.id];
    await ctx.db.transaction(async (tx) => {
      // Switching a portal off keeps its login; only the flag the compliance rules read goes down.
      if (portal) await setPortalEnabled(tx, ctx, ctx.company.id, portal, false, integration.name);
      const rows = await tx
        .update(CI)
        .set({ connected: false, credentialsEncrypted: null, disconnectedAt: ctx.now })
        .where(and(eq(CI.companyId, ctx.company.id), eq(CI.integrationId, integration.id)))
        .returning({ id: CI.integrationId });
      if (rows.length) {
        await recordChange(tx, ctx.user, {
          companyId: ctx.company.id,
          action: 'disconnected',
          entityType: 'integration',
          entityId: integration.id,
          entityLabel: integration.name,
          version: 1,
          after: { connected: false },
        });
      }
    });
    return integrationToWire(integration, false);
  },
});
