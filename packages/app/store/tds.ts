import { money } from '@esmart/core/lib/money';
import { tdsFor, tdsPriorOnDevice } from '@esmart/core/domain/tds';
import type { BusinessDocument, Company, Party } from '@esmart/core/types';

/**
 * TDS the business keeps back on a supplier's bill, as the server works it out (apps/api/src/lib/tds.ts),
 * from the bills on the device. Only for a company with a TAN. Shared by the store and the editor's preview.
 */
export function tdsForDocument(
  doc: Pick<BusinessDocument, 'id' | 'kind' | 'partyId' | 'date' | 'currency' | 'exchangeRate' | 'totals' | 'tdsSection' | 'sourceDocumentId'>,
  ctx: { company: Company | undefined; parties: Party[]; documents: BusinessDocument[] },
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
  const r = tdsFor({ section, pan: party.pan, certificate: party.lowerTdsCertificate, date: doc.date, baseMinor, prior });
  return r.amountMinor > 0 ? { section, rate: r.rate, amount: money(Math.round(r.amountMinor / rate), doc.currency) } : undefined;
}
