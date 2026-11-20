import { createHash } from 'node:crypto';
import type { Config } from '../../config';

/**
 * What a sandbox target needs that a production one never does.
 *
 * NIC's sandboxes register a handful of test taxpayers, not the real world, so a real business's GSTIN, a real
 * customer's GSTIN and a real HSN code are all refused there. Against a sandbox target the gateways therefore file
 * *stand-ins* (a fixed test seller, a test buyer, a code the sandbox knows) while the app's own invoice, PDF and
 * audit trail keep the real data. Against a production target none of this runs: a business is filed as itself.
 *
 * Shared by both gateways; each decides for itself which stand-ins its own sandbox needs.
 */

/** NIC's "distance too high" (4038) and "too high or low" (4013): the pincodes it holds disagree with the distance given. */
export const DISTANCE_REFUSED = ['4038', '4013'] as const;
/** The same refusal from the standalone e-way bill API. */
export const STANDALONE_DISTANCE_REFUSED = '702';
/**
 * The sandbox holds a short HSN master, so a real customer's code is refused as invalid (216). The retry
 * files the bill under one it has accepted before; the app's own record keeps the real HSN.
 */
export const STANDALONE_HSN_REFUSED = '216';
/**
 * The sandbox knows only its own register of taxpayers, so a real transporter's GSTIN/TRANSIN is refused as an
 * invalid transporter ID (222). The retry leaves the transporter off — the vehicle number alone is enough to
 * move goods by road; the app's own record keeps the transporter.
 */
export const STANDALONE_TRANSPORTER_REFUSED = '222';
export const SANDBOX_ACCEPTED_HSN = '85362010';
/** The same refusal on an e-invoice: 2176 "HSN code(s) … invalid". */
export const IRN_HSN_REFUSED = ['2176', '2311', '3048'] as const; // 2311: the sandbox taxpayer's turnover requires a 6-digit HSN, so a 4-digit one is refused too.
// 3048: a goods HSN on a service line. Goods lines are swapped to a goods HSN the sandbox knows; a service line is given a SAC the sandbox knows (and one it already knows is unchanged, so a retry leaves it as it was).
export const SANDBOX_ACCEPTED_SAC = '995461';
export const irpHsnSwap = (i: { HsnCd?: string; IsServc?: string }) => (i.IsServc === 'Y' ? { ...i, HsnCd: SANDBOX_ACCEPTED_SAC } : { ...i, HsnCd: SANDBOX_ACCEPTED_HSN });

export type PartyBlock = Record<string, unknown>;

/**
 * Adaequare's e-invoice sandbox taxpayer and test buyer. The sandbox has a list of test taxpayers, one per state, each with
 * its own login (27AMBPG7773M016 / adqgspmhusr1 for Maharashtra, 29AMBPG7773M000 / adqgspusr1 for Karnataka, …). The
 * seller is Maharashtra's, filed from a Mumbai address; the buyer is 29AMBPG7773M000, which the sandbox register holds as
 * "Adaequare Info Private Limited" in state 29 (its Bengaluru pincode stands in, since NIC checks pincode against state). The sandbox refuses a buyer it has not registered (3028). Place of supply
 * and the amounts are the document's own.
 */
export const ADAEQUARE_SANDBOX_GSTIN = '27AMBPG7773M016';
export const adaequareSandboxSeller = (gstin: string): PartyBlock => ({
  Gstin: gstin,
  LglNm: 'Adaequare Info Private Limited',
  TrdNm: 'Adaequare Info Private Limited',
  Addr1: '12 Market Road',
  Loc: 'Mumbai',
  Pin: 400001,
  Stcd: gstin.slice(0, 2) || '27',
});
export const ADAEQUARE_SANDBOX_BUYER: PartyBlock = {
  Gstin: '29AMBPG7773M000',
  LglNm: 'Adaequare Info Private Limited',
  TrdNm: 'Adaequare Info Private Limited',
  Addr1: '4 MG Road',
  Loc: 'Bengaluru',
  Pin: 560001,
  Stcd: '29',
};

/**
 * The invoice's tax as CGST + SGST when the seller's state is the place of supply, as IGST when it is not; each
 * line's amount is unchanged. Only a payload whose tax disagrees is touched, so a consistent one passes as it came.
 */
export function resplitIrnTax<P extends { SellerDtls: { Stcd: string }; BuyerDtls: { Pos: string }; ItemList: unknown[]; ValDtls: unknown }>(payload: P): P {
  const intra = Number(payload.SellerDtls.Stcd) === Number(payload.BuyerDtls.Pos);
  type Line = { IgstAmt?: number; CgstAmt?: number; SgstAmt?: number };
  const items = payload.ItemList as Line[];
  const wrong = items.some((i) => (intra ? (i.IgstAmt ?? 0) > 0 : (i.CgstAmt ?? 0) > 0 || (i.SgstAmt ?? 0) > 0));
  if (!wrong) return payload;
  const money = (n: number) => Math.round(n * 100) / 100;
  const lines = items.map((i) => {
    const tax = money((i.IgstAmt ?? 0) + (i.CgstAmt ?? 0) + (i.SgstAmt ?? 0));
    if (!intra) return { ...i, IgstAmt: tax, CgstAmt: 0, SgstAmt: 0 };
    const half = money(tax / 2);
    return { ...i, IgstAmt: 0, CgstAmt: half, SgstAmt: money(tax - half) };
  });
  const sum = (key: 'IgstAmt' | 'CgstAmt' | 'SgstAmt') => money(lines.reduce((t, i) => t + (i[key] ?? 0), 0));
  return { ...payload, ItemList: lines, ValDtls: { ...(payload.ValDtls as object), IgstVal: sum('IgstAmt'), CgstVal: sum('CgstAmt'), SgstVal: sum('SgstAmt') } };
}

/** The bill's tax as CGST + SGST when it is intra-state, as IGST when it is not; the amount is unchanged. */
export function resplitTax(p: { fromStateCode: string; toStateCode: string; cgstValue: number; sgstValue: number; igstValue: number }): { cgstValue: number; sgstValue: number; igstValue: number } {
  const tax = p.cgstValue + p.sgstValue + p.igstValue;
  if (Number(p.fromStateCode) !== Number(p.toStateCode)) return { cgstValue: 0, sgstValue: 0, igstValue: tax };
  const half = Math.round((tax / 2) * 100) / 100;
  return { cgstValue: half, sgstValue: Math.round((tax - half) * 100) / 100, igstValue: 0 };
}

/**
 * Every tester shares a sandbox's test GSTIN, and NIC keys an IRN (and an e-way bill) on GSTIN + document number +
 * year. A document called `INV/26-27/0003` has therefore usually been registered already by someone else, months
 * ago: the portal answers 2150 "duplicate", the registration it carries is adopted, and the invoice ends up holding
 * a stranger's IRN. Raising an e-way bill on it is then refused for facts about *their* document — dated more than
 * 180 days back (4043), with a service HSN (4009), and already carrying a bill (4026).
 *
 * So the portal is shown a number of our own: stable for a given document (a retry finds our own
 * registration), different from every other deployment's, and within NIC's 16 characters. The app's invoice,
 * PDF and numbering keep the real number.
 */
export function sandboxDocNo(config: Config, gstin: string, docNo: string, docDate: string, companyId = ''): string {
  const digest = createHash('sha256').update(`${config.PUBLIC_BASE_URL}|${gstin}|${companyId}|${docNo}|${docDate}`).digest();
  let n = 0n;
  for (const byte of digest.subarray(0, 8)) n = (n << 8n) | BigInt(byte);
  return `S${n.toString(36).toUpperCase().padStart(11, '0').slice(0, 11)}`;
}

/** The e-way bill's from/to fields for a party block, as the standalone API's native body spells them. */
export const ewayFrom = (p: PartyBlock) => ({ fromGstin: String(p.Gstin), fromTrdName: String(p.LglNm), fromAddr1: String(p.Addr1), fromAddr2: p.Addr2 ? String(p.Addr2) : undefined, fromPlace: String(p.Loc), fromPincode: Number(p.Pin), fromStateCode: String(p.Stcd) });
export const ewayTo = (p: PartyBlock) => ({ toGstin: String(p.Gstin), toTrdName: String(p.LglNm), toAddr1: String(p.Addr1), toAddr2: p.Addr2 ? String(p.Addr2) : undefined, toPlace: String(p.Loc), toPincode: Number(p.Pin), toStateCode: String(p.Stcd) });

/**
 * Adaequare's e-way bill sandbox has its own test taxpayer, apart from the e-invoice one (its sample bill: Birla Carbon,
 * Patalganga, Maharashtra). The standalone e-way bill API files as this consignor.
 */
export const ADAEQUARE_SANDBOX_EWB_GSTIN = '05AAACG2115R1ZN';
export const adaequareSandboxEwbSeller = (gstin: string): PartyBlock => ({
  Gstin: gstin,
  LglNm: 'Birla Carbon India Pvt Ltd-Production Unit Patalaganga',
  Addr1: ' Village Lohop 410207 Patalganga',
  Addr2: '410207 Patalganga',
  Loc: 'Patalganga',
  Pin: 410207,
  Stcd: '27',
});

/** GST's rate slabs (IGST). CGST and SGST each carry half of one. */
const GST_SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 12, 18, 28];
const nearestSlab = (rate: number, slabs: number[]) => slabs.reduce((best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best), slabs[0]);

/**
 * **Sandbox only.** The standalone e-way bill body carries one summary line whose rate is the blend of the invoice's
 * (tax ÷ taxable value). A mixed-rate invoice blends to a rate that is no GST slab (18% and 5% make 16.3%), and the
 * sandbox answers "Invalid IGST Tax Rate"; it checks the slab, not the arithmetic. So the line shows the nearest valid
 * slab, and the bill's totals, which are what the document owes, are untouched.
 */
export function sandboxRates(body: Record<string, unknown>): Record<string, unknown> {
  const items = (body.itemList as Record<string, unknown>[] | undefined) ?? [];
  const snap = (item: Record<string, unknown>, key: 'igstRate' | 'cgstRate' | 'sgstRate', slabs: number[]) =>
    typeof item[key] === 'number' ? { [key]: nearestSlab(item[key] as number, slabs) } : {};
  const half = GST_SLABS.map((s) => s / 2);
  return { ...body, itemList: items.map((i) => ({ ...i, ...snap(i, 'igstRate', GST_SLABS), ...snap(i, 'cgstRate', half), ...snap(i, 'sgstRate', half) })) };
}
