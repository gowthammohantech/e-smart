/**
 * Part-A of the e-way bill: everything the consignment note says about the
 * goods and the two ends of the journey. It is derived entirely from the
 * document, so the only thing a user has to type is Part-B.
 */

import { toMajor } from '@/lib/money';
import { calculateLine } from '@/domain/lineCalc';
import {
  Address,
  BusinessDocument,
  Company,
  EwbPartA,
  EwbSubSupplyType,
  Item,
  Party,
} from '@/types';
import { normalizeGstin } from '../gstin';
import { placeOfSupplyFor, sellerStateCode } from '../supplyType';

export function ewbSubSupplyTypeFor(kind: BusinessDocument['kind']): EwbSubSupplyType {
  if (kind === 'salesReturn') return '8';
  return '1';
}

function addressLine(address: Address): string {
  return [address.line1, address.line2].filter(Boolean).join(', ');
}

function pinOf(postalCode: string | undefined): string {
  return (postalCode ?? '').replace(/\D/g, '').slice(0, 6);
}

export function buildPartA(args: {
  company: Company;
  party: Party;
  doc: BusinessDocument;
  items: Item[];
}): EwbPartA {
  const { company, party, doc, items } = args;

  const homeState = sellerStateCode(company) ?? '';
  const placeOfSupply =
    placeOfSupplyFor({ explicit: doc.placeOfSupplyStateCode, party, company }) ?? homeState;
  const shipTo = party.shippingAddress ?? party.billingAddress;
  const currency = doc.totals.grandTotal.currency;

  const taxContext = {
    regime: 'GST' as const,
    homeStateCode: homeState,
    placeOfSupplyStateCode: placeOfSupply,
    registered: !!company.taxRegistration?.registered,
  };

  const componentTotal = (type: string) =>
    toMajor({
      minor: doc.totals.taxLines
        .flatMap((t) => t.components)
        .filter((c) => c.type === type)
        .reduce((acc, c) => acc + c.amount.minor, 0),
      currency,
    });

  return {
    supplyType: 'O',
    subSupplyType: ewbSubSupplyTypeFor(doc.kind),
    docType: doc.kind === 'salesReturn' ? 'CRN' : doc.kind === 'delivery' ? 'CHL' : 'INV',
    docNo: doc.number,
    docDate: doc.date,
    fromGstin: normalizeGstin(company.taxRegistration?.identifier ?? ''),
    fromTradeName: company.name,
    fromAddress: addressLine(company.address),
    fromPlace: company.address.city,
    fromPincode: pinOf(company.address.postalCode),
    fromStateCode: homeState,
    toGstin: party.taxId ? normalizeGstin(party.taxId) : 'URP',
    toTradeName: party.name,
    toAddress: addressLine(shipTo),
    toPlace: shipTo.city,
    toPincode: pinOf(shipTo.postalCode),
    toStateCode: shipTo.stateCode ?? placeOfSupply,
    totalValue: toMajor(doc.totals.taxableAmount),
    cgstValue: componentTotal('CGST'),
    sgstValue: componentTotal('SGST'),
    igstValue: componentTotal('IGST'),
    cessValue: 0,
    totInvValue: toMajor(doc.totals.grandTotal),
    itemList: doc.lines.map((line) => {
      const breakdown = calculateLine(line, currency, taxContext);
      const item = items.find((i) => i.id === line.itemId);
      return {
        productName: line.name,
        hsnCode: line.hsnCode ?? item?.hsnCode ?? '',
        quantity: line.quantity,
        unit: line.unit,
        taxableAmount: toMajor(breakdown.taxable),
        taxRate: breakdown.taxRate,
      };
    }),
  };
}
