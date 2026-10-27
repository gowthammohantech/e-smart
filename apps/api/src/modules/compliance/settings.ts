import { and, eq, sql } from 'drizzle-orm';
import { EWAY_MAX_DISTANCE_KM } from '@esmart/core/domain/ewayBill';
import { schema } from '@esmart/db';
import type { Issue } from '../../http/errors';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { preconditionFailed, unprocessable } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { encrypt } from '../../lib/crypto';
import { loadSettings, portalCredentials, resolveTransporter, settingsToWire, transporterById, type Portal } from './shared';

const S = schema.complianceSettings;
const CR = schema.complianceCredentials;

/** Where the key that sealed a credential lives; a KMS key ARN once envelope encryption moves there. */
const KEY_ID = 'local:CREDENTIALS_KEY:aes-256-gcm';

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
          ewbUsername: b.ewbUsername !== undefined ? b.ewbUsername.trim() || null : current.ewbUsername,
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
   * Write-only. The business gives only a portal username and password, for the e-invoice portal, the e-way
   * bill portal, or both: the two logins need not match, so each is stored on its own row and its own
   * username. The GSP's own client id and secret are ours and come from the environment (`TAXATION_*`), as
   * does the choice of GSP. The password is sealed with AES-256-GCM under `CREDENTIALS_KEY` and never
   * returned. Sandbox or production is the server's too (the gateway it is pointed at), so the business is not
   * asked. Any `environment`, `gspProvider`, `clientId` or `clientSecret` an older client still sends is ignored.
   */
  async saveComplianceCredentials(ctx) {
    const b = ctx.body;
    const key = ctx.deps.config.CREDENTIALS_KEY;
    const gspProvider = ctx.deps.config.TAXATION_GSP_PROVIDER_CODE.slice(0, 40);
    const portals: Portal[] = b.portal === 'einvoice' ? ['einvoice'] : b.portal === 'ewaybill' ? ['ewaybill'] : ['einvoice', 'ewaybill'];
    const username = b.username.trim().slice(0, 100);
    await ctx.db.transaction(async (tx) => {
      // A portal getting its first login is switched on with it: that is what "connected" means. One that already
      // had a login keeps whatever on/off choice was made, so updating a password does not undo a switch-off.
      const had = new Set((await tx.select({ portal: CR.portal }).from(CR).where(eq(CR.companyId, ctx.company.id))).map((r) => r.portal));
      for (const portal of portals) {
        const sealed = {
          gspProvider,
          passwordEncrypted: encrypt(b.password, key),
          clientIdEncrypted: encrypt('', key),
          clientSecretEncrypted: encrypt('', key),
          kmsKeyId: KEY_ID,
          // New credentials invalidate the cached session and the last test.
          authTokenEncrypted: null,
          authTokenExpiresAt: null,
          lastTestedAt: null,
          lastTestOk: null,
          updatedAt: ctx.now,
        };
        await tx
          .insert(CR)
          .values({ companyId: ctx.company.id, portal, ...sealed })
          .onConflictDoUpdate({ target: [CR.companyId, CR.portal], set: sealed });
      }

      const [updated] = await tx
        .update(S)
        .set({
          ...(portals.includes('einvoice') ? { irpUsername: username } : {}),
          ...(portals.includes('ewaybill') ? { ewbUsername: username } : {}),
          ...(portals.includes('einvoice') && !had.has('einvoice') ? { einvoiceEnabled: true } : {}),
          ...(portals.includes('ewaybill') && !had.has('ewaybill') ? { ewayBillEnabled: true } : {}),
          irpClientIdMasked: null,
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
        after: { gspProvider, portals, username },
      });
      // Saving a login is what connects the portal's integration; record it so the integrations list is re-read.
      for (const portal of portals) {
        await recordChange(tx, ctx.user, {
          companyId: ctx.company.id,
          action: 'connected',
          entityType: 'integration',
          entityId: portal === 'einvoice' ? 'int_einvoice' : 'int_eway',
          entityLabel: portal === 'einvoice' ? 'GST e-Invoice (IRP)' : 'E-way bill',
          version: 1,
          after: { connected: true },
        });
      }
    });
    return undefined;
  },

  async testComplianceConnection(ctx) {
    const logins = {
      einvoice: await portalCredentials(ctx.db, ctx.deps.config, ctx.company, 'einvoice'),
      ewaybill: await portalCredentials(ctx.db, ctx.deps.config, ctx.company, 'ewaybill'),
    };
    const result = await ctx.deps.providers.compliance.testConnection(logins);
    for (const [portal, ok] of [['einvoice', result.irp.ok], ['ewaybill', result.ewb.ok]] as const) {
      if (logins[portal]) await ctx.db.update(CR).set({ lastTestedAt: ctx.now, lastTestOk: ok }).where(and(eq(CR.companyId, ctx.company.id), eq(CR.portal, portal)));
    }
    return result;
  },
});
