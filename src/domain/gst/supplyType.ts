/**
 * Place of supply and supply type — the two facts that decide how a sale is
 * taxed and how it must be reported.
 */

import { Address, Company, GstRegistrationType, Party } from '@/types';
import { OTHER_COUNTRY_CODE } from './stateCodes';

export type SupplyType =
  /** Registered buyer. */
  | 'B2B'
  /** Unregistered buyer. */
  | 'B2C'
  /** SEZ supply with payment of tax. */
  | 'SEZWP'
  /** SEZ supply without payment of tax. */
  | 'SEZWOP'
  /** Export with payment of tax. */
  | 'EXPWP'
  /** Export without payment of tax (under LUT/bond). */
  | 'EXPWOP'
  /** Deemed export. */
  | 'DEXP';

/**
 * Whether the supply crosses a state line.
 *
 * Both codes must be known: with a missing place of supply the safe reading is
 * intra-state, which is what the business is registered for.
 */
export function isInterState(
  sellerStateCode: string | undefined,
  placeOfSupplyStateCode: string | undefined,
): boolean {
  if (!sellerStateCode || !placeOfSupplyStateCode) return false;
  return sellerStateCode !== placeOfSupplyStateCode;
}

export type SupplyContext = {
  registrationType: GstRegistrationType;
  buyerGstin?: string;
  /** True when the supplier has filed a Letter of Undertaking. */
  underLut?: boolean;
};

export function resolveSupplyType(ctx: SupplyContext): SupplyType {
  switch (ctx.registrationType) {
    case 'overseas':
      return ctx.underLut ? 'EXPWOP' : 'EXPWP';
    case 'sez':
      return ctx.underLut ? 'SEZWOP' : 'SEZWP';
    case 'unregistered':
      return 'B2C';
    case 'composition':
    case 'regular':
    default:
      return ctx.buyerGstin ? 'B2B' : 'B2C';
  }
}

/** An export or SEZ supply is always treated as inter-state, whatever the addresses say. */
export function isExportLike(supplyType: SupplyType): boolean {
  return supplyType === 'EXPWP' || supplyType === 'EXPWOP' || supplyType === 'SEZWP' || supplyType === 'SEZWOP';
}

function stateCodeOfAddress(address: Address | undefined): string | undefined {
  return address?.stateCode;
}

/**
 * Where the supply is deemed to happen, in the order the law reads it:
 * the place the goods are shipped to, else the buyer's billing address, else
 * the seller's own state.
 */
export function placeOfSupplyFor(args: {
  explicit?: string;
  party?: Party;
  company: Company;
}): string | undefined {
  const { explicit, party, company } = args;
  if (explicit) return explicit;
  if (party?.gstRegistrationType === 'overseas') return OTHER_COUNTRY_CODE;
  return (
    stateCodeOfAddress(party?.shippingAddress) ??
    stateCodeOfAddress(party?.billingAddress) ??
    company.taxRegistration?.placeOfSupplyStateCode ??
    stateCodeOfAddress(company.address)
  );
}

export function sellerStateCode(company: Company): string | undefined {
  return company.taxRegistration?.placeOfSupplyStateCode ?? company.address.stateCode;
}

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  B2B: 'B2B — registered buyer',
  B2C: 'B2C — unregistered buyer',
  SEZWP: 'SEZ with payment of tax',
  SEZWOP: 'SEZ without payment of tax',
  EXPWP: 'Export with payment of tax',
  EXPWOP: 'Export under LUT',
  DEXP: 'Deemed export',
};
