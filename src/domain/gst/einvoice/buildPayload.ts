/**
 * Turn a finalized sales document into a NIC e-Invoice payload.
 *
 * Every figure here is read back from what the invoice already computed —
 * `calculateLine` for the per-item split and `doc.totals` for the document
 * roll-up. Recomputing tax independently would let the payload and the printed
 * invoice drift apart, and the portal's value-mismatch check would then be
 * testing the wrong thing.
 */

import { toMajor } from '@/lib/money';
import { calculateLine } from '@/domain/lineCalc';
import { splitTax } from '@/domain/taxEngine';
import { BusinessDocument, Company, Item, Party } from '@/types';
import { normalizeGstin } from '../gstin';
import { isExportLike, placeOfSupplyFor, resolveSupplyType, sellerStateCode } from '../supplyType';
import { OTHER_COUNTRY_CODE } from '../stateCodes';
import {
  EInvoiceDocType,
  EInvoicePayload,
  NicItem,
  NicPartyBlock,
  nicAmount,
  nicDate,
} from './schema';

export type EInvoiceInput = {
  company: Company;
  party: Party;
  doc: BusinessDocument;
  items: Item[];
};

/** Only these document kinds have a place on the portal. */
export function docTypeFor(kind: BusinessDocument['kind']): EInvoiceDocType | null {
  if (kind === 'invoice') return 'INV';
  if (kind === 'salesReturn') return 'CRN';
  return null;
}

function pinOf(postalCode: string | undefined): number {
  const digits = (postalCode ?? '').replace(/\D/g, '');
  return digits.length === 6 ? Number(digits) : 0;
}

function sellerBlock(company: Company): NicPartyBlock {
  return {
    Gstin: normalizeGstin(company.taxRegistration?.identifier ?? ''),
    LglNm: company.legalName ?? company.name,
    TrdNm: company.name,
    Addr1: company.address.line1,
    Addr2: company.address.line2,
    Loc: company.address.city,
    Pin: pinOf(company.address.postalCode),
    Stcd: sellerStateCode(company) ?? '',
    Ph: company.phone,
    Em: company.email,
  };
}

function buyerBlock(party: Party, placeOfSupply: string): NicPartyBlock & { Pos: string } {
  const address = party.billingAddress;
  return {
    // An unregistered buyer is reported with the literal URP.
    Gstin: party.taxId ? normalizeGstin(party.taxId) : 'URP',
    LglNm: party.name,
    TrdNm: party.displayName ?? party.name,
    Addr1: address.line1,
    Addr2: address.line2,
    Loc: address.city,
    Pin: pinOf(address.postalCode),
    Stcd: address.stateCode ?? placeOfSupply,
    Ph: party.phone,
    Em: party.email,
    Pos: placeOfSupply,
  };
}

export function buildEInvoicePayload(input: EInvoiceInput): EInvoicePayload {
  const { company, party, doc, items } = input;

  const homeState = sellerStateCode(company);
  const placeOfSupply =
    placeOfSupplyFor({ explicit: doc.placeOfSupplyStateCode, party, company }) ?? homeState ?? '';

  const supplyType = resolveSupplyType({
    registrationType: party.gstRegistrationType,
    buyerGstin: party.taxId,
  });
  const exportLike = isExportLike(supplyType);

  const taxContext = {
    regime: 'GST' as const,
    homeStateCode: homeState,
    // An export or SEZ supply attracts IGST whatever the two addresses say.
    placeOfSupplyStateCode: exportLike ? OTHER_COUNTRY_CODE : placeOfSupply,
    registered: !!company.taxRegistration?.registered,
  };

  const currency = doc.totals.grandTotal.currency;

  const itemList: NicItem[] = doc.lines.map((line, index) => {
    const breakdown = calculateLine(line, currency, taxContext);
    const components = splitTax(breakdown.taxable, breakdown.taxRate, taxContext);
    const amountOf = (type: string) =>
      nicAmount(
        components.filter((c) => c.type === type).reduce((acc, c) => acc + c.amount.minor, 0),
      );
    const catalogItem = items.find((i) => i.id === line.itemId);

    return {
      SlNo: String(index + 1),
      PrdDesc: line.name,
      IsServc: catalogItem?.type === 'service' ? 'Y' : 'N',
      HsnCd: line.hsnCode ?? catalogItem?.hsnCode ?? '',
      Qty: line.quantity,
      FreeQty: 0,
      Unit: line.unit,
      UnitPrice: toMajor(line.unitPrice),
      TotAmt: nicAmount(breakdown.gross.minor),
      Discount: nicAmount(breakdown.discount.minor),
      PreTaxVal: nicAmount(breakdown.taxable.minor),
      AssAmt: nicAmount(breakdown.taxable.minor),
      GstRt: breakdown.taxRate,
      IgstAmt: amountOf('IGST'),
      CgstAmt: amountOf('CGST'),
      SgstAmt: amountOf('SGST'),
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesAmt: 0,
      OthChrg: 0,
      TotItemVal: nicAmount(breakdown.taxable.minor + breakdown.taxAmount.minor),
    };
  });

  const componentTotal = (type: string) =>
    nicAmount(
      doc.totals.taxLines
        .flatMap((t) => t.components)
        .filter((c) => c.type === type)
        .reduce((acc, c) => acc + c.amount.minor, 0),
    );

  const payload: EInvoicePayload = {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: supplyType,
      RegRev: doc.reverseCharge ? 'Y' : 'N',
      EcmGstin: null,
      IgstOnIntra: exportLike && placeOfSupply === homeState ? 'Y' : 'N',
    },
    DocDtls: {
      Typ: docTypeFor(doc.kind) ?? 'INV',
      No: doc.number,
      Dt: nicDate(doc.date),
    },
    SellerDtls: sellerBlock(company),
    BuyerDtls: buyerBlock(party, placeOfSupply),
    ItemList: itemList,
    ValDtls: {
      AssVal: nicAmount(doc.totals.taxableAmount.minor),
      CgstVal: componentTotal('CGST'),
      SgstVal: componentTotal('SGST'),
      IgstVal: componentTotal('IGST'),
      CesVal: 0,
      StCesVal: 0,
      Discount: nicAmount(doc.totals.documentDiscount.minor),
      OthChrg: nicAmount(doc.totals.charges.minor),
      RndOffAmt: nicAmount(doc.totals.roundOff.minor),
      TotInvVal: nicAmount(doc.totals.grandTotal.minor),
    },
  };

  if (doc.notes) payload.RefDtls = { InvRm: doc.notes.slice(0, 100) };

  if (exportLike) {
    payload.ExpDtls = {
      CntCode: party.billingAddress.country === 'India' ? 'IN' : 'OT',
      RefClm: supplyType === 'EXPWP' || supplyType === 'SEZWP' ? 'Y' : 'N',
    };
  }

  return payload;
}
