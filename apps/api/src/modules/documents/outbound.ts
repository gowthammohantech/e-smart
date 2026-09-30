import { and, eq, gt } from 'drizzle-orm';
import i18n from '@esmart/i18n';
import type { LanguageCode } from '@esmart/i18n/config';
import { buildDocumentHtml } from '@esmart/core/render/documentHtml';
import type { Branch, EwayBill } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { conflict, invalid } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { addressFrom } from '../../lib/wire';
import { companyCore, partyCore, type DocRow } from './engine';
import { effectiveStatus, today } from './lifecycle';
import { documentsToWire, toCoreDocument } from './wire';

const SHARE_LINK_DAYS = 30;
const PAYMENT_LINK_DAYS = 30;

const COPY_LABEL = { original: '', duplicate: 'DUPLICATE FOR TRANSPORTER', triplicate: 'TRIPLICATE FOR SUPPLIER' } as const;

/** `INV/26-27/0004` → `INV-26-27-0004.pdf`. */
export const pdfFilename = (number: string) => `${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

/**
 * The document as the app prints it: the same `buildDocumentHtml` template
 * from `@esmart/core`, rendered to PDF by the configured provider.
 */
export async function renderDocumentPdf(
  db: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  row: DocRow,
  opts: { now: Date; locale?: LanguageCode; copy?: keyof typeof COPY_LABEL },
): Promise<Buffer> {
  const [doc] = await documentsToWire(db, [row], opts.now, company.baseCurrency.trim());
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, row.partyId));
  const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.id, row.branchId));
  const eway = row.currentEwayBillId ? await db.select().from(schema.ewayBills).where(eq(schema.ewayBills.id, row.currentEwayBillId)) : [];
  const language: LanguageCode = opts.locale ?? 'en';
  const coreBranch: Branch | undefined = branch
    ? { id: branch.id, companyId: branch.companyId, name: branch.name, code: branch.code, address: addressFrom(branch, 'address')!, isPrimary: branch.isPrimary, phone: branch.phone ?? undefined, gstin: branch.gstin ?? undefined }
    : undefined;
  const ewayBill = eway[0]
    ? ({ ewayBillNumber: eway[0].ewayBillNumber.trim(), validUpto: eway[0].validUpto.toISOString() } as EwayBill)
    : undefined;
  let html = buildDocumentHtml({
    document: toCoreDocument(doc),
    company: companyCore(company),
    party: party ? partyCore(party) : undefined,
    branch: coreBranch,
    ewayBill,
    t: i18n.getFixedT(language),
    language,
  });
  const copy = COPY_LABEL[opts.copy ?? 'original'];
  if (copy) html = html.replace('<div class="head">', `<div class="muted" style="text-align:right;font-weight:700">${copy}</div><div class="head">`);
  return deps.providers.pdf.render(html);
}

/** A public, expiring link to the document. Only a hash of the token is stored. */
export async function createShareLinkFor(db: DbOrTx, deps: Deps, actor: AuthUser, row: DocRow, now: Date) {
  const token = randomToken(24);
  const expiresAt = new Date(now.getTime() + SHARE_LINK_DAYS * 86_400_000);
  const id = newId('shl');
  await db.insert(schema.shareLinks).values({ id, companyId: row.companyId, documentId: row.id, tokenHash: sha256(token), expiresAt, createdBy: actor.id });
  await recordChange(db, actor, { companyId: row.companyId, action: 'created', entityType: 'share_link', entityId: id, entityLabel: row.number, version: 1 });
  return { url: `${deps.config.PUBLIC_BASE_URL.replace(/\/+$/, '')}/share/${token}`, expiresAt };
}

/**
 * A gateway payment link for what is still owed on an invoice (or part of
 * it). An active link for the same amount is reused rather than minting
 * another one the customer might also pay.
 */
export async function paymentLinkFor(
  db: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  actor: AuthUser,
  row: DocRow,
  now: Date,
  amountMinor?: number,
): Promise<typeof schema.paymentLinks.$inferSelect> {
  const status = effectiveStatus(row, today(now));
  if (row.kind !== 'invoice' || ['draft', 'cancelled', 'paid'].includes(status)) {
    throw conflict('DOCUMENT_NOT_PAYABLE', 'Payment links are for issued invoices with an amount outstanding');
  }
  const outstanding = row.grandTotalMinor - row.amountPaidMinor;
  const amount = amountMinor ?? outstanding;
  if (!(amount > 0)) throw invalid('amount.minor', 'Must be more than zero');
  if (amount > outstanding) throw invalid('amount.minor', `Cannot exceed the outstanding ${outstanding}`, 'AMOUNT_EXCEEDS_OUTSTANDING');

  const L = schema.paymentLinks;
  const [reuse] = await db
    .select()
    .from(L)
    .where(and(eq(L.documentId, row.id), eq(L.status, 'active'), eq(L.amountMinor, amount), gt(L.expiresAt, now)))
    .limit(1);
  if (reuse) return reuse;

  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, row.partyId));
  const currency = row.currency.trim();
  const link = await deps.providers.payments.createPaymentLink({
    amountMinor: amount,
    currency,
    description: `${company.name}: ${row.number}`,
    referenceId: row.number,
    customer: party ? { name: party.name, email: party.email ?? undefined, phone: party.phone ?? undefined } : undefined,
    expiresAt: new Date(now.getTime() + PAYMENT_LINK_DAYS * 86_400_000),
    notes: { companyId: row.companyId, documentId: row.id },
    payeeName: company.name,
  });
  const [created] = await db
    .insert(L)
    .values({
      id: newId('pln'),
      companyId: row.companyId,
      documentId: row.id,
      provider: deps.providers.payments.name === 'simulator' ? 'simulator' : 'razorpay',
      providerLinkId: link.id,
      url: link.url,
      upiUri: link.upiUri ?? null,
      amountMinor: amount,
      currency,
      expiresAt: link.expiresAt ?? null,
      createdBy: actor.id,
    })
    .returning();
  await recordChange(db, actor, { companyId: row.companyId, action: 'created', entityType: 'payment_link', entityId: created.id, entityLabel: row.number, version: 1 });
  return created;
}
