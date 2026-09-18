/**
 * The checks the IRP runs before it will mint an IRN.
 *
 * Each rule carries the portal's own error code, so a rejection in the
 * prototype reads the same way a rejection from the real portal would — which
 * is the part that is actually worth learning.
 */

import { IrpError } from '@/types';
import { isValidGstin } from '../gstin';
import { isValidStateCode } from '../stateCodes';
import { EInvoicePayload } from './schema';

export const EINVOICE_ERRORS: Record<string, string> = {
  '2150': 'Duplicate IRN — an active IRN already exists for this document',
  '2172': 'CGST and SGST are not applicable for an inter-state supply',
  '2173': 'IGST is not applicable for an intra-state supply',
  '2176': 'HSN code is missing or not 4, 6 or 8 digits',
  '2182': 'Item taxable value does not match quantity × unit price − discount',
  '2189': 'Total invoice value does not match the sum of its parts',
  '2211': 'Supplier GSTIN is not valid',
  '2227': 'Document date cannot be in the future',
  '2233': 'PIN code must be six digits',
  '2240': 'Document date is more than 30 days old',
  '2265': 'Recipient GSTIN state code does not match the place of supply',
  '2270': 'An IRN cannot be cancelled more than 24 hours after it was generated',
  '3028': 'Recipient GSTIN is missing for a B2B supply',
  '3029': 'Recipient GSTIN is not valid',
  '4019': 'The invoice must have at least one item',
};

function err(code: string, override?: string): IrpError {
  return { code, message: override ?? EINVOICE_ERRORS[code] ?? 'Rejected by the portal' };
}

/** Tolerance the portal allows on a rounded total, in rupees. */
const VALUE_TOLERANCE = 1;

export type ValidationContext = {
  /** 'now' as an ISO date, injected so tests are not clock-dependent. */
  today: string;
};

export function validateEInvoice(
  payload: EInvoicePayload,
  ctx: ValidationContext,
): IrpError[] {
  const errors: IrpError[] = [];

  if (!isValidGstin(payload.SellerDtls.Gstin)) errors.push(err('2211'));

  const isB2C = payload.TranDtls.SupTyp === 'B2C';
  const isExport = payload.TranDtls.SupTyp.startsWith('EXP');

  if (payload.BuyerDtls.Gstin === 'URP' || !payload.BuyerDtls.Gstin) {
    // An export buyer is legitimately unregistered; a B2B buyer is not.
    if (!isB2C && !isExport) errors.push(err('3028'));
  } else if (!isValidGstin(payload.BuyerDtls.Gstin)) {
    errors.push(err('3029'));
  } else if (
    !isExport &&
    payload.BuyerDtls.Gstin.slice(0, 2) !== payload.BuyerDtls.Pos &&
    isValidStateCode(payload.BuyerDtls.Pos)
  ) {
    errors.push(err('2265'));
  }

  if (payload.SellerDtls.Pin === 0 || payload.BuyerDtls.Pin === 0) errors.push(err('2233'));

  const docDate = isoOf(payload.DocDtls.Dt);
  if (docDate > ctx.today) errors.push(err('2227'));
  else if (daysBetween(docDate, ctx.today) > 30) errors.push(err('2240'));

  if (payload.ItemList.length === 0) errors.push(err('4019'));

  payload.ItemList.forEach((item) => {
    const hsn = (item.HsnCd ?? '').trim();
    if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn)) {
      errors.push(err('2176', `${EINVOICE_ERRORS['2176']} (item ${item.SlNo})`));
    }
    const expected = round2(item.TotAmt - item.Discount);
    if (Math.abs(expected - item.AssAmt) > 0.01) {
      errors.push(err('2182', `${EINVOICE_ERRORS['2182']} (item ${item.SlNo})`));
    }
  });

  const { CgstVal, SgstVal, IgstVal } = payload.ValDtls;
  const interState = payload.BuyerDtls.Pos !== payload.SellerDtls.Stcd;
  const igstOnIntra = payload.TranDtls.IgstOnIntra === 'Y';

  if (interState && (CgstVal > 0 || SgstVal > 0)) errors.push(err('2172'));
  if (!interState && !igstOnIntra && !isExport && IgstVal > 0) errors.push(err('2173'));

  const expectedTotal = round2(
    payload.ValDtls.AssVal +
      CgstVal +
      SgstVal +
      IgstVal +
      payload.ValDtls.CesVal +
      payload.ValDtls.OthChrg -
      payload.ValDtls.Discount +
      payload.ValDtls.RndOffAmt,
  );
  if (Math.abs(expectedTotal - payload.ValDtls.TotInvVal) > VALUE_TOLERANCE) {
    errors.push(err('2189'));
  }

  return errors;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 'DD/MM/YYYY' back to ISO, so dates can be compared as strings. */
function isoOf(nic: string): string {
  const [d, m, y] = nic.split('/');
  return `${y}-${m}-${d}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
