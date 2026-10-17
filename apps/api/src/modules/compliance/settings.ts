import { and, eq, sql } from 'drizzle-orm';
import { EWAY_MAX_DISTANCE_KM } from '@esmart/core/domain/ewayBill';
import { schema } from '@esmart/db';
import type { Issue } from '../../http/errors';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { preconditionFailed, unprocessable } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { encrypt, mask } from '../../lib/crypto';
import { loadSettings, portalCredentials, resolveTransporter, settingsToWire, transporterById } from './shared';

const S = schema.complianceSettings;
const CR = schema.complianceCredentials;

/** Where the key that sealed a credential lives; a KMS key ARN once envelope encryption moves there. */
const KEY_ID = 'local:CREDENTIALS_KEY:aes-256-gcm';

/** `mask` keeps the length; the column holds 40. */
function maskedClientId(clientId: string): string {
  const m = mask(clientId);
  return m.length <= 40 ? m : `${clientId.slice(0, 4)}${'•'.repeat(8)}${clientId.slice(-4)}`;
}

/**
 * Compliance settings: getComplianceSettings, saveComplianceSettings,
 * saveComplianceCredentials, testComplianceConnection.
 */
export const settingsHandlers = defineHandlers({
  async getComplianceSettings(ctx) {
    const row = await loadSettings(ctx.db, ctx.company);
    setEtag(ctx.reply, row.version);
    return settingsToWire(row, await transporterById(ctx.db, row.defaultTransporterId));
  },

  /** A PUT of the whole form; a field left out keeps its value. */
  async saveComplianceSettings(ctx) {
    const current = await loadSettings(ctx.db, ctx.company);
    checkIfMatch(ctx.req, current.version);
    const b = ctx.body;
    const currency = current.currency.trim();
    const issues: Issue[] = [];
    for (const [field, m] of [
      ['annualTurnover', b.annualTurnover],
      ['eInvoiceTurnoverThreshold', b.eInvoiceTurnoverThreshold],
      ['ewayBillThreshold', b.ewayBillThreshold],
    ] as const) {
      if (m && m.currency !== currency) issues.push({ field: `${field}.currency`, message: `Must be in ${currency}`, severity: 'blocking' });
      if (m && m.minor < 0) issues.push({ field, message: 'Cannot be negative', severity: 'blocking' });
    }
    if (b.reportingWindowDays !== undefined && !(b.reportingWindowDays >= 1 && b.reportingWindowDays <= 365)) {
      issues.push({ field: 'reportingWindowDays', message: 'Between 1 and 365 days', severity: 'blocking' });
    }
    if (b.defaultDistanceKm !== undefined && !(b.defaultDistanceKm >= 0 && b.defaultDistanceKm <= EWAY_MAX_DISTANCE_KM)) {
      issues.push({ field: 'defaultDistanceKm', message: `Between 0 and ${EWAY_MAX_DISTANCE_KM} km`, severity: 'blocking' });
    }
    if (issues.length) throw unprocessable(issues);

    const { row, transporter } = await ctx.db.transaction(async (tx) => {
      let defaultTransporterId = current.defaultTransporterId;
      if (b.defaultTransporterId !== undefined) {
        defaultTransporterId = b.defaultTransporterId.trim()
          ? (await resolveTransporter(tx, ctx.user, ctx.company.id, b.defaultTransporterId.trim(), b.defaultTransporterName, 'defaultTransporterId')).id
          : null;
      }
      const [updated] = await tx
        .update(S)
        .set({
          einvoiceEnabled: b.eInvoiceEnabled ?? current.einvoiceEnabled,
          annualTurnoverMinor: b.annualTurnover?.minor ?? current.annualTurnoverMinor,
          einvoiceTurnoverThresholdMinor: b.eInvoiceTurnoverThreshold?.minor ?? current.einvoiceTurnoverThresholdMinor,
          reportingWindowDays: b.reportingWindowDays ?? current.reportingWindowDays,
          autoGenerateEinvoiceOnFinalise: b.autoGenerateEInvoiceOnFinalise ?? current.autoGenerateEinvoiceOnFinalise,
          irpUsername: b.irpUsername !== undefined ? b.irpUsername.trim() || null : current.irpUsername,
          irpEnvironment: b.irpEnvironment ?? current.irpEnvironment,
          ewayBillEnabled: b.ewayBillEnabled ?? current.ewayBillEnabled,
          ewayBillThresholdMinor: b.ewayBillThreshold?.minor ?? current.ewayBillThresholdMinor,
          autoGenerateEwayBillOnFinalise: b.autoGenerateEwayBillOnFinalise ?? current.autoGenerateEwayBillOnFinalise,
          defaultTransporterId,
          defaultDistanceKm: b.defaultDistanceKm ?? current.defaultDistanceKm,
          defaultTransportMode: b.defaultTransportMode ?? current.defaultTransportMode,
          defaultVehicleType: b.defaultVehicleType ?? current.defaultVehicleType,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(and(eq(S.companyId, ctx.company.id), eq(S.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      const t = await transporterById(tx, updated.defaultTransporterId);
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'compliance_settings',
        entityId: ctx.company.id,
        entityLabel: 'E-invoicing & e-way bill',
        version: updated.version,
        before: settingsToWire(current),
        after: settingsToWire(updated, t),
      });
      return { row: updated, transporter: t };
    });
    setEtag(ctx.reply, row.version);
    return settingsToWire(row, transporter);
  },

  /**
   * Write-only. Each secret is sealed with AES-256-GCM under
   * `CREDENTIALS_KEY`; only the username and a masked client id reach the
   * settings, and nothing secret is ever returned. A secret left out keeps
   * the one already stored.
   */
  async saveComplianceCredentials(ctx) {
    const b = ctx.body;
    const key = ctx.deps.config.CREDENTIALS_KEY;
    const current = await loadSettings(ctx.db, ctx.company);
    await ctx.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(CR).where(eq(CR.companyId, ctx.company.id)).for('update');
      const sealed = {
        environment: b.environment,
        gspProvider: b.gspProvider?.trim().slice(0, 40) || null,
        passwordEncrypted: encrypt(b.password, key),
        clientIdEncrypted: b.clientId !== undefined || !existing ? encrypt(b.clientId ?? '', key) : existing.clientIdEncrypted,
        clientSecretEncrypted: b.clientSecret !== undefined || !existing ? encrypt(b.clientSecret ?? '', key) : existing.clientSecretEncrypted,
        kmsKeyId: KEY_ID,
        // New credentials invalidate the cached session and the last test.
        authTokenEncrypted: null,
        authTokenExpiresAt: null,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: ctx.now,
      };
      if (existing) await tx.update(CR).set(sealed).where(eq(CR.companyId, ctx.company.id));
      else await tx.insert(CR).values({ companyId: ctx.company.id, ...sealed });

      const [updated] = await tx
        .update(S)
        .set({
          irpUsername: b.username.trim().slice(0, 100),
          irpEnvironment: b.environment,
          irpClientIdMasked: b.clientId ? maskedClientId(b.clientId) : b.clientId === '' ? null : current.irpClientIdMasked,
          version: sql`${S.version} + 1`,
          updatedAt: ctx.now,
        })
        .where(eq(S.companyId, ctx.company.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated credentials',
        entityType: 'compliance_settings',
        entityId: ctx.company.id,
        entityLabel: 'E-invoicing & e-way bill',
        version: updated.version,
        after: { environment: b.environment, gspProvider: b.gspProvider, username: updated.irpUsername, irpClientIdMasked: updated.irpClientIdMasked },
      });
    });
    return undefined;
  },

  async testComplianceConnection(ctx) {
    const creds = await portalCredentials(ctx.db, ctx.deps.config, ctx.company);
    const result = await ctx.deps.providers.compliance.testConnection(creds);
    if (creds) {
      await ctx.db.update(CR).set({ lastTestedAt: ctx.now, lastTestOk: result.irp.ok && result.ewb.ok }).where(eq(CR.companyId, ctx.company.id));
    }
    return result;
  },
});
