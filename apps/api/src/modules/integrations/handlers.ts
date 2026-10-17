import { randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
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
    return { data: rows.map((r) => integrationToWire(r.i, !!r.connected)) };
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

  /** Credentials are wiped; plain settings are kept for a later reconnect. */
  async disconnectIntegration(ctx) {
    const integration = await findIntegration(ctx.db, ctx.params.integrationId);
    await ctx.db.transaction(async (tx) => {
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
