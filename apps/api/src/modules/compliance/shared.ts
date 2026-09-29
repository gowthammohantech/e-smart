import { and, eq, or } from 'drizzle-orm';
import { defaultComplianceSettings } from '@esmart/core/data/seed';
import { isValidTransporterId, normalizeGstin } from '@esmart/core/domain/gstin';
import type { BusinessDocument, ComplianceIssue, ComplianceSettings, Item } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { Config } from '../../config';
import type { AuthUser, CompanyRow } from '../../context';
import { invalid, notFound, upstream } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { decrypt } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { compact, iso, money } from '../../lib/wire';
import type { PortalCredentials } from '../../providers/compliance';
import { assertKindAllowed, type DocRow } from '../documents/engine';
import { documentsToWire, toCoreDocument } from '../documents/wire';

const D = schema.documents;
const S = schema.complianceSettings;
const TR = schema.transporters;

export type SettingsRow = typeof S.$inferSelect;
export type TransporterRow = typeof TR.$inferSelect;

const branchVisible = (user: AuthUser, branchId: string) => !user.branchIds.length || user.branchIds.includes(branchId);

/** A document in the caller's company and branches, or 404; optionally locked for the rest of the transaction. */
export async function findDocument(db: DbOrTx, company: CompanyRow, user: AuthUser, id: string, opts: { lock?: boolean } = {}): Promise<DocRow> {
  const q = db.select().from(D).where(and(eq(D.companyId, company.id), eq(D.id, id)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row || !branchVisible(user, row.branchId)) throw notFound('Document');
  assertKindAllowed(company, row.kind);
  return row;
}

export { branchVisible };

/**
 * The company's settings row. Companies get one at creation; one created
 * before that existed gets the core defaults the first time it is read.
 */
export async function loadSettings(db: DbOrTx, company: CompanyRow): Promise<SettingsRow> {
  const [row] = await db.select().from(S).where(eq(S.companyId, company.id));
  if (row) return row;
  const currency = company.baseCurrency.trim();
  const c = defaultComplianceSettings(company.id, currency);
  const gst = company.taxRegime === 'GST' && company.country.trim() === 'IN';
  await db
    .insert(S)
    .values({
      companyId: company.id,
      einvoiceEnabled: gst && c.eInvoiceEnabled,
      annualTurnoverMinor: c.annualTurnover.minor,
      einvoiceTurnoverThresholdMinor: c.eInvoiceTurnoverThreshold.minor,
      currency,
      reportingWindowDays: c.reportingWindowDays,
      ewayBillEnabled: gst && c.ewayBillEnabled,
      ewayBillThresholdMinor: c.ewayBillThreshold.minor,
      defaultDistanceKm: c.defaultDistanceKm,
    })
    .onConflictDoNothing();
  const [created] = await db.select().from(S).where(eq(S.companyId, company.id));
  return created;
}

export async function transporterById(db: DbOrTx, id: string | null): Promise<TransporterRow | undefined> {
  if (!id) return undefined;
  const [row] = await db.select().from(TR).where(eq(TR.id, id));
  return row;
}

/**
 * The transporter a request names, by our id or by its GSTIN / TRANSIN (the
 * app sends the GSTIN). One the company hasn't saved yet is added to its
 * transporters, since the e-way bill must point at a row.
 */
export async function resolveTransporter(
  db: DbOrTx,
  actor: AuthUser,
  companyId: string,
  ref: string,
  name: string | undefined,
  field: string,
): Promise<TransporterRow> {
  const gstin = normalizeGstin(ref);
  const [found] = await db
    .select()
    .from(TR)
    .where(and(eq(TR.companyId, companyId), or(eq(TR.id, ref), eq(TR.transporterId, gstin))));
  if (found) return found;
  if (!isValidTransporterId(gstin)) throw invalid(field, 'Not a saved transporter, nor a valid GSTIN or TRANSIN');
  const [created] = await db
    .insert(TR)
    .values({ id: newId('trn'), companyId, name: (name?.trim() || gstin).slice(0, 200), transporterId: gstin })
    .returning();
  await recordChange(db, actor, { companyId, action: 'created', entityType: 'transporter', entityId: created.id, entityLabel: created.name, version: created.version });
  return created;
}

/** The settings as `@esmart/core` takes them. */
export function settingsCore(row: SettingsRow, transporter?: TransporterRow): ComplianceSettings {
  const currency = row.currency.trim();
  return {
    companyId: row.companyId,
    eInvoiceEnabled: row.einvoiceEnabled,
    annualTurnover: money(row.annualTurnoverMinor, currency),
    eInvoiceTurnoverThreshold: money(row.einvoiceTurnoverThresholdMinor, currency),
    reportingWindowDays: row.reportingWindowDays,
    autoGenerateEInvoiceOnFinalise: row.autoGenerateEinvoiceOnFinalise,
    irpUsername: row.irpUsername ?? undefined,
    irpClientIdMasked: row.irpClientIdMasked ?? undefined,
    irpEnvironment: row.irpEnvironment,
    ewayBillEnabled: row.ewayBillEnabled,
    ewayBillThreshold: money(row.ewayBillThresholdMinor, currency),
    autoGenerateEwayBillOnFinalise: row.autoGenerateEwayBillOnFinalise,
    defaultTransporterId: transporter?.transporterId,
    defaultTransporterName: transporter?.name,
    defaultDistanceKm: row.defaultDistanceKm,
    defaultTransportMode: row.defaultTransportMode,
    defaultVehicleType: row.defaultVehicleType,
    updatedAt: iso(row.updatedAt)!,
  };
}

/** `defaultTransporterId` on the wire is the transporter's GSTIN, as the app keeps it. */
export function settingsToWire(row: SettingsRow, transporter?: TransporterRow): Schema<'ComplianceSettings'> {
  return compact({ ...settingsCore(row, transporter), irpClientIdMasked: row.irpClientIdMasked });
}

/** The document as core's e-invoice and e-way bill rules see it: lines, totals, tax lines, compliance. */
export async function coreDocument(db: DbOrTx, company: CompanyRow, row: DocRow, now: Date): Promise<BusinessDocument> {
  const [doc] = await documentsToWire(db, [row], now, company.baseCurrency.trim());
  return toCoreDocument(doc);
}

export async function companyItems(db: DbOrTx, companyId: string): Promise<Item[]> {
  const rows = await db.select().from(schema.items).where(eq(schema.items.companyId, companyId));
  return rows.map((i) => ({ id: i.id, name: i.name, type: i.type, hsnCode: i.hsnCode ?? undefined, unit: i.unit }) as Item);
}

/** The stored portal credentials, decrypted for one call, or null when none are stored. */
export async function portalCredentials(db: DbOrTx, config: Config, company: CompanyRow): Promise<PortalCredentials | null> {
  const [row] = await db.select().from(schema.complianceCredentials).where(eq(schema.complianceCredentials.companyId, company.id));
  const [settings] = await db.select({ username: S.irpUsername }).from(S).where(eq(S.companyId, company.id));
  if (!row) return null;
  const open = (b: Buffer) => decrypt(b, config.CREDENTIALS_KEY);
  return {
    environment: row.environment,
    gspProvider: row.gspProvider ?? undefined,
    gstin: company.taxIdentifier ?? '',
    username: settings?.username ?? '',
    password: open(row.passwordEncrypted),
    clientId: open(row.clientIdEncrypted) || undefined,
    clientSecret: open(row.clientSecretEncrypted) || undefined,
  };
}

/** A portal rejection: 502 with the portal's codes in `issues[]`. */
export function portalRejected(errors: ComplianceIssue[], code = 'PORTAL_REJECTED') {
  return upstream(code, errors[0]?.message ?? 'The portal rejected the request', errors as Schema<'ComplianceIssue'>[]);
}

/**
 * Records that a document's compliance changed (IRN, e-way bill): its
 * version moves on, so an open copy's `If-Match` goes stale and /sync/pull
 * picks it up. Callers hold the row lock.
 */
export async function touchDocument(
  tx: DbOrTx,
  actor: AuthUser,
  row: DocRow,
  now: Date,
  patch: Partial<Pick<DocRow, 'currentEwayBillId' | 'complianceLastMessage' | 'complianceLastAttemptAt'>>,
  change: { action: string; after?: unknown; before?: unknown },
): Promise<DocRow> {
  const [updated] = await tx
    .update(D)
    .set({ ...patch, version: row.version + 1, updatedAt: now })
    .where(eq(D.id, row.id))
    .returning();
  await recordChange(tx, actor, { companyId: row.companyId, action: change.action, entityType: 'document', entityId: row.id, entityLabel: row.number, version: updated.version, before: change.before, after: change.after });
  return updated;
}
