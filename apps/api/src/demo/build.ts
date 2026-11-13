/**
 * Builds one demo business through the API, the way a person would: masters first, then about six
 * months of trading played out day by day (so numbers run in date order), then the books, banking
 * and compliance on top. Everything goes through the real handlers, so the records obey every rule
 * and the books balance; only the timestamps are moved back afterwards (seed.ts).
 */
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { addDaysISO } from '@esmart/core/lib/date';
import type { Gstr2bEntry } from '../providers/returns';
import type { DemoApi } from './client';
import { gstin, type ItemSpec, type PartySpec, type Profile } from './profiles';

type Money = { minor: number; currency: string };
type Doc = { id: string; number: string; kind: string; status: string; date: string; dueDate?: string; partyId: string; currency: string; branchId: string; totals: { grandTotal: Money; grandTotalBase?: Money }; lines: { id: string }[] };
type Party = { id: string; name: string; spec: PartySpec; gstin?: string };
type Item = { id: string; spec: ItemSpec };

const inr = (rupees: number): Money => ({ minor: Math.round(rupees * 100), currency: 'INR' });
const cur = (amount: number, currency: string): Money => ({ minor: Math.round(amount * 100), currency });

/** Small seeded generator: the same profile always gives the same business. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}

export type BuildContext = {
  /** The business date the demo is built on; everything is dated relative to it. */
  today: string;
  /** Account-level team, invited once (seed.ts) and given access to every business. */
  team: { accountant: DemoApi; accountantId: string };
  log: (msg: string) => void;
  /** Called once the company exists, before anything plan-gated: seed.ts lifts it to Business and shares it with the team. */
  onCompany: (companyId: string) => Promise<void>;
  /**
   * Varies the businesses' PANs (so their GSTINs) from one build to the next. The portal simulator,
   * like the real IRP, refuses an IRN it has seen, and the new demo is built while the old one, with
   * the same invoice numbers, is still live.
   */
  variant: number;
  /** The returns simulator the build talks to: its GSTR-2B is made from the business's own bills. */
  gstr2b: Map<string, Gstr2bEntry[]>;
};

/** The PAN with its four digits shifted by `variant`: still a valid PAN, a different GSTIN. */
export function panFor(pan: string, variant: number) {
  const digits = String((Number(pan.slice(5, 9)) + variant) % 10000).padStart(4, '0');
  return pan.slice(0, 5) + digits + pan.slice(9);
}

export type Built = { companyId: string; name: string; branchIds: string[] };

export async function buildBusiness(api: DemoApi, p: Profile, ctx: BuildContext): Promise<Built> {
  const r = rng([...p.key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const pan = panFor(p.pan, ctx.variant);
  const day = (daysAgo: number) => addDaysISO(ctx.today, -daysAgo);
  const ownGstin = p.registered ? gstin(p.branches[0].address.stateCode, pan) : undefined;
  const homeState = p.branches[0].address.stateCode;

  /* ---------------------------------------------------------------- company */
  const company = await api.post('/companies', {
    name: p.name,
    legalName: p.legalName,
    businessType: p.type,
    country: 'IN',
    baseCurrency: 'INR',
    address: p.branches[0].address,
    email: p.email,
    phone: p.phone,
    ...(p.website && { website: p.website }),
    taxRegistration: p.registered
      ? { regime: 'GST', identifier: ownGstin, identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: homeState, returnFrequency: p.returnFrequency ?? 'monthly', ...(p.lut && { lutNumber: p.lut, lutValidTill: `${Number(ctx.today.slice(0, 4)) + (Number(ctx.today.slice(5, 7)) >= 4 ? 1 : 0)}-03-31` }) }
      : { regime: 'NONE', identifierLabel: 'GSTIN', registered: false },
    fiscalYearStartMonth: 4,
    bankDetails: { bankName: p.bank.name, accountName: p.legalName, accountNumber: p.bank.account, ifsc: p.bank.ifsc, branch: p.bank.branch, upiId: p.bank.upi },
    invoiceTemplate: { accentColor: '#1F6FEB', showDiscountColumn: true, showTaxColumn: true, showHsn: true, showLogo: true, footerText: 'Thank you for your business.', compact: false },
    // Lixi answers questions in the demo; this keeps a busy week from running up the bill.
    aiMonthlyLimit: 300,
    stockCosting: p.traits.fifo ? 'fifo' : 'average',
    ...(p.registered && { tan: `${p.branches[0].address.city.slice(0, 3).toUpperCase()}${pan.slice(3, 4)}0${pan.slice(5, 9)}${pan.slice(9)}`.slice(0, 10) }),
    branches: p.branches.map((b, i) => ({
      name: b.name,
      code: b.code,
      address: b.address,
      isPrimary: i === 0,
      ...(b.phone && { phone: b.phone }),
      ...(p.registered && b.ownGstin && b.address.stateCode !== homeState && { gstin: gstin(b.address.stateCode, pan) }),
    })),
    seedDefaults: true,
  });
  const c = `/companies/${company.id}`;
  await ctx.onCompany(company.id);
  return { companyId: company.id, name: p.name, ...(await fill()) };

  async function fill() {
    // The plan is a billing matter; seed.ts sets it to business before this runs anything gated.
    const branches = (await api.get<{ data: { id: string; code: string; isPrimary: boolean; address: { stateCode: string } }[] }>(`${c}/branches`)).data;
    const primary = branches.find((b) => b.isPrimary)!.id;
    const other = branches.find((b) => !b.isPrimary)!.id;
    const pickBranch = () => (r.chance(0.65) ? primary : r.pick(branches).id);

    const taxes = (await api.get<{ data: { id: string; rate: number }[] }>(`${c}/tax-categories`)).data;
    const tax = (rate: number) => (taxes.find((t) => Number(t.rate) === rate) ?? taxes[0]).id;
    const expenseCats = (await api.get<{ data: { id: string; name: string }[] }>(`${c}/expense-categories`)).data;
    const expCat = (name: string) => (expenseCats.find((e) => e.name === name) ?? expenseCats[0]).id;
    const cash = (await api.get<{ data: { id: string; type: string }[] }>(`${c}/payment-accounts`)).data.find((a) => a.type === 'cash')!.id;

    /* ---- money accounts ------------------------------------------------ */
    const opened = day(200);
    const bank = (
      await api.post(`${c}/payment-accounts`, {
        name: `${p.bank.name} current — ${p.bank.account.slice(-4)}`,
        type: 'bank',
        currency: 'INR',
        accountNumber: `XXXX${p.bank.account.slice(-4)}`,
        openingBalance: inr(1500000 + p.traits.expenses.reduce((a, [, x]) => a + x, 0) * 8),
        openingBalanceDate: opened,
        isDefault: true,
      })
    ).id as string;
    const wallet = (await api.post(`${c}/payment-accounts`, { name: 'UPI collections', type: 'wallet', currency: 'INR', openingBalance: inr(0), openingBalanceDate: opened })).id as string;
    await api.put(`${c}/payment-accounts/${cash}`, { name: 'Cash in hand', type: 'cash', currency: 'INR', openingBalance: inr(25000), openingBalanceDate: opened, isDefault: false }, { 'if-match': '*' }).catch(() => undefined);

    /* ---- masters --------------------------------------------------------- */
    const catIds = new Map<string, string>();
    for (const k of p.categories) catIds.set(k.name, (await api.post(`${c}/item-categories`, k)).id);
    const brandIds = new Map<string, string>();
    for (const b of p.brands) brandIds.set(b, (await api.post(`${c}/brands`, { name: b })).id);

    const repField = (await api.post(`${c}/custom-fields`, { entity: 'party', label: 'Account manager', kind: 'select', options: ['Arjun', 'Neha', 'Imran'], position: 1 })).id as string;
    const warrantyField = (await api.post(`${c}/custom-fields`, { entity: 'item', label: 'Warranty (months)', kind: 'number', position: 1 })).id as string;
    const poRefField = (await api.post(`${c}/custom-fields`, { entity: 'document', label: 'Customer PO number', kind: 'text', showOnPdf: true, position: 1 })).id as string;
    await api.post(`${c}/custom-fields`, { entity: 'document', label: 'Delivered in person', kind: 'checkbox', position: 2 });
    await api.post(`${c}/custom-fields`, { entity: 'party', label: 'Old code (retired)', kind: 'text', position: 2, status: 'inactive' });

    const vehicles: string[] = [];
    for (const [i, reg] of (p.traits.vehicles ?? []).entries()) vehicles.push((await api.post(`${c}/vehicles`, { registration: reg, name: i === 0 ? 'Delivery vehicle' : `Vehicle ${i + 1}`, status: 'active' })).id);
    let transporter: { id: string; name: string; gstin: string } | undefined;
    if (p.traits.eway) {
      const t = { name: 'Konkan Roadlines', transporterId: '27AABCT5512M1Z6', phone: '+91 22 2771 4410' };
      transporter = { id: (await api.post(`${c}/transporters`, t)).id, name: t.name, gstin: t.transporterId };
      await api.post(`${c}/transporters`, { name: 'Garuda Freight Carriers', transporterId: '29AABCG4321K1ZM', status: 'active' });
    }

    const centres: string[] = [];
    for (const cc of p.traits.costCentres) centres.push((await api.post(`${c}/cost-centres`, { ...cc, status: 'active' })).id);
    await api.post(`${c}/cost-centres`, { name: 'Closed project', category: p.traits.costCentres[0].category, status: 'inactive' });

    // The books' own accounts, beside the ones the app keeps for parties, money and expenses.
    const ledger = async (name: string, group: string, opening = 0, status = 'active') => (await api.post(`${c}/ledger-accounts`, { name, group, openingBalance: inr(opening), openingBalanceDate: opened, status })).id as string;
    const loan = await ledger(`Term loan — ${p.bank.name}`, 'loans', p.type === 'freelancer' || p.type === 'other' ? 0 : 1500000);
    const directorLoan = await ledger(p.type === 'other' ? 'Trustee advance' : p.type === 'freelancer' ? 'Loan from family' : 'Loan from directors', 'loans', 300000);
    const deposit = await ledger('Rent deposit', 'loansAdvances', 200000);
    const interestIncome = await ledger('Interest on deposits', 'indirectIncomes');
    const auditFees = await ledger('Audit fees', 'indirectExpenses');
    const provision = await ledger('Provision for expenses', 'provisions');
    const capitalIn = await ledger(p.type === 'other' ? 'Corpus fund' : 'Partners / promoters capital', 'capital', 0);
    await ledger('Old suspense account', 'currentLiabilities', 0, 'inactive');

    /* ---- money on hand -------------------------------------------------------- */
    // What each money account holds as the app sees it: nothing is ever paid from an account that can't
    // cover it. When the bank runs low the business draws on its working-capital line, as a real one would.
    const bankOpening = 1500000 + p.traits.expenses.reduce((a, [, x]) => a + x, 0) * 8;
    const bal = new Map<string, number>([
      [bank, bankOpening],
      [wallet, 0],
      [cash, 25000],
    ]);
    const credit = (account: string, rupees: number) => bal.set(account, (bal.get(account) ?? 0) + rupees);
    const funder = p.type === 'freelancer' || p.type === 'other' ? directorLoan : loan;
    const ensure = async (date: string, rupees: number) => {
      const short = rupees + 50000 - (bal.get(bank) ?? 0);
      if (short <= 0) return;
      const draw = Math.ceil(short / 100000) * 100000;
      await api.post(`${c}/vouchers`, { kind: 'journal', date, branchId: primary, narration: p.type === 'freelancer' || p.type === 'other' ? 'Funds brought in' : 'Working capital drawn from the loan line', lines: [{ account: `pay:${bank}`, debit: inr(draw), credit: inr(0) }, { account: `acc:${funder}`, debit: inr(0), credit: inr(draw) }] });
      credit(bank, draw);
    };
    /** Pays from petty cash or UPI when they can cover it, otherwise the bank (topped up if need be). */
    const spendFrom = async (date: string, rupees: number, prefer?: string) => {
      const order = prefer ? [prefer] : rupees <= 4000 ? [r.pick([cash, wallet]), bank] : [bank];
      for (const a of order) {
        if (a !== bank && (bal.get(a) ?? 0) >= rupees) {
          credit(a, -rupees);
          return a;
        }
      }
      await ensure(date, rupees);
      credit(bank, -rupees);
      return bank;
    };

    /* ---- parties ------------------------------------------------------------ */
    const mkParty = async (s: PartySpec, kind: 'customer' | 'supplier'): Promise<Party> => {
      const g = s.pan && !s.overseas ? gstin(s.state, s.pan) : undefined;
      const currency = s.overseas?.currency ?? 'INR';
      const party = await api.post(`${c}/parties`, {
        kind,
        name: s.name,
        ...(s.contact && { displayName: s.contact }),
        ...(g && { taxId: g, pan: s.pan }),
        gstRegistrationType: s.overseas ? 'overseas' : g ? 'regular' : 'unregistered',
        ...(s.msme && { msmeType: s.msme, udyamNumber: `UDYAM-${s.state === '96' ? 'MH' : 'KA'}-${String(r.int(10, 33))}-${String(r.int(1000000, 9999999))}` }),
        ...(s.tds && kind === 'supplier' && { tdsSection: s.tds }),
        ...(s.tcs && { tcsApplicable: true, tcsSection: s.tcs }),
        ...(s.reverseCharge && { reverseCharge: true }),
        email: `accounts@${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18)}.example`,
        phone: `+91 9${String(r.int(100000000, 999999999))}`,
        currency,
        billingAddress: { line1: s.line1, city: s.city, state: s.overseas ? s.overseas.country : stateName(s.state), ...(s.overseas ? {} : { stateCode: s.state }), postalCode: s.pin, country: s.overseas?.country ?? 'IN' },
        ...(s.creditLimit && { creditLimit: inr(s.creditLimit) }),
        openingBalance: cur(s.opening ?? 0, currency),
        ...(s.opening && { openingBalanceDate: opened, openingBalanceSide: kind === 'customer' ? 'dr' : 'cr' }),
        paymentTermsDays: s.terms ?? 30,
        customFields: kind === 'customer' ? { [repField]: r.pick(['Arjun', 'Neha', 'Imran']) } : {},
      });
      return { id: party.id, name: s.name, spec: s, gstin: g };
    };
    const customers: Party[] = [];
    for (const s of p.customers) customers.push(await mkParty(s, 'customer'));
    const suppliers: Party[] = [];
    for (const s of p.suppliers) suppliers.push(await mkParty(s, 'supplier'));
    // A party who is both, and one who has gone quiet.
    customers.push(await mkParty({ name: `${p.branches[0].address.city} Associates`, line1: 'Main Road', city: p.branches[0].address.city, state: homeState, pin: p.branches[0].address.postalCode, terms: 30 }, 'customer'));
    await api.post(`${c}/parties`, { kind: 'customer', name: 'Dormant Customer (inactive)', currency: 'INR', billingAddress: p.branches[0].address, openingBalance: inr(0), paymentTermsDays: 30, status: 'inactive' });

    /* ---- items ------------------------------------------------------------- */
    const items: Item[] = [];
    for (const s of p.items) {
      const goods = (s.type ?? 'goods') === 'goods';
      const item = await api.post(`${c}/items`, {
        sku: s.sku,
        name: s.name,
        type: s.type ?? 'goods',
        unit: s.unit,
        salePrice: inr(s.sale),
        purchasePrice: inr(s.purchase),
        taxCategoryId: tax(p.registered ? s.gst : 0),
        hsnCode: s.hsn,
        trackInventory: goods && !s.capitalGoods,
        ...(goods && !s.capitalGoods && { openingStock: s.stock ?? 0, openingStockDate: opened, reorderLevel: s.reorder ?? 0 }),
        ...((s.exempt || s.capitalGoods || (s.cess && p.registered)) && { gst: { ...(s.exempt && { supplyType: 'exempt' }), ...(s.capitalGoods && { capitalGoods: true }), ...(s.cess && p.registered && { cessRate: s.cess }) } }),
        ...(s.category && { categoryId: catIds.get(s.category) ?? null }),
        ...(s.brand && { brandId: brandIds.get(s.brand) ?? null }),
        customFields: goods && !s.rawMaterial ? { [warrantyField]: r.pick([6, 12, 24]) } : {},
      });
      items.push({ id: item.id, spec: s });
    }
    await api.post(`${c}/items`, { sku: 'OLD-DISC', name: 'Discontinued line', type: 'goods', unit: 'PCS', salePrice: inr(100), purchasePrice: inr(70), taxCategoryId: tax(p.registered ? 18 : 0), trackInventory: false, status: 'inactive' });
    const sellable = items.filter((i) => !i.spec.rawMaterial && i.spec.sale > 0);
    const buyable = items.filter((i) => (i.spec.type ?? 'goods') === 'goods' && i.spec.purchase > 0 && !i.spec.capitalGoods);

    if (p.traits.exports) {
      for (let back = 180; back >= 0; back -= 30) {
        await api.post(`${c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 83.1 + (180 - back) / 100, effectiveFrom: day(back), source: 'manual' });
        await api.post(`${c}/exchange-rates`, { from: 'GBP', to: 'INR', rate: 105.4 + (180 - back) / 90, effectiveFrom: day(back), source: 'manual' });
      }
    }

    /* ---- documents ------------------------------------------------------------- */
    const line = (it: Item, qty: number, opts: { price?: number; discount?: number; buy?: boolean; costCentreId?: string } = {}) => ({
      itemId: it.id,
      name: it.spec.name,
      hsnCode: it.spec.hsn,
      quantity: qty,
      unit: it.spec.unit,
      unitPrice: inr(opts.price ?? (opts.buy ? it.spec.purchase : it.spec.sale)),
      discountMode: 'percent',
      discountValue: opts.discount ?? 0,
      taxCategoryId: tax(p.registered ? it.spec.gst : 0),
      taxInclusive: false,
      ...(opts.costCentreId && { costCentreId: opts.costCentreId }),
    });
    const qtyFor = (it: Item, big = false) => ((it.spec.type ?? 'goods') === 'service' ? r.int(1, 3) : it.spec.unit === 'KG' ? r.int(big ? 400 : 80, big ? 1500 : 400) : r.int(big ? 20 : 3, big ? 80 : 18));
    // What each branch holds, as the app will see it: a sale never asks for more than is there.
    const stock = new Map<string, number>();
    const sk = (itemId: string, b: string) => `${itemId}:${b}`;
    const have = (itemId: string, b: string) => stock.get(sk(itemId, b)) ?? 0;
    const move = (itemId: string, b: string, q: number) => stock.set(sk(itemId, b), have(itemId, b) + q);
    const tracked = new Set(items.filter((i) => (i.spec.type ?? 'goods') === 'goods' && !i.spec.capitalGoods).map((i) => i.id));
    for (const it of items) if (tracked.has(it.id)) move(it.id, primary, it.spec.stock ?? 0);
    /** At most a third of what the branch holds, so later sales still find stock. */
    const fit = (it: Item, q: number, b: string) => (tracked.has(it.id) ? Math.min(q, Math.floor(have(it.id, b) / 3)) : q);
    type LineIn = { itemId?: string; quantity: number; [k: string]: unknown };
    type Lines = (branchId: string) => LineIn[];
    const salesLines =
      (n: number, big = false): Lines =>
      (b) => {
        const out = pickN(sellable, n)
          .map((it) => ({ it, q: fit(it, qtyFor(it, big), b) }))
          .filter((x) => x.q >= 1)
          .map(({ it, q }) => line(it, q, { discount: r.chance(0.25) ? r.pick([2, 5, 10]) : 0 }));
        if (out.length) return out;
        // Nothing left on these shelves: a service, or the best-stocked item here.
        const fallback = sellable.find((i) => !tracked.has(i.id)) ?? [...sellable].sort((a, z) => have(z.id, b) - have(a.id, b))[0];
        return [line(fallback, 1)];
      };
    const buyLines =
      (n: number): Lines =>
      () =>
        pickN(buyable, n).map((it) => line(it, qtyFor(it, true), { buy: true }));
    const OUT = new Set(['invoice', 'delivery', 'purchaseReturn']);
    const IN = new Set(['purchaseBill', 'goodsReceipt', 'salesReturn']);
    /** Moves the tracker as the app moves stock: on issue, and once per chain (a delivery's invoice doesn't move it again). */
    const track = (kind: string, b: string, lines: { itemId?: string; quantity: number }[], fromChain: boolean) => {
      if (fromChain && (kind === 'invoice' || kind === 'purchaseBill')) return;
      const sign = OUT.has(kind) ? -1 : IN.has(kind) ? 1 : 0;
      if (!sign) return;
      for (const l of lines) if (l.itemId && tracked.has(l.itemId)) move(l.itemId, b, sign * l.quantity);
    };
    function pickN<T>(xs: T[], n: number): T[] {
      const pool = [...xs];
      const out: T[] = [];
      while (out.length < Math.min(n, xs.length)) out.push(pool.splice(r.int(0, pool.length - 1), 1)[0]);
      return out;
    }

    const docs: Doc[] = [];
    const create = async (kind: string, party: Party, date: string, given: Lines | LineIn[], extra: Record<string, unknown> = {}, as: DemoApi = api): Promise<Doc> => {
      const terms = party.spec.terms ?? 30;
      const branchId = (extra.branchId as string) ?? pickBranch();
      const currency = party.spec.overseas?.currency ?? 'INR';
      // An overseas customer is billed in their own money: rupee prices are converted at a round rate.
      const lines = (typeof given === 'function' ? given(branchId) : given).map((l) => {
        const price = l.unitPrice as Money | undefined;
        return currency !== 'INR' && price?.currency === 'INR' ? { ...l, unitPrice: cur(Math.max(1, Math.round(price.minor / 100 / (currency === 'USD' ? 83 : 105))), currency) } : l;
      });
      const body = {
        kind,
        partyId: party.id,
        branchId,
        date,
        ...(['invoice', 'purchaseBill', 'debitNote', 'supplierCreditNote', 'proforma'].includes(kind) && { dueDate: addDaysISO(date, terms) }),
        ...(kind === 'quote' && { validUntil: addDaysISO(date, 15) }),
        currency: party.spec.overseas?.currency ?? 'INR',
        lines,
        applyRoundOff: true,
        ...(kind === 'invoice' && { terms: 'Payment due as per terms. Interest at 18% a year on overdue amounts.' }),
        ...(['purchaseBill', 'goodsReceipt'].includes(kind) && { supplierDocNumber: `${party.name.slice(0, 3).toUpperCase()}/${r.int(1000, 9999)}` }),
        ...(kind === 'invoice' && r.chance(0.3) && { customFields: { [poRefField]: `PO-${r.int(10000, 99999)}` } }),
        ...extra,
      };
      // Over the customer's credit limit: the owner lets it through, as they would on the screen.
      const first = await as.raw<Doc & { code?: string }>('POST', `${c}/documents`, body);
      const doc = first.status === 422 && first.body.code === 'CREDIT_LIMIT_EXCEEDED' ? await as.post<Doc>(`${c}/documents`, { ...body, overrideCreditLimit: true }) : first.status < 300 ? first.body : await as.post<Doc>(`${c}/documents`, body);
      docs.push(doc);
      if (doc.status !== 'draft') track(kind, branchId, lines, false);
      return doc;
    };
    const FINAL: Record<string, string> = { invoice: 'issued', purchaseBill: 'issued', creditNote: 'issued', debitNote: 'issued', supplierCreditNote: 'issued', supplierDebitNote: 'issued', salesReturn: 'approved', purchaseReturn: 'approved' };
    const issue = (kind: string, party: Party, date: string, lines: Lines | LineIn[], extra: Record<string, unknown> = {}, as?: DemoApi) => create(kind, party, date, lines, { status: FINAL[kind], ...extra }, as);
    const status = (d: Doc, s: string, reason?: string) => api.post<Doc>(`${c}/documents/${d.id}/status`, { status: s, ...(reason && { reason }) });
    /** Converts, then dates the new draft on the day it happened (a conversion is otherwise dated today). */
    const convert = async (d: Doc, targetKind: string, date: string) => {
      const draft = await api.post<Record<string, any>>(`${c}/documents/${d.id}/convert`, { targetKind });
      const pick = <T extends Record<string, any>>(o: T, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
      const terms = (draft.dueDate && draft.date ? (Date.parse(draft.dueDate) - Date.parse(draft.date)) / 86_400_000 : 0) | 0;
      const body = {
        ...pick(draft, ['kind', 'partyId', 'branchId', 'currency', 'exchangeRate', 'documentDiscountMode', 'documentDiscountValue', 'applyRoundOff', 'notes', 'terms', 'reference', 'supplierDocNumber', 'sourceDocumentId', 'placeOfSupplyStateCode', 'customFields']),
        date,
        ...(draft.dueDate && { dueDate: addDaysISO(date, terms) }),
        ...(draft.validUntil && { validUntil: addDaysISO(date, 15) }),
        lines: (draft.lines as Record<string, any>[]).map((l) => pick(l, ['id', 'itemId', 'name', 'description', 'hsnCode', 'quantity', 'unit', 'unitPrice', 'discountMode', 'discountValue', 'taxCategoryId', 'taxInclusive', 'gst', 'costCentreId'])),
      };
      const out = await api.call<Doc>('PATCH', `${c}/documents/${draft.id}`, body, { 'if-match': `"v${draft.version}"` });
      docs.push(out);
      return out;
    };
    const finalize = async (d: Doc) => {
      type Full = Doc & { lines: { itemId?: string; quantity: number }[]; sourceDocumentId?: string };
      const out = (await api.post<{ document: Full }>(`${c}/documents/${d.id}/finalize`, {})).document;
      track(out.kind, out.branchId, out.lines, !!out.sourceDocumentId);
      return out;
    };

    /** Money in or out, allocated to documents (or left as an advance when none are given). */
    const pay = async (direction: 'received' | 'paid', party: Party, date: string, allocations: { doc: Doc; amount: number; tds?: number }[], opts: { account?: string; method?: string; advance?: number; reference?: string; tdsSection?: string; as?: DemoApi } = {}) => {
      // Notes, returns and earlier payments may have settled part of it since: never more than is left.
      if (allocations.length) {
        const left = new Map((await api.get<{ data: { id: string; outstanding?: Money }[] }>(`${c}/documents?partyId=${party.id}&limit=200`)).data.map((d) => [d.id, (d.outstanding?.minor ?? 0) / 100]));
        allocations = allocations.map((a) => ({ ...a, amount: Math.min(a.amount, Math.max(0, (left.get(a.doc.id) ?? 0) - (a.tds ?? 0))) })).filter((a) => a.amount > 0);
        if (!allocations.length && !opts.advance) return null;
      }
      const total = allocations.reduce((a, x) => a + x.amount, 0) + (opts.advance ?? 0);
      const currency = party.spec.overseas?.currency ?? 'INR';
      let account = opts.account ?? (direction === 'paid' ? bank : r.chance(0.7) ? bank : r.chance(0.5) ? wallet : cash);
      // Foreign money is counted in rupees, roughly; it only matters that the bank isn't overdrawn.
      const inBase = currency === 'INR' ? total : total * (currency === 'USD' ? 83 : 105);
      if (direction === 'received') credit(account, inBase);
      else account = await spendFrom(date, inBase, account === bank ? undefined : account);
      return (opts.as ?? api).post(`${c}/payments`, {
        direction,
        partyId: party.id,
        branchId: allocations[0]?.doc.branchId ?? primary,
        date,
        amount: cur(total, currency),
        currency,
        method: opts.method ?? (account === cash ? 'cash' : account === wallet ? 'upi' : 'bank'),
        accountId: account,
        reference: opts.reference ?? `${direction === 'received' ? 'RCPT' : 'NEFT'}${r.int(100000, 999999)}`,
        allocations: allocations.map((a) => ({ documentId: a.doc.id, amount: cur(a.amount, currency), ...(a.tds && { tdsDeducted: cur(a.tds, currency) }) })),
        ...(opts.tdsSection && { tdsSection: opts.tdsSection }),
      });
    };
    const due = (d: Doc) => d.totals.grandTotal.minor / 100;
    /** Sets a party's spare credit (a note or an advance) against their open documents, as the Adjust screen does. */
    const adjust = async (party: Party, sourceId: string) => {
      const side = customers.some((x) => x.id === party.id) ? 'customer' : 'supplier';
      const list = await api.get<{ credits: { sourceType: 'payment' | 'note'; id: string; left: Money }[]; open: { documentId: string; outstanding: Money }[] }>(`${c}/payments/adjust?partyId=${party.id}&side=${side}`);
      const credit = list.credits.find((x) => x.id === sourceId);
      const target = list.open.find((o) => o.outstanding.minor > 0);
      if (!credit || !target) return;
      const amount = { ...credit.left, minor: Math.min(credit.left.minor, target.outstanding.minor) };
      await api.post(`${c}/payments/adjust`, { partyId: party.id, side, allocations: [{ sourceType: credit.sourceType, sourceId, documentId: target.documentId, amount }] });
    };
    /** A document with a stocked line that can go back, newest first. */
    const returnable = async (from: Doc[]) => {
      for (const d of [...from].reverse()) {
        const full = await api.get<{ lines: { itemId?: string; quantity: number }[] }>(`${c}/documents/${d.id}`);
        const l = full.lines.find((x) => x.itemId && tracked.has(x.itemId));
        if (l) return { doc: d, item: items.find((i) => i.id === l.itemId)!, qty: l.quantity };
      }
      return null;
    };

    /* ---- the timeline ------------------------------------------------------------ */
    type Event = { at: number; seq: number; run: () => Promise<unknown> };
    const events: Event[] = [];
    let seq = 0;
    const on = (daysAgo: number, run: () => Promise<unknown>) => events.push({ at: daysAgo, seq: seq++, run });

    const regulars = customers.filter((x) => !x.spec.overseas && x.name !== 'Walk-in customer' && x.name !== 'Dine-in guests');
    const walkIn = customers.find((x) => x.name === 'Walk-in customer' || x.name === 'Dine-in guests');
    const b2b = regulars.filter((x) => x.gstin);
    const interState = b2b.find((x) => x.spec.state !== homeState) ?? b2b[0] ?? regulars[0];
    const vendor = (i: number) => suppliers[i % suppliers.length];
    const goodsSupplier = suppliers.find((s) => !s.spec.tds && !s.spec.reverseCharge && !s.spec.overseas) ?? suppliers[0];

    // Sales invoices across six months: some paid on time, some partly, some late, some still open.
    const invoices: Doc[] = [];
    const invoicePlan = [175, 168, 160, 151, 143, 136, 128, 119, 110, 101, 93, 84, 77, 69, 61, 54, 47, 40, 33, 27, 21, 16, 11, 7, 4, 2];
    invoicePlan.forEach((back, i) => {
      on(back, async () => {
        const party = regulars[i % regulars.length];
        const inv = await issue('invoice', party, day(back), salesLines(r.int(1, 4), p.type === 'distributor' || p.type === 'wholesale'), {
          ...(centres.length && { costCentreId: r.pick(centres) }),
          ...(p.registered && party.spec.state !== homeState && { placeOfSupplyStateCode: party.spec.state }),
        });
        invoices.push(inv);
        const terms = party.spec.terms ?? 30;
        // Older ones are mostly settled; the newest are open; a few are left overdue on purpose.
        const fate = back > 60 ? r.pick(['paid', 'paid', 'paid', 'partial', 'overdue']) : back > 25 ? r.pick(['paid', 'partial', 'open', 'overdue']) : 'open';
        const tds = party.spec.tds && p.registered ? Math.round((inv.totals.grandTotal.minor / 100 / 1.18) * 0.1) : 0;
        if (fate === 'paid') on(Math.max(0, back - r.int(3, terms)), () => pay('received', party, day(Math.max(0, back - r.int(3, terms))), [{ doc: inv, amount: due(inv) - tds, ...(tds && { tds }) }], tds ? { tdsSection: party.spec.tds } : {}));
        if (fate === 'partial') on(Math.max(0, back - r.int(5, 20)), () => pay('received', party, day(Math.max(0, back - 10)), [{ doc: inv, amount: Math.round(due(inv) * r.pick([0.3, 0.5, 0.6])) }]));
      });
    });

    // Counter sales for a shop or a restaurant: many small bills, paid on the spot.
    if (walkIn) {
      for (let back = 120; back >= 0; back -= p.type === 'restaurant' ? 3 : 4) {
        on(back, async () => {
          const inv = await issue('invoice', walkIn, day(back), salesLines(r.int(2, 5)), { branchId: r.pick(branches).id, dueDate: day(back) });
          // Card and UPI settle into the bank; the rest is cash in the till.
          await pay('received', walkIn, day(back), [{ doc: inv, amount: due(inv) }], { account: r.pick([bank, bank, wallet, cash]) });
        });
      }
    }

    // Quotes in every state, and a sales order through delivery to invoice.
    const qParty = () => r.pick(regulars);
    on(70, async () => {
      const q = await create('quote', qParty(), day(70), salesLines(2));
      await status(q, 'sent');
      await status(q, 'expired');
    });
    on(45, async () => {
      const q = await create('quote', qParty(), day(45), salesLines(3));
      await status(q, 'sent');
      await status(q, 'rejected', 'Went with a cheaper quote');
    });
    on(30, async () => {
      const q = await create('quote', interState, day(30), salesLines(3, true));
      await status(q, 'sent');
      await status(q, 'accepted');
      on(29, async () => {
        const so = await convert(q, 'salesOrder', day(29));
        await finalize(so);
        on(27, async () => {
          if (sellable.some((i) => (i.spec.type ?? 'goods') === 'goods')) {
            const dn = await convert(so, 'delivery', day(27));
            await finalize(dn);
            const inv = await convert(dn, 'invoice', day(27));
            await finalize(inv);
          } else {
            const inv = await convert(so, 'invoice', day(27));
            await finalize(inv);
          }
        });
      });
    });
    on(6, async () => {
      const q = await create('quote', qParty(), day(6), salesLines(2));
      await status(q, 'sent');
    });
    on(1, () => create('quote', qParty(), day(1), salesLines(1)));
    on(12, async () => {
      const pi = await create('proforma', p.traits.exports ? customers.find((x) => x.spec.overseas)! : qParty(), day(12), salesLines(1));
      await status(pi, 'sent').catch(() => undefined);
    });
    on(3, () => create('invoice', qParty(), day(3), salesLines(2), { notes: 'Draft — waiting for the customer to confirm quantities.' }));

    // A cancelled invoice, a credit note against a paid one, a debit note for a short-charge.
    on(95, async () => {
      const inv = await issue('invoice', qParty(), day(95), salesLines(1));
      await status(inv, 'cancelled', 'Raised on the wrong customer');
    });
    on(50, async () => {
      const base = invoices.find((d) => d.status !== 'cancelled') ?? invoices[0];
      const party = customers.find((x) => x.id === base.partyId)!;
      // One against a specific invoice (it reduces that invoice)…
      // At a rate the invoice charged: a note adjusts tax only at its source's rates.
      const charged = sellable.find((it) => (base as { lines?: { itemId?: string }[] }).lines?.some((l) => l.itemId === it.id)) ?? sellable[0];
      await issue('creditNote', party, day(50), [{ ...line(charged, 1, { price: Math.max(1, Math.round(due(base) * 0.05)) }), itemId: undefined, name: 'Rate difference allowed' }], { sourceDocumentId: base.id, noteReason: 'discount', noteGst: 'withGst', originalNumber: base.number, originalDate: base.date });
      // …and a quarterly discount left as credit, then set against whatever they owe next.
      const regular = regulars[0];
      // A note with GST names one of the customer's own invoices, and is for no more than it was (s.34).
      const theirs = invoices.find((d) => d.partyId === regular.id && d.status !== 'cancelled') ?? base;
      const note = await issue('creditNote', regular, day(49), [{ ...line(sellable[0], 1, { price: Math.max(1, Math.min(4000, Math.round(due(theirs) * 0.5))) }), itemId: undefined, name: 'Quarterly volume discount' }], { noteReason: 'discount', noteGst: 'withGst', originalNumber: theirs.number, originalDate: theirs.date });
      on(47, () => adjust(regular, note.id));
    });
    on(38, async () => {
      const base = invoices[invoices.length - 1];
      const party = customers.find((x) => x.id === base.partyId)!;
      await issue('debitNote', party, day(38), [{ ...line(sellable[0], 1, { price: 1500 }), itemId: undefined, name: 'Freight charged short' }], { sourceDocumentId: base.id, noteReason: 'priceChange', noteGst: 'withGst', originalNumber: base.number, originalDate: base.date });
    });
    const goodsSold = sellable.filter((i) => (i.spec.type ?? 'goods') === 'goods');
    if (goodsSold.length) {
      on(42, async () => {
        const back = await returnable(invoices.filter((d) => d.date <= day(42) && d.partyId !== walkIn?.id));
        if (!back) return;
        const party = customers.find((x) => x.id === back.doc.partyId)!;
        await issue('salesReturn', party, day(42), [line(back.item, Math.min(2, back.qty))], { branchId: back.doc.branchId, sourceDocumentId: back.doc.id, originalNumber: back.doc.number, originalDate: back.doc.date, noteReason: 'deficiency' });
      });
    }

    // Advance received, later used; a refund.
    on(24, async () => {
      const party = regulars[1 % regulars.length];
      const adv = await pay('received', party, day(24), [], { advance: 25000, reference: 'ADVANCE' });
      on(9, async () => {
        const inv = await issue('invoice', party, day(9), salesLines(2));
        void inv;
        await adjust(party, adv.id);
      });
    });
    on(18, async () => {
      const party = regulars[2 % regulars.length];
      const adv = await pay('received', party, day(18), [], { advance: 8000, reference: 'ADV-ORDER-CANCELLED' });
      await spendFrom(day(15), 8000, bank);
      await api.post(`${c}/payments`, { direction: 'paid', partyId: party.id, branchId: primary, date: day(15), amount: inr(8000), currency: 'INR', method: 'bank', accountId: bank, refundOf: adv.id, reference: 'REFUND', allocations: [] }).catch((e) => ctx.log(`refund skipped: ${String(e).slice(0, 700)}`));
    });

    // Exports under LUT, in the customer's currency.
    for (const ov of customers.filter((x) => x.spec.overseas)) {
      for (const back of [150, 88, 35, 8]) {
        on(back, async () => {
          const it = sellable[r.int(0, sellable.length - 1)];
          const inv = await issue('invoice', ov, day(back), [{ ...line(it, r.int(2, 6)), unitPrice: cur(Math.round(it.spec.sale / 80), ov.spec.overseas!.currency) }], { placeOfSupplyStateCode: '96' });
          invoices.push(inv);
          if (back > 30) on(back - 25, () => pay('received', ov, day(back - 25), [{ doc: inv, amount: due(inv) }], { account: bank, method: 'bank', reference: 'SWIFT' }));
        });
      }
    }

    // Recurring retainers: the template invoice repeats monthly from here on.
    if (p.traits.retainers) {
      on(40, async () => {
        const party = regulars[0];
        const inv = await issue('invoice', party, day(40), [line(sellable[0], 1)]);
        await api.put(`${c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly', autoSend: false });
      });
    }

    // Scrap sold with TCS.
    if (p.traits.scrapTcs) {
      const scrapBuyer = customers.find((x) => x.spec.tcs)!;
      const scrap = items.find((i) => i.spec.category === 'Scrap')!;
      for (const back of [100, 55, 14]) on(back, async () => {
        const inv = await issue('invoice', scrapBuyer, day(back), [line(scrap, fit(scrap, r.int(500, 900), primary) || 1)], { branchId: primary, tcsSection: 'scrap', dueDate: day(back) });
        await pay('received', scrapBuyer, day(back), [{ doc: inv, amount: due(inv) }], { account: bank });
      });
    }

    // Purchases: an order received in part and billed, bills paid and unpaid, a return, supplier notes.
    const bills: Doc[] = [];
    if (buyable.length) {
      const billPlan = [178, 165, 150, 132, 118, 99, 83, 66, 52, 37, 23, 13, 5];
      billPlan.forEach((back, i) => {
        on(back + 0.5, async () => {
          const s = i % 3 === 2 ? vendor(i) : goodsSupplier;
          if (s.spec.reverseCharge || s.spec.overseas) return;
          const bill = await issue('purchaseBill', s, day(back), buyLines(r.int(1, 3)), { ...(centres.length && { costCentreId: r.pick(centres) }) });
          bills.push(bill);
          const terms = s.spec.terms ?? 30;
          const fate = back > 50 ? r.pick(['paid', 'paid', 'partial']) : back > 20 ? r.pick(['paid', 'open']) : 'open';
          if (fate === 'paid') on(Math.max(0, back - Math.min(terms, 40)), () => pay('paid', s, day(Math.max(0, back - Math.min(terms, 40))), [{ doc: bill, amount: due(bill) }], { account: bank }));
          if (fate === 'partial') on(Math.max(0, back - 15), () => pay('paid', s, day(Math.max(0, back - 15)), [{ doc: bill, amount: Math.round(due(bill) / 2) }], { account: bank }));
        });
      });
      on(60, async () => {
        const po = await create('purchaseOrder', goodsSupplier, day(60), buyLines(2), { branchId: other });
        await finalize(po);
        on(56, async () => {
          const grn = await convert(po, 'goodsReceipt', day(56));
          await finalize(grn);
          on(55, async () => {
            const bill = await convert(grn, 'purchaseBill', day(55));
            bills.push(await finalize(bill));
          });
        });
      });
      on(20, async () => {
        // Received, not billed yet: shows in goods received not billed.
        const po = await create('purchaseOrder', goodsSupplier, day(20), buyLines(1));
        await finalize(po);
        on(17, async () => {
          const grn = await convert(po, 'goodsReceipt', day(17));
          await finalize(grn);
        });
      });
      on(4, async () => {
        const po = await create('purchaseOrder', vendor(1), day(4), buyLines(2));
        await finalize(po);
      });
      on(44, async () => {
        const back = await returnable(bills);
        if (!back) return;
        const s = suppliers.find((x) => x.id === back.doc.partyId)!;
        const qty = Math.min(2, back.qty, Math.floor(have(back.item.id, back.doc.branchId) / 3));
        if (qty < 1) return;
        await issue('purchaseReturn', s, day(44), [line(back.item, qty, { buy: true })], { branchId: back.doc.branchId, sourceDocumentId: back.doc.id, originalNumber: back.doc.number, originalDate: back.doc.date, noteReason: 'deficiency' });
      });
      on(31, async () => {
        const base = bills[1] ?? bills[0];
        const s = suppliers.find((x) => x.id === base.partyId)!;
        await issue('supplierCreditNote', s, day(31), [{ ...line(buyable[0], 1, { price: 2000, buy: true }), itemId: undefined, name: 'Volume discount for the quarter' }], { sourceDocumentId: base.id, originalNumber: base.number, originalDate: base.date, noteReason: 'discount', noteGst: 'withGst' });
      });
      on(26, async () => {
        const base = bills[2] ?? bills[0];
        const s = suppliers.find((x) => x.id === base.partyId)!;
        await issue('supplierDebitNote', s, day(26), [{ ...line(buyable[0], 1, { price: 1200, buy: true }), itemId: undefined, name: 'Short supply recovered' }], { sourceDocumentId: base.id, originalNumber: base.number, originalDate: base.date, noteReason: 'deficiency', noteGst: 'withGst' });
      });
    }

    // Service bills with TDS, and a reverse-charge supply.
    for (const s of suppliers.filter((x) => x.spec.tds && !x.spec.reverseCharge)) {
      for (const back of [140, 80, 25]) on(back, async () => {
        const bill = await issue('purchaseBill', s, day(back), [{ name: s.spec.tds === '194IB' || s.spec.tds === '194IA' ? 'Office space — monthly' : 'Professional / contract services', quantity: 1, unit: 'NOS', unitPrice: inr(r.int(40, 120) * 1000), discountMode: 'percent', discountValue: 0, taxCategoryId: tax(p.registered ? 18 : 0), taxInclusive: false }], { tdsSection: s.spec.tds });
        bills.push(bill);
        if (back > 30) on(back - 10, () => pay('paid', s, day(back - 10), [{ doc: bill, amount: due(bill) }], { account: bank }).catch(() => undefined));
      });
    }
    for (const s of suppliers.filter((x) => x.spec.reverseCharge && !x.spec.overseas)) {
      for (const back of [110, 46]) on(back, () => issue('purchaseBill', s, day(back), [{ name: p.type === 'manufacturer' ? 'Security services' : 'Goods transport (GTA)', quantity: 1, unit: 'NOS', unitPrice: inr(r.int(18, 40) * 1000), discountMode: 'percent', discountValue: 0, taxCategoryId: tax(p.registered ? (p.type === 'manufacturer' ? 18 : 5) : 0), taxInclusive: false }], { reverseCharge: p.registered, ...(s.spec.tds && { tdsSection: s.spec.tds }) }));
    }

    // Opening balances from before the books moved here.
    on(199, () =>
      api.post(`${c}/documents/openings/import`, {
        rows: [
          { kind: 'openingInvoice', party: regulars[0].name, number: 'OLD/INV/0912', date: day(230), dueDate: day(200), amount: inr(58400) },
          { kind: 'openingInvoice', party: regulars[regulars.length - 1].name, number: 'OLD/INV/0957', date: day(215), dueDate: day(185), amount: inr(21750) },
          { kind: 'openingBill', party: suppliers[0].name, number: `${suppliers[0].name.slice(0, 3).toUpperCase()}/7781`, date: day(220), dueDate: day(190), amount: inr(44300) },
        ],
      }),
    );

    // Stock: damage written off, a recount, a transfer between branches.
    const goodsHeld = items.filter((i) => tracked.has(i.id) && (i.spec.stock ?? 0) > 0);
    if (goodsHeld.length) {
      // The other branches opened with stock of their own.
      on(199.2, async () => {
        for (const b of branches.filter((x) => x.id !== primary)) {
          const lines = goodsHeld.map((it) => ({ itemId: it.id, quantity: Math.round((it.spec.stock ?? 0) * 0.6), unitCost: inr(it.spec.purchase || Math.round(it.spec.sale * 0.6)) }));
          await api.post(`${c}/stock/adjustments`, { branchId: b.id, date: day(199), type: 'opening', notes: 'Opening stock', lines });
          for (const l of lines) move(l.itemId, b.id, l.quantity);
        }
      });
      const adjust = async (back: number, reason: string, notes: string, it: Item, q: number) => {
        const qty = q < 0 ? -Math.min(-q, Math.floor(have(it.id, primary) / 3)) : q;
        if (!qty) return;
        await api.post(`${c}/stock/adjustments`, { branchId: primary, date: day(back), reason, notes, lines: [{ itemId: it.id, quantity: qty }] });
        move(it.id, primary, qty);
      };
      const transfer = async (back: number, it: Item, to: string, q: number, notes?: string) => {
        const qty = Math.min(q, Math.floor(have(it.id, primary) / 3));
        if (qty < 1) return;
        await api.post(`${c}/stock/transfers`, { itemId: it.id, fromBranchId: primary, toBranchId: to, quantity: qty, date: day(back), ...(notes && { notes }) });
        move(it.id, primary, -qty);
        move(it.id, to, qty);
      };
      on(57, () => adjust(57, 'damaged', 'Damaged in unloading', goodsHeld[0], -3));
      on(29, () => adjust(29, 'recount', 'Quarterly count', goodsHeld[1] ?? goodsHeld[0], 4));
      on(21, () => adjust(21, 'expired', 'Past its best-before date', goodsHeld[2] ?? goodsHeld[0], -2));
      on(34, () => transfer(34, goodsHeld[0], other, 10, 'Replenishing the branch'));
      on(10, () => transfer(10, goodsHeld[1] ?? goodsHeld[0], branches[branches.length - 1].id, 6));
    }

    // Expenses every month, by branch and cost centre; rent repeats on its own.
    const expenseRows: { id: string; date: string; amount: number; account: string }[] = [];
    for (let m = 5; m >= 0; m--) {
      for (const [name, amount, rate] of p.traits.expenses) {
        const back = m * 30 + r.int(1, 8);
        on(back, async () => {
          const gross = Math.round(amount * (0.9 + r.next() * 0.2));
          const taxAmt = p.registered && rate ? Math.round((gross * rate) / (100 + rate)) : 0;
          const account = await spendFrom(day(back), gross);
          const e = await api.post(`${c}/expenses`, {
            branchId: name === 'Rent' && m % 2 ? other : pickBranch(),
            categoryId: expCat(name),
            date: day(back),
            amount: inr(gross),
            currency: 'INR',
            ...(taxAmt && { taxCategoryId: tax(rate), taxAmount: inr(taxAmt), taxInclusive: true }),
            accountId: account,
            method: account === cash ? 'cash' : account === wallet ? 'upi' : 'bank',
            reference: `${name.slice(0, 3).toUpperCase()}-${r.int(1000, 9999)}`,
            ...(centres.length && { costCentreId: r.pick(centres) }),
            ...(name === 'Rent' && m === 0 && { recurrence: 'monthly' }),
            ...(name.startsWith('Transport') && vehicles.length && { vehicleId: r.pick(vehicles) }),
          });
          expenseRows.push({ id: e.id, date: day(back), amount: gross, account });
        });
      }
    }
    // Billable to a customer, and one with blocked credit.
    on(22, async () => api.post(`${c}/expenses`, { branchId: primary, categoryId: expCat('Travel'), date: day(22), amount: inr(3400), currency: 'INR', ...(await (async () => { const a = await spendFrom(day(22), 3400); return { accountId: a, method: a === cash ? 'cash' : a === wallet ? 'upi' : 'bank' }; })()), notes: 'Site visit — recharged to the customer', billable: true, customerId: regulars[0].id }));
    on(16, async () => api.post(`${c}/expenses`, { branchId: primary, categoryId: expCat('Office supplies'), date: day(16), amount: inr(3540), currency: 'INR', ...(p.registered && { taxCategoryId: tax(18), taxAmount: inr(540), taxInclusive: true, itcEligibility: 'blocked' }), ...(await (async () => { const a = await spendFrom(day(16), 3540); return { accountId: a, method: a === cash ? 'cash' : a === wallet ? 'upi' : 'bank' }; })()), notes: 'Team lunch (credit blocked, s.17(5))' }));

    // Books: loans, a contra, a provision, a draft left to finish, and a template.
    on(190, () => (credit(bank, 500000), api.post(`${c}/vouchers`, { kind: 'journal', date: day(190), branchId: primary, narration: 'Capital brought in', lines: [{ account: `pay:${bank}`, debit: inr(500000), credit: inr(0) }, { account: `acc:${capitalIn}`, debit: inr(0), credit: inr(500000) }] })));
    on(120, async () => {
      const amount = Math.min(20000, Math.floor((bal.get(cash) ?? 0) / 1000) * 1000);
      if (amount < 1000) return;
      await api.post(`${c}/vouchers`, { kind: 'contra', date: day(120), branchId: primary, narration: 'Cash deposited in bank', lines: [{ account: `pay:${bank}`, debit: inr(amount), credit: inr(0) }, { account: `pay:${cash}`, debit: inr(0), credit: inr(amount) }] });
      credit(cash, -amount);
      credit(bank, amount);
    });
    on(90, async () => (await spendFrom(day(90), 50000, bank), api.post(`${c}/vouchers`, { kind: 'journal', date: day(90), branchId: primary, narration: 'Loan instalment — principal', lines: [{ account: `acc:${p.type === 'freelancer' || p.type === 'other' ? directorLoan : loan}`, debit: inr(50000), credit: inr(0) }, { account: `pay:${bank}`, debit: inr(0), credit: inr(50000) }] })));
    on(35, () => api.post(`${c}/vouchers`, { kind: 'journal', date: day(35), branchId: primary, narration: 'Audit fee provided for the half year', reference: 'PROV-H1', lines: [{ account: `acc:${auditFees}`, debit: inr(45000), credit: inr(0), ...(centres.length && { costCentreId: centres[0] }) }, { account: `acc:${provision}`, debit: inr(0), credit: inr(45000) }] }));
    on(2, () => api.post(`${c}/vouchers`, { kind: 'journal', date: day(2), branchId: primary, status: 'draft', narration: 'Prepaid insurance — to check with the CA', lines: [{ account: `acc:${deposit}`, debit: inr(12000), credit: inr(0) }] }));
    on(0, () => api.post(`${c}/voucher-templates`, { name: 'Monthly loan instalment', kind: 'journal', narration: 'EMI to the bank', lines: [{ account: `acc:${p.type === 'freelancer' || p.type === 'other' ? directorLoan : loan}`, side: 'dr', amount: inr(50000) }, { account: `pay:${bank}`, side: 'cr', amount: inr(50000) }] }));

    // Fixed assets: bought on different dates, two methods, one sold.
    for (const a of p.traits.assets) {
      on(Math.min(a.months * 30, 199), () =>
        api.post(`${c}/fixed-assets`, {
          branchId: primary,
          name: a.name,
          category: a.category,
          account: a.account,
          assetCode: `FA-${a.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}-${r.int(10, 99)}`,
          acquiredOn: day(a.months * 30),
          inUseFrom: day(a.months * 30 - 5),
          cost: inr(a.cost),
          residualValue: inr(Math.round(a.cost * 0.05)),
          method: a.method,
          ...(a.method === 'slm' ? { lifeMonths: a.life ?? 60 } : { rate: a.rate ?? 15 }),
          ...(a.months * 30 > 200 && { openingDepreciation: inr(Math.round(a.cost * 0.12)), openingAsOf: opened }),
          ...(centres.length && { costCentreId: centres[0] }),
          ...(a.disposed && { disposedOn: day(30), disposalNote: 'Sold for scrap value' }),
        }),
      );
    }

    // Payment approvals: run by an accountant, decided by the owner.
    on(14, async () => {
      const big = Math.max(...p.traits.expenses.map(([, x]) => x)) / 2;
      const companyNow = await api.get(c);
      await api.put(c, { ...companyNow, approvalRules: [{ kind: 'payment', overMinor: Math.round(big) * 100 }, { kind: 'invoice', overMinor: 500000_00 }] }, { 'if-match': `"v${companyNow.version}"` });
      const held: string[] = [];
      for (const [i, s] of [0, 1, 2].map((k) => suppliers[k % suppliers.length]).entries()) {
        const res = await ctx.team.accountant.raw('POST', `${c}/payments`, { direction: 'paid', partyId: s.id, branchId: primary, date: day(14 - i), amount: inr(Math.round(big) + 5000 * (i + 1)), currency: 'INR', method: 'bank', accountId: bank, reference: `REQ-${i + 1}`, allocations: [] });
        const id = (res.body as { details?: { requestId?: string }; requestId?: string })?.requestId ?? (res.body as { details?: { requestId?: string } })?.details?.requestId;
        if (id) held.push(id);
      }
      const pending = (await api.get<{ data: { id: string }[] }>(`${c}/payment-requests?status=pending`)).data.map((x) => x.id);
      const ids = held.length ? held : pending;
      if (ids[0]) {
        await spendFrom(day(14), Math.round(big) + 5000, bank);
        await api.post(`${c}/payment-requests/${ids[0]}/approve`);
      }
      if (ids[1]) await api.post(`${c}/payment-requests/${ids[1]}/reject`, { note: 'Hold until the supplier sends the corrected bill' });
      // ids[2] stays pending.
      // A large invoice from the accountant waits for approval; another was sent back.
      // Big enough to need approval: a service, or a little stock at a contract price.
      const top = sellable.find((i) => !tracked.has(i.id)) ?? [...sellable].sort((a, z) => have(z.id, primary) - have(a.id, primary))[0];
      const qty = Math.max(1, fit(top, 2, primary));
      const price = Math.ceil(600000 / qty);
      const heldLines = [line(top, qty, { price })];
      await create('invoice', regulars[0], day(5), heldLines, { status: 'issued', branchId: primary }, ctx.team.accountant);
      const sentBack = await create('invoice', regulars[1 % regulars.length], day(4), [line(top, qty, { price: price + 1000 })], { status: 'issued', branchId: primary }, ctx.team.accountant);
      // Waiting for approval, they still hold their stock in the app's count.
      track('invoice', primary, [...heldLines, ...heldLines], false);
      await api.post(`${c}/documents/${sentBack.id}/reject`, { note: 'Price is below our floor — please recheck' }).catch(() => undefined);
    });

    /* ---- run it, oldest first -------------------------------------------------------- */
    // Events can queue more events (a payment after its invoice); keep draining in date order.
    while (events.length) {
      events.sort((a, b) => b.at - a.at || a.seq - b.seq);
      const next = events.shift()!;
      await next.run();
    }

    /* ---- budget for this year ---------------------------------------------------------- */
    const fyStart = `${Number(ctx.today.slice(5, 7)) >= 4 ? ctx.today.slice(0, 4) : Number(ctx.today.slice(0, 4)) - 1}-04-01`;
    const months = (monthly: number, grow = 0) => Array.from({ length: 12 }, (_, i) => Math.round(monthly * (1 + grow * i)) * 100);
    const salesMonthly = Math.round(invoices.reduce((a, d) => a + d.totals.grandTotal.minor, 0) / 100 / 6);
    await api.post(`${c}/budgets`, {
      name: `Plan ${fyStart.slice(0, 4)}-${String(Number(fyStart.slice(2, 4)) + 1)}`,
      yearFrom: fyStart,
      notes: 'Approved by the board in April.',
      lines: [
        { account: 'sys:sales', months: months(salesMonthly * 0.95, 0.02) },
        ...p.traits.expenses.slice(0, 3).map(([name, amount], i) => ({ account: `exp:${expCat(name)}`, months: months(i === 0 ? amount * 0.8 : amount * 1.1) })),
      ],
    });
    if (centres.length) await api.post(`${c}/budgets`, { name: `${p.traits.costCentres[0].name} — spend cap`, yearFrom: fyStart, costCentreId: centres[0], lines: [{ account: `exp:${expCat(p.traits.expenses[0][0])}`, months: months(p.traits.expenses[0][1] * 0.3) }] });

    /* ---- the bank statement --------------------------------------------------------------- */
    await bankStatement();

    /* ---- compliance -------------------------------------------------------------------------- */
    if (p.registered) await compliance();
    if (p.registered) await gstReturns().catch((e) => ctx.log(`GST returns skipped: ${String(e).slice(0, 700)}`));

    return { branchIds: branches.map((b) => b.id) };

    async function bankStatement() {
      const pays = (await api.get<{ data: { id: string; date: string; direction: string; amount: Money; accountId: string; reference?: string; partyName?: string }[] }>(`${c}/payments?limit=200`)).data.filter((x) => x.accountId === bank);
      const from = day(45);
      const recent = pays.filter((x) => x.date >= from).slice(0, 12);
      const exp = expenseRows.filter((e) => e.account === bank && e.date >= from).slice(0, 4);
      const lines = [
        ...recent.map((x) => ({ date: x.date, description: `${x.direction === 'received' ? 'NEFT CR' : 'NEFT DR'} ${x.reference ?? ''} ${x.partyName ?? ''}`.trim(), reference: x.reference, amount: inr((x.direction === 'received' ? 1 : -1) * (x.amount.minor / 100)) })),
        ...exp.map((e) => ({ date: e.date, description: `IMPS DR ${e.id.slice(-6)}`, amount: inr(-e.amount) })),
        { date: day(28), description: 'SMS ALERT CHARGES QTR', amount: inr(-59) },
        { date: day(21), description: 'INTEREST CREDIT ON SWEEP FD', amount: inr(1840) },
        { date: day(19), description: `UPI/CR/${r.int(100000, 999999)}/${regulars[0].name.toUpperCase().slice(0, 14)}`, amount: inr(15000) },
        { date: day(12), description: 'SELF TRANSFER TO OWN ACCOUNT', amount: inr(-10000) },
        { date: day(8), description: 'CHQ DEP 004412 CLEARING', amount: inr(12600) },
        { date: day(3), description: 'POS PURCHASE OFFICE MART', amount: inr(-2360) },
      ].sort((a, b) => a.date.localeCompare(b.date));
      const imported = await api.post(`${c}/payment-accounts/${bank}/bank-statements`, { fileName: `${p.bank.name.replace(/\s+/g, '_')}_statement.csv`, lines });
      const bankLines = (await api.get<{ data: { id: string; description: string; status: string; amount: Money; suggestion?: { type: string; id: string } }[] }>(`${c}/payment-accounts/${bank}/bank-lines?limit=200`)).data;
      void imported;
      // Matched: each recorded payment to its line (auto-suggested where the app found it).
      for (const bl of bankLines.filter((x) => x.status === 'unmatched')) {
        const cand = await api.get<{ data: { type: string; id: string }[] }>(`${c}/bank-lines/${bl.id}/candidates`).catch(() => ({ data: [] }));
        const first = cand.data[0];
        if (first && !/SMS ALERT|INTEREST|UPI\/CR|SELF TRANSFER|CHQ DEP|POS PURCHASE/.test(bl.description) && r.chance(0.85)) await api.post(`${c}/bank-lines/${bl.id}/match`, { type: first.type, id: first.id }).catch(() => undefined);
      }
      const find = (re: RegExp) => bankLines.find((x) => re.test(x.description));
      const charges = find(/SMS ALERT/);
      if (charges) await api.post(`${c}/bank-lines/${charges.id}/expense`, { categoryId: expCat('Bank charges'), notes: 'Bank SMS charges' }).catch(() => undefined);
      const interest = find(/INTEREST CREDIT/);
      if (interest) await api.post(`${c}/bank-lines/${interest.id}/voucher`, { account: `acc:${interestIncome}`, narration: 'Interest on sweep deposit' }).catch(() => undefined);
      const upi = find(/UPI\/CR/);
      const openInv = invoices.find((d) => d.partyId === regulars[0].id && d.status !== 'cancelled');
      if (upi) await api.post(`${c}/bank-lines/${upi.id}/payment`, { partyId: regulars[0].id, method: 'upi', allocations: openInv ? [{ documentId: openInv.id, amount: inr(Math.min(15000, due(openInv))) }] : [], notes: 'Received on UPI' }).catch(() => undefined);
      const self = find(/SELF TRANSFER/);
      if (self) await api.post(`${c}/bank-lines/${self.id}/exclude`, { reason: 'Transfer between own accounts' });
      // The cheque and the card purchase are left for the visitor to reconcile.
    }

    /**
     * GSTR-2B made from the business's own purchase bills (with the usual differences), returns filed
     * for the months before last by a monthly filer, and last month's 2B left to review. Filing closes
     * a month's books, so this runs after all the trading.
     */
    async function gstReturns() {
      const OTP = '575757';
      await api.post(`${c}/gst/portal-sessions/otp`, { gstin: ownGstin, username: `${p.key}_gst` });
      await api.post(`${c}/gst/portal-sessions`, { gstin: ownGstin, otp: OTP });
      const period = (back: number) => {
        const d = new Date(`${ctx.today}T00:00:00Z`);
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - back);
        return { code: `${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`, prefix: d.toISOString().slice(0, 7) };
      };
      const allBills = (await api.get<{ data: { id: string; number: string; partyId: string; date: string; supplierDocNumber?: string; grandTotal: Money; totalTax?: Money; status: string }[] }>(`${c}/documents?kind=purchaseBill&limit=200`)).data;
      const entriesFor = (prefix: string, differences: boolean): Gstr2bEntry[] => {
        const out: Gstr2bEntry[] = [];
        const bills = allBills.filter((b) => b.date.startsWith(prefix) && b.status !== 'cancelled' && b.supplierDocNumber);
        bills.forEach((b, i) => {
          const s = suppliers.find((x) => x.id === b.partyId);
          if (!s?.gstin || s.spec.reverseCharge) return;
          // One the supplier hasn't reported yet: in the books, not in 2B.
          if (differences && i === 0) return;
          const tax = b.totalTax?.minor ?? 0;
          let taxable = b.grandTotal.minor - tax;
          // One reported with a different value: a mismatch to look into.
          if (differences && i === 1) taxable = Math.round(taxable * 0.97);
          const inter = s.spec.state !== homeState;
          out.push({ section: 'b2b', supplierGstin: s.gstin, supplierName: s.name, documentType: 'I', number: b.supplierDocNumber!, date: b.date, placeOfSupply: homeState, reverseCharge: false, taxableMinor: taxable, igstMinor: inter ? tax : 0, cgstMinor: inter ? 0 : Math.floor(tax / 2), sgstMinor: inter ? 0 : Math.ceil(tax / 2), cessMinor: 0, itcAvailable: true, supplierFiledOn: `${prefix}-11` });
        });
        if (differences) {
          // A supplier's invoice the business never recorded.
          const s = suppliers.find((x) => x.gstin && !x.spec.reverseCharge) ?? suppliers[0];
          if (s?.gstin) out.push({ section: 'b2b', supplierGstin: s.gstin, supplierName: s.name, documentType: 'I', number: `${s.name.slice(0, 3).toUpperCase()}/${r.int(5000, 5999)}`, date: `${prefix}-18`, placeOfSupply: homeState, reverseCharge: false, taxableMinor: 1840000, igstMinor: 0, cgstMinor: 165600, sgstMinor: 165600, cessMinor: 0, itcAvailable: true, supplierFiledOn: `${prefix}-11` });
        }
        return out;
      };
      // Monthly filers: the three months before last are filed; last month is open, its 2B to review.
      if ((p.returnFrequency ?? 'monthly') === 'monthly') {
        for (const back of [4, 3, 2]) {
          const per = period(back);
          ctx.gstr2b.set(`${ownGstin}|${per.code}`, entriesFor(per.prefix, false));
          const body = { gstin: ownGstin, period: per.code };
          await api.post(`${c}/gst/gstr2b/fetch`, body);
          await api.post(`${c}/gst/gstr2b/claim`, body).catch(() => undefined);
          await api.post(`${c}/gst/returns/gstr1/save`, body);
          await api.post(`${c}/gst/returns/gstr1/proceed`, body);
          await api.post(`${c}/gst/returns/gstr1/evc`, { ...body, pan });
          await api.post(`${c}/gst/returns/gstr1/file`, { ...body, pan, otp: OTP });
          await api.post(`${c}/gst/returns/gstr3b/save`, body);
          await api.post(`${c}/gst/returns/gstr3b/offset`, body);
          await api.post(`${c}/gst/returns/gstr3b/file`, { ...body, pan, otp: OTP });
        }
      }
      const last = period(1);
      ctx.gstr2b.set(`${ownGstin}|${last.code}`, entriesFor(last.prefix, true));
      await api.post(`${c}/gst/gstr2b/fetch`, { gstin: ownGstin, period: last.code });
      // GSTR-1 for last month prepared and saved, not filed: the visitor sees what is due.
      if ((p.returnFrequency ?? 'monthly') === 'monthly') await api.post(`${c}/gst/returns/gstr1/save`, { gstin: ownGstin, period: last.code }).catch(() => undefined);
    }

    async function compliance() {
      if (!p.traits.einvoice && !p.traits.eway) return;
      await api.put(`${c}/compliance-settings`, { eInvoiceEnabled: !!p.traits.einvoice, annualTurnover: inr(72000000), ewayBillEnabled: !!p.traits.eway, ...(transporter && { defaultTransporterId: transporter.gstin, defaultTransporterName: transporter.name }), defaultDistanceKm: 180 });
      await api.put(`${c}/compliance-settings/credentials`, { portal: 'both', username: `${p.key}_api`, password: 'sandbox-pass-1' });
      const recent = invoices.filter((d) => d.date >= day(20) && d.currency === 'INR');
      const b2bInv = recent.filter((d) => b2b.some((x) => x.id === d.partyId));
      if (p.traits.einvoice) {
        for (const d of b2bInv.slice(0, 3)) await api.post(`${c}/documents/${d.id}/e-invoice`).catch((e) => ctx.log(`e-invoice skipped: ${String(e).slice(0, 700)}`));
        if (b2bInv[2]) await api.post(`${c}/documents/${b2bInv[2].id}/e-invoice/cancel`, { reasonCode: 2, remark: 'Data entry mistake' }).catch(() => undefined);
      }
      if (p.traits.eway && transporter) {
        // Only a consignment over the threshold needs one.
        const heavy = invoices.filter((d) => d.date >= day(12) && d.currency === 'INR' && b2b.some((x) => x.id === d.partyId) && d.totals.grandTotal.minor >= 50000_00);
        for (const [i, d] of heavy.slice(0, 2).entries()) {
          const party = customers.find((x) => x.id === d.partyId)!;
          const br = p.branches[0];
          const bill = await api
            .post(`${c}/eway-bills`, {
              documentId: d.id,
              subSupplyType: 'supply',
              transactionType: 1,
              from: { legalName: p.legalName, gstin: ownGstin, address1: br.address.line1, place: br.address.city, pincode: br.address.postalCode, stateCode: br.address.stateCode },
              to: { legalName: party.name, gstin: party.gstin, address1: party.spec.line1, place: party.spec.city, pincode: party.spec.pin, stateCode: party.spec.state },
              transporterId: transporter.gstin,
              transporterName: transporter.name,
              transportMode: 'road',
              vehicleNumber: (p.traits.vehicles ?? ['MH04AB1234'])[0],
              vehicleType: 'regular',
              distanceKm: party.spec.state === homeState ? 120 : 640,
            })
            .catch((e) => void ctx.log(`e-way bill skipped: ${String(e).slice(0, 700)}`));
          if (bill && i === 0)
            await api
              .post(`${c}/eway-bills/${bill.id}/part-b`, { mode: 'road', vehicleNumber: (p.traits.vehicles ?? ['MH04AB1234'])[1] ?? 'MH04ZZ9911', vehicleType: 'regular', fromPlace: br.address.city, fromStateCode: br.address.stateCode, reasonCode: 1, remark: 'Vehicle broke down' })
              .catch(() => undefined);
        }
      }
    }
  }
}

function stateName(code: string) {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}
