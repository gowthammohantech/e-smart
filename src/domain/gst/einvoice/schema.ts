/**
 * The NIC e-Invoice JSON schema, version 1.1 — the shape that is actually
 * posted to an Invoice Registration Portal.
 *
 * Field names are the portal's, not ours: `SupTyp`, `AssVal`, `TotInvVal` and
 * friends are terse on purpose, and keeping them verbatim is what makes the
 * payload viewer in the app worth reading.
 */

export type EInvoiceDocType = 'INV' | 'CRN' | 'DBN';

export type NicPartyBlock = {
  Gstin: string;
  LglNm: string;
  TrdNm?: string;
  Addr1: string;
  Addr2?: string;
  Loc: string;
  Pin: number;
  Stcd: string;
  Ph?: string;
  Em?: string;
};

export type NicTranDtls = {
  TaxSch: 'GST';
  SupTyp: string;
  /** 'Y' when tax is payable by the recipient under reverse charge. */
  RegRev: 'Y' | 'N';
  EcmGstin: string | null;
  /** 'Y' when IGST applies although seller and buyer share a state (SEZ). */
  IgstOnIntra: 'Y' | 'N';
};

export type NicDocDtls = {
  Typ: EInvoiceDocType;
  No: string;
  /** DD/MM/YYYY — the portal does not accept ISO. */
  Dt: string;
};

export type NicItem = {
  SlNo: string;
  PrdDesc: string;
  IsServc: 'Y' | 'N';
  HsnCd: string;
  Qty: number;
  FreeQty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  PreTaxVal: number;
  AssAmt: number;
  GstRt: number;
  IgstAmt: number;
  CgstAmt: number;
  SgstAmt: number;
  CesRt: number;
  CesAmt: number;
  CesNonAdvlAmt: number;
  StateCesAmt: number;
  OthChrg: number;
  TotItemVal: number;
};

export type NicValDtls = {
  AssVal: number;
  CgstVal: number;
  SgstVal: number;
  IgstVal: number;
  CesVal: number;
  StCesVal: number;
  Discount: number;
  OthChrg: number;
  RndOffAmt: number;
  TotInvVal: number;
};

export type EInvoicePayload = {
  Version: '1.1';
  TranDtls: NicTranDtls;
  DocDtls: NicDocDtls;
  SellerDtls: NicPartyBlock;
  BuyerDtls: NicPartyBlock & { Pos: string };
  ShipDtls?: NicPartyBlock;
  ItemList: NicItem[];
  ValDtls: NicValDtls;
  RefDtls?: { InvRm?: string; PrecDocDtls?: { InvNo: string; InvDt: string }[] };
  ExpDtls?: { CntCode: string; ForCur?: string; RefClm: 'Y' | 'N' };
};

/** Amounts go to the portal as two-decimal numbers, never as floats with drift. */
export function nicAmount(minor: number): number {
  return Math.round(minor) / 100;
}

/** ISO 'YYYY-MM-DD' to the portal's 'DD/MM/YYYY'. */
export function nicDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Stable key ordering, so the same invoice always produces the same bytes.
 * The IRN is a hash of document identifiers rather than of this text, but the
 * signed payload has to be reproducible for the QR to verify.
 */
export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (source[key] !== undefined) acc[key] = sortKeys(source[key]);
        return acc;
      }, {});
  }
  return value;
}
