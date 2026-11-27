import { useCallback, useEffect, useState } from 'react';
import { gstinChecksum } from '@esmart/core/domain/gstin';
import { financialYearStart, type Ctx } from './kit';
import type { Sheet } from './sheets';

/**
 * Demo tools: made-up records for every kind of data, so a demo or a test starts without an Excel file.
 * They are hidden from ordinary users. Ctrl+Shift+D turns them on or off (and it is remembered), or a
 * build made with VITE_DEMO_TOOLS=1 starts with them on.
 */
const KEY = 'esmart.migrator.demo';

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

export function useDemoTools() {
  const [on, setOn] = useState<boolean>(() => stored() ?? (import.meta.env?.VITE_DEMO_TOOLS === '1' || !!import.meta.env?.DEV));
  const set = useCallback((value: boolean) => {
    setOn(value);
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      // Not remembered; it holds for this session.
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOn((v) => {
          try {
            localStorage.setItem(KEY, v ? '0' : '1');
          } catch {
            // Not remembered.
          }
          return !v;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { on, set };
}

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** A short tag so each load is a fresh set (new names, new numbers) and can be told from real records. */
export const newTag = () => Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, 'X');

/** A small seeded random generator: the same tag always gives the same sample, a new tag a different one. */
function seeded(tag: string) {
  let h = 2166136261;
  for (const c of tag) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  /** `n` different entries of a list, in a random order. */
  const some = <T>(list: readonly T[], n: number) => {
    const pool = [...list];
    const out: T[] = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
    return out;
  };
  return { int, pick, some };
}

// A city, its state (as the GST list names it), the state's GST code, and a real PIN code of that city.
export const PLACES = [
  { city: 'Mumbai', state: 'Maharashtra', code: '27', pin: '400001' },
  { city: 'Pune', state: 'Maharashtra', code: '27', pin: '411001' },
  { city: 'Nagpur', state: 'Maharashtra', code: '27', pin: '440001' },
  { city: 'Chennai', state: 'Tamil Nadu', code: '33', pin: '600002' },
  { city: 'Coimbatore', state: 'Tamil Nadu', code: '33', pin: '641001' },
  { city: 'Bengaluru', state: 'Karnataka', code: '29', pin: '560001' },
  { city: 'Mysuru', state: 'Karnataka', code: '29', pin: '570001' },
  { city: 'Hyderabad', state: 'Telangana', code: '36', pin: '500001' },
  { city: 'Kolkata', state: 'West Bengal', code: '19', pin: '700001' },
  { city: 'Ahmedabad', state: 'Gujarat', code: '24', pin: '380001' },
  { city: 'Surat', state: 'Gujarat', code: '24', pin: '395003' },
  { city: 'Jaipur', state: 'Rajasthan', code: '08', pin: '302001' },
  { city: 'Kochi', state: 'Kerala', code: '32', pin: '682001' },
  { city: 'Delhi', state: 'Delhi', code: '07', pin: '110001' },
  { city: 'Lucknow', state: 'Uttar Pradesh', code: '09', pin: '226001' },
  { city: 'Indore', state: 'Madhya Pradesh', code: '23', pin: '452001' },
  { city: 'Bhubaneswar', state: 'Odisha', code: '21', pin: '751001' },
] as const;

const FAMILIES = ['Gupta', 'Iyer', 'Sharma', 'Reddy', 'Nair', 'Mehta', 'Khan', 'Das', 'Patel', 'Joshi', 'Banerjee', 'Singh', 'Kulkarni', 'Menon', 'Chopra', 'Bhatt', 'Agarwal', 'Pillai', 'Verma', 'Rao', 'Kapoor', 'Shah', 'Naidu', 'Ghosh'];
const CUSTOMER_KINDS = ['Hardware', 'Electricals', 'Traders', 'Enterprises', 'Stores', 'Agencies', 'Distributors', 'Mart', 'Industries', 'Associates', 'Brothers', 'Sales Corporation'];
const SUPPLIER_KINDS = ['Steel Works', 'Polymers', 'Cables', 'Wholesale', 'Components', 'Metals', 'Packaging', 'Chemicals', 'Tools & Dies', 'Manufacturing'];
// Goods with a real HSN and a usual selling price.
const GOODS = [
  { name: 'Copper Wire 1.5mm (90m)', hsn: '85444999', price: 1850 },
  { name: 'Modular Switch 6A', hsn: '85365090', price: 95 },
  { name: 'LED Bulb 9W', hsn: '85395000', price: 110 },
  { name: 'PVC Conduit Pipe 25mm', hsn: '39172390', price: 145 },
  { name: 'Ceiling Fan 1200mm', hsn: '84145120', price: 2650 },
  { name: 'MCB 32A Single Pole', hsn: '85362010', price: 320 },
  { name: 'Extension Board 4-way', hsn: '85363090', price: 440 },
  { name: 'Door Lock Set', hsn: '83014090', price: 780 },
  { name: 'Paint Bucket 20L', hsn: '32091000', price: 3200 },
  { name: 'Cement Bag 50kg', hsn: '25232900', price: 390 },
  { name: 'Steel Rod 12mm (per piece)', hsn: '72142000', price: 640 },
  { name: 'Brass Water Tap', hsn: '84818030', price: 520 },
  { name: 'Plywood Sheet 18mm', hsn: '44123900', price: 1450 },
  { name: 'Screw Box (100 pcs)', hsn: '73181500', price: 180 },
] as const;
const SERVICES = [
  { name: 'Site Visit', hsn: '998719', price: 750 },
  { name: 'Installation Charges', hsn: '995461', price: 1200 },
  { name: 'Annual Maintenance', hsn: '998719', price: 6000 },
  { name: 'Technical Consultation', hsn: '998311', price: 1500 },
] as const;
const EXPENSE_CATEGORIES = ['Office Rent', 'Electricity', 'Travel', 'Internet', 'Stationery', 'Fuel', 'Repairs', 'Courier'];

/** A well-formed GSTIN (right check digit) in a state, different for each tag: the server treats one GSTIN as one contact. */
function demoGstin(tag: string, stateCode: string): string {
  const letter = (c: string) => String.fromCharCode(65 + (c.charCodeAt(0) % 26));
  const digit = (c: string) => String(c.charCodeAt(0) % 10);
  const [a, b, c] = [tag[0], tag[1], tag[2]];
  const first14 = `${stateCode}AB${letter(a)}${letter(b)}${letter(c)}${digit(a)}${digit(b)}${digit(c)}${digit(a)}A1Z`;
  return first14 + gstinChecksum(first14);
}

/**
 * Sample records for every kind of data, as the sheets a person would have filled in. Each tag gives a
 * different set: other names, places, items, prices, quantities and a different number of invoices. What
 * stays fixed is the shape and the rules: a contact's city, state, PIN and GSTIN agree; dates fall inside
 * the business's current financial year and never after today; GST and journal accounts follow the business.
 * `mistakes` adds rows that are wrong on purpose (a bad GSTIN, a date that is not one, a customer that does
 * not exist) so the fixing steps can be shown.
 */
export function sampleSheets(ctx: Ctx, { mistakes = false, tag = newTag() }: { mistakes?: boolean; tag?: string } = {}): Sheet[] {
  const r = seeded(tag);
  const start = new Date(`${financialYearStart(ctx.fiscalYearStartMonth)}T00:00:00`);
  const today = new Date();
  const at = (days: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + days);
    return dmy(d > today ? today : d);
  };
  const gst = ctx.taxCategories.some((c) => c.rate === 18) ? 18 : (ctx.taxCategories.find((c) => c.rate > 0)?.rate ?? 0);
  const t = ` (Demo ${tag})`;
  const phone = () => `${r.pick([6, 7, 8, 9])}${String(r.int(0, 999_999_999)).padStart(9, '0')}`;
  const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to);
  const street = () => `${r.int(1, 99)} ${r.pick(['Market Road', 'Station Road', 'Main Street', 'Industrial Area', 'Gandhi Nagar', 'MG Road'])}`;

  // Contacts: three or four customers (the first with a GSTIN, in its own state) and one or two suppliers.
  const families = r.some(FAMILIES, 7);
  const places = r.some(PLACES, 6);
  const customers = Array.from({ length: r.int(3, 4) }, (_, i) => ({ name: `${families[i]} ${r.pick(CUSTOMER_KINDS)}${t}`, family: families[i], place: places[i], limit: r.pick([25000, 50000, 100000, 200000]), days: r.pick([15, 30, 45]) }));
  const suppliers = Array.from({ length: r.int(1, 2) }, (_, i) => ({ name: `${families[4 + i]} ${r.pick(SUPPLIER_KINDS)}${t}`, family: families[4 + i], place: places[4 + i], days: r.pick([30, 45, 60]) }));
  const gstin = demoGstin(tag, customers[0].place.code);
  // The same, with its last character changed, so its check digit is wrong.
  const wrongGstin = gstin.slice(0, 14) + (gstin[14] === 'X' ? 'Y' : 'X');

  // Items: three goods and a service, each with a SKU of its own for this load.
  const goods = r.some(GOODS, 3).map((g, i) => ({ ...g, sku: `${g.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${i + 1}-${tag}`, price: round(g.price * (0.85 + r.int(0, 30) / 100), 5), stock: r.int(20, 200) }));
  const service = { ...r.pick(SERVICES), sku: `SVC-${tag}` };
  const itemName = (x: { name: string }) => `${x.name}${t}`;
  const cost = (g: (typeof goods)[number]) => round(g.price * (0.6 + r.int(0, 20) / 100), 1);

  // Sales: two to four invoices to different customers, one to three lines each, sold by the SKUs above.
  const invoices = Array.from({ length: r.int(2, 4) }, (_, i) => ({
    no: `INV-${1000 + i + 1}`,
    customer: customers[i % customers.length],
    day: 12 + i * r.int(8, 20),
    lines: r.some([...goods, service], r.int(1, 3)),
  }));

  const supplier = suppliers[0];
  const bought = r.pick(goods);
  const ordinary = ctx.accounts.filter((a) => !/gst|tds|tcs|duties|control/i.test(a.name));
  const cash = ordinary.find((a) => /^cash/i.test(a.name))?.name ?? 'Cash';
  // The other side of cash coming in: the owner's capital, or else any other ordinary account.
  const capital = ordinary.find((a) => /capital/i.test(a.name))?.name ?? ordinary.find((a) => a.name !== cash)?.name ?? 'Capital';
  const capitalAmount = r.pick([50000, 75000, 100000, 150000]);
  const receivedFrom = r.some(customers, 2);

  const sheets: { name: string; rows: (string | number)[][] }[] = [
    {
      name: 'Contacts',
      rows: [
        ['Type', 'Name', 'Display Name', 'Code', 'GSTIN', 'PAN', 'Email', 'Phone', 'Address Line 1', 'Address Line 2', 'City', 'State', 'PIN Code', 'Country', 'Opening Balance', 'Dr/Cr', 'Credit Limit', 'Credit Days', 'Notes'],
        ...customers.map((c, i) => ['Customer', c.name, '', '', i === 0 ? gstin : '', '', `accounts@${c.family.toLowerCase()}.example`, phone(), street(), '', c.place.city, c.place.state, c.place.pin, 'IN', '', '', c.limit, c.days, r.pick(['', 'Pays on time', 'Bulk buyer', 'New customer'])]),
        ...suppliers.map((s) => ['Supplier', s.name, '', '', '', '', `sales@${s.family.toLowerCase()}.example`, phone(), street(), '', s.place.city, s.place.state, s.place.pin, 'IN', '', '', '', s.days, '']),
        ...(mistakes
          ? [
              ['Customer', `Bad GSTIN Traders${t}`, '', '', wrongGstin, '', '', phone(), '1 Test Lane', '', customers[0].place.city, customers[0].place.state, customers[0].place.pin, 'IN', '', '', '', '', 'Wrong GSTIN on purpose'],
              ['Customer', `Bad Email Stores${t}`, '', '', '', '', 'not-an-email', phone(), '2 Test Lane', '', 'Pune', 'Maharashtra', '411001', 'IN', '', '', '', '', 'Wrong email on purpose'],
            ]
          : []),
      ],
    },
    {
      name: 'Items',
      rows: [
        ['Name', 'SKU', 'Type', 'Unit', 'Sale Price', 'Purchase Price', 'GST %', 'HSN', 'Barcode', 'Opening Stock', 'Reorder Level', 'Description'],
        ...goods.map((g) => [itemName(g), g.sku, 'Goods', 'NOS', g.price, cost(g), gst, g.hsn, '', g.stock, r.pick([5, 10, 20]), '']),
        [itemName(service), service.sku, 'Service', 'NOS', service.price, 0, gst, service.hsn, '', '', '', r.pick(['Per visit', 'Per job', ''])],
        ...(mistakes ? [[`Odd Rate Thing${t}`, `ODD-${tag}`, 'Goods', 'NOS', 10, 5, 7, '', '', 1, '', 'GST rate that is not set up']] : []),
      ],
    },
    {
      name: 'Opening Balances',
      rows: [['Type', 'Party', 'GSTIN', 'Number', 'Date', 'Due Date', 'Amount'], ['Customer invoice', r.pick(customers).name, '', `OLD-INV-${r.int(100, 999)}-${tag}`, at(5), at(35), round(r.int(2000, 40000), 100)]],
    },
    {
      name: 'Journals',
      rows: [
        ['Date', 'Journal No', 'Account', 'Debit', 'Credit', 'Narration'],
        [at(1), `JV-1-${tag}`, cash, capitalAmount, '', r.pick(['Opening capital', 'Capital introduced', 'Owner funds'])],
        [at(1), `JV-1-${tag}`, capital, '', capitalAmount, ''],
      ],
    },
    {
      name: 'Sales Invoices',
      rows: [
        ['Invoice No', 'Date', 'Due Date', 'Customer', 'Customer GSTIN', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Discount %', 'GST %', 'HSN', 'Notes'],
        ...invoices.flatMap((inv) =>
          inv.lines.map((l, k) => [
            inv.no,
            at(inv.day),
            at(inv.day + inv.customer.days),
            inv.customer.name,
            '',
            l.sku,
            '',
            'stock' in l ? r.int(1, 8) : r.int(1, 3),
            'NOS',
            l.price,
            r.pick(['', '', 5, 10]),
            gst,
            '',
            k === 0 ? r.pick(['', 'Monthly order', 'Urgent delivery', 'Repeat customer']) : '',
          ]),
        ),
        ...(mistakes
          ? [
              ['INV-1903', '31/02/2026', '', customers[0].name, '', goods[0].sku, '', 5, 'NOS', goods[0].price, '', gst, '', 'A date that is not a date'],
              ['INV-1904', at(65), '', `Unknown Customer${t}`, '', goods[0].sku, '', 5, 'NOS', goods[0].price, '', gst, '', 'A customer that does not exist'],
              ['INV-1905', at(66), '', customers[1 % customers.length].name, '', goods[0].sku, '', 'many', 'NOS', goods[0].price, '', gst, '', 'A quantity that is not a number'],
            ]
          : []),
      ],
    },
    {
      name: 'Purchase Invoices',
      rows: [
        ['Bill No', 'Date', 'Due Date', 'Supplier', 'Supplier GSTIN', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Discount %', 'GST %', 'HSN', 'Notes'],
        [`PS-${r.int(1000, 9999)}-${tag}`, at(r.int(10, 30)), at(60), supplier.name, '', bought.sku, '', r.int(10, 100), 'NOS', cost(bought), '', gst, '', ''],
      ],
    },
    {
      name: 'Payments',
      rows: [
        ['Date', 'Type', 'Party', 'GSTIN', 'Amount', 'Method', 'Account', 'Reference', 'Notes'],
        ...receivedFrom.map((c, i) => [at(40 + i * 7), 'Received', c.name, '', round(r.int(1000, 15000), 100), '', '', `UTR-${r.int(100000, 999999)}-${tag}`, r.pick(['Part payment', 'Advance', 'Against invoice'])]),
        ...(mistakes ? [[at(51), 'Sideways', customers[0].name, '', 100, '', '', '', 'A type that is not Received or Paid']] : []),
      ],
    },
    {
      name: 'Expenses',
      rows: [
        ['Date', 'Category', 'Amount', 'Method', 'Account', 'Supplier', 'GST %', 'Reference', 'Notes'],
        ...r.some(EXPENSE_CATEGORIES, r.int(1, 2)).map((e, i) => [at(30 + i * 9), `${e}${t}`, round(r.int(200, 3000), 10), '', '', '', gst, `${e.slice(0, 4).toUpperCase()}-${r.int(100, 999)}-${tag}`, '']),
        ...(mistakes ? [[at(46), `Fuel${t}`, '', '', '', '', '', '', 'No amount']] : []),
      ],
    },
  ];
  return sheets.map((s) => ({ name: s.name, rows: s.rows.map((row) => row.map((c) => String(c))) }));
}
