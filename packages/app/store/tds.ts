import { money } from '@esmart/core/lib/money';
import { expectedSaleTds, tdsFor, tdsPriorOnDevice } from '@esmart/core/domain/tds';
import { panOfGstin } from '@esmart/core/domain/gstin';
import type { BusinessDocument, Company, Party, Payment } from '@esmart/core/types';

/**
 * TDS the business keeps back on a supplier's bill, as the server works it out (apps/api/src/lib/tds.ts),
 * from the bills on the device. Only for a company with a TAN. Shared by the store and the editor's preview.
 */
export function tdsForDocument(
  doc: Pick<BusinessDocument, 'id' | 'kind' | 'partyId' | 'date' | 'currency' | 'exchangeRate' | 'totals' | 'tdsSection' | 'sourceDocumentId'>,
  ctx: { company: Company | undefined; parties: Party[]; documents: BusinessDocument[]; payments?: Payment[] },
): BusinessDocument['tds'] {
  const { company, parties, documents } = ctx;
  if (!company?.tan) return undefined;
  const baseCurrency = company.baseCurrency;
  const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate || 1;
  if (doc.kind === 'supplierCreditNote') {
    // A credit note gives back TDS at the rate its bill was taxed at.
    const source = documents.find((d) => d.id === doc.sourceDocumentId);
    if (!source?.tds) return undefined;
    return { section: source.tds.section, rate: source.tds.rate, amount: money(Math.round((doc.totals.taxableAmount.minor * source.tds.rate) / 100), doc.currency) };
  }
  const party = parties.find((p) => p.id === doc.partyId);
  if (!party || (doc.kind !== 'purchaseBill' && doc.kind !== 'supplierDebitNote')) return undefined;
  const section = doc.tdsSection === 'none' ? undefined : (doc.tdsSection ?? party.tdsSection);
  if (!section) return undefined;
  const baseMinor = Math.round(doc.totals.taxableAmount.minor * rate);
  const prior = tdsPriorOnDevice(documents, parties, party, section, doc.date, baseCurrency, doc.id);
  // Kept back already under this section on payments allocated to this bill: not again (as the server).
  const deductedOnPaymentsMinor = (ctx.payments ?? [])
    .filter((p) => p.direction === 'paid' && p.tdsSection === section)
    .reduce((a, p) => a + p.allocations.filter((x) => x.documentId === doc.id).reduce((b, x) => b + (x.tdsDeducted?.minor ?? 0), 0), 0);
  // A certificate is for its own section, else the supplier's default one (as the server reads it).
  const cert = party.lowerTdsCertificate;
  const certificate = cert ? { ...cert, section: cert.section ?? party.tdsSection } : undefined;
  const r = tdsFor({ section, pan: party.pan, certificate, date: doc.date, baseMinor, prior, deductedOnPaymentsMinor });
  return r.amountMinor > 0 ? { section, rate: r.rate, amount: money(Math.round(r.amountMinor / rate), doc.currency) } : undefined;
}

/**
 * On an invoice: TDS the customer is expected to deduct, as the server works it out (RULES 4.14):
 * the rate asked for or the section's, on the taxable value. Not posted; the total is unchanged.
 */
export function expectedTdsForDocument(
  doc: Pick<BusinessDocument, 'kind' | 'partyId' | 'date' | 'currency' | 'exchangeRate' | 'totals' | 'tdsSection' | 'tdsRate'>,
  ctx: { company: Company | undefined; parties: Party[] },
): BusinessDocument['tdsExpected'] {
  if (doc.kind !== 'invoice') return undefined;
  const section = doc.tdsSection === 'none' ? undefined : (doc.tdsSection ?? ctx.parties.find((p) => p.id === doc.partyId)?.tdsSection);
  const e = expectedSaleTds({ section, rate: doc.tdsRate, sellerPan: panOfGstin(ctx.company?.taxRegistration?.identifier) || undefined, date: doc.date, baseMinor: doc.totals.taxableAmount.minor });
  return e ? { section: e.section, rate: e.rate, amount: money(e.amountMinor, doc.currency) } : undefined;
}
