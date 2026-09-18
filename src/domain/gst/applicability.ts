/**
 * Whether a document needs an e-invoice at all, and why.
 *
 * The reason string is part of the answer, not decoration: the screens print
 * it verbatim, so the prototype explains the rule rather than just refusing.
 */

import { BusinessDocument, Company, Party } from '@/types';
import { isFinalized } from '@/domain/documentStates';
import { docTypeFor } from './einvoice/buildPayload';
import { resolveSupplyType } from './supplyType';

export type Applicability = { applicable: boolean; reason: string };

/** e-Invoicing is mandatory once annual aggregate turnover reaches ₹5 crore. */
export const EINVOICE_TURNOVER_SLABS = ['5crTo10cr', '10crTo50cr', 'over50cr'];

export function eInvoiceApplicability(args: {
  company: Company;
  party: Party;
  doc: BusinessDocument;
}): Applicability {
  const { company, party, doc } = args;
  const reg = company.taxRegistration;

  if (reg?.regime !== 'GST' || !reg.registered) {
    return { applicable: false, reason: 'The business is not registered under GST.' };
  }
  if (reg.compositionScheme) {
    return {
      applicable: false,
      reason: 'A business under the composition scheme does not issue e-invoices.',
    };
  }
  if (reg.eInvoiceEnabled === false) {
    return { applicable: false, reason: 'e-Invoicing is switched off in GST settings.' };
  }
  if (reg.turnoverSlab && !EINVOICE_TURNOVER_SLABS.includes(reg.turnoverSlab)) {
    return {
      applicable: false,
      reason: 'Annual turnover is under ₹5 crore, so e-invoicing does not apply yet.',
    };
  }
  if (!docTypeFor(doc.kind)) {
    return {
      applicable: false,
      reason: 'Only tax invoices and credit notes are reported to the IRP.',
    };
  }
  const supplyType = resolveSupplyType({
    registrationType: party.gstRegistrationType,
    buyerGstin: party.taxId,
  });
  if (supplyType === 'B2C') {
    return {
      applicable: false,
      reason: 'The buyer is unregistered — e-invoicing does not apply to B2C supplies.',
    };
  }
  if (!isFinalized(doc.status)) {
    return { applicable: false, reason: 'The document has to be issued before it can be reported.' };
  }
  if (doc.status === 'cancelled') {
    return { applicable: false, reason: 'The document is cancelled.' };
  }

  return { applicable: true, reason: `Reportable as a ${supplyType} supply.` };
}
