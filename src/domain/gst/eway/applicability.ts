/**
 * When a consignment needs an e-way bill.
 *
 * The threshold is on the consignment value, the document has to actually move
 * goods, and a document of services alone never needs one however large it is.
 */

import { BusinessDocument, Company, Item, Party } from '@/types';
import { MOVEMENT_KINDS, isFinalized } from '@/domain/documentStates';
import { formatMoney } from '@/lib/format';
import { Applicability } from '../applicability';

/** ₹50,000, in paise. */
export const EWB_THRESHOLD_MINOR = 50_000_00;

export function ewbApplicability(args: {
  company: Company;
  party: Party;
  doc: BusinessDocument;
  items: Item[];
}): Applicability {
  const { company, doc, items } = args;
  const reg = company.taxRegistration;

  if (reg?.regime !== 'GST' || !reg.registered) {
    return { applicable: false, reason: 'The business is not registered under GST.' };
  }
  if (reg.eWayBillEnabled === false) {
    return { applicable: false, reason: 'E-way bills are switched off in GST settings.' };
  }
  if (!MOVEMENT_KINDS.includes(doc.kind)) {
    return {
      applicable: false,
      reason: 'This document does not move goods, so no e-way bill is needed.',
    };
  }
  if (!isFinalized(doc.status)) {
    return { applicable: false, reason: 'The document has to be issued first.' };
  }
  if (doc.status === 'cancelled') {
    return { applicable: false, reason: 'The document is cancelled.' };
  }

  const movesGoods = doc.lines.some((line) => {
    const item = items.find((i) => i.id === line.itemId);
    // A free-text line with no catalog item is treated as goods.
    return !item || item.type === 'goods';
  });
  if (!movesGoods) {
    return { applicable: false, reason: 'There are no goods on this document — services only.' };
  }

  if (doc.totals.grandTotal.minor < EWB_THRESHOLD_MINOR) {
    return {
      applicable: false,
      reason: `Consignment value is below ${formatMoney({
        minor: EWB_THRESHOLD_MINOR,
        currency: doc.totals.grandTotal.currency,
      })}.`,
    };
  }

  return { applicable: true, reason: 'Goods over the threshold — an e-way bill is required.' };
}
