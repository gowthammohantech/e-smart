import {
  Address,
  Branch,
  Company,
  Item,
  NumberingSeries,
  Party,
  PaymentAccount,
  TaxCategory,
  Transporter,
  User,
} from '@/types';
import { fromMajor, zero } from '@/lib/money';
import { addDaysISO, today } from '@/lib/date';
import { DEFAULT_PREFIXES, defaultSeries } from '@/domain/numbering';
import { gstinChecksum } from '@/domain/gst/gstin';
import { stateNameOf } from '@/domain/gst/stateCodes';
import { gstCategories } from './masters';
import { makeRng } from './rng';

export const ACCOUNT_ID = 'acct_elixir_demo';
export const PRIMARY_COMPANY_ID = 'cmp_vertex';
export const SECOND_COMPANY_ID = 'cmp_aurora';
export const CURRENT_USER_ID = 'usr_owner';

const rng = makeRng(20260318);

function addr(line1: string, city: string, stateCode: string, postalCode: string): Address {
  return {
    line1,
    city,
    state: stateNameOf(stateCode),
    stateCode,
    postalCode,
    country: 'India',
  };
}

function daysAgo(n: number): string {
  return addDaysISO(today(), -n);
}

/* ------------------------------------------------------------------ */
/* Companies, branches, users                                          */
/* ------------------------------------------------------------------ */

export function seedCompanies(): Company[] {
  return [
    {
      id: PRIMARY_COMPANY_ID,
      accountId: ACCOUNT_ID,
      name: 'Vertex Traders',
      legalName: 'Vertex Traders Pvt Ltd',
      businessType: 'Wholesale / Trading',
      country: 'IN',
      baseCurrency: 'INR',
      address: addr('14 Linking Road, Bandra West', 'Mumbai', '27', '400050'),
      email: 'accounts@vertextraders.in',
      phone: '+91 98200 41120',
      website: 'vertextraders.in',
      taxRegistration: {
        regime: 'GST',
        // Check digit computed, not invented — isValidGstin recomputes it.
        identifier: '27AABCV1234F1ZO',
        identifierLabel: 'GSTIN',
        registered: true,
        compositionScheme: false,
        placeOfSupplyStateCode: '27',
        turnoverSlab: '10crTo50cr',
        eInvoiceEnabled: true,
        eWayBillEnabled: true,
      },
      fiscalYearStartMonth: 4,
      createdAt: daysAgo(420),
    },
    {
      id: SECOND_COMPANY_ID,
      accountId: ACCOUNT_ID,
      name: 'Aurora Design Studio',
      legalName: 'Aurora Design Studio LLP',
      businessType: 'Services',
      country: 'IN',
      baseCurrency: 'INR',
      address: addr('7 Church Street, Ashok Nagar', 'Bengaluru', '29', '560001'),
      email: 'hello@auroradesign.studio',
      phone: '+91 80456 77120',
      taxRegistration: {
        regime: 'GST',
        identifier: '29AACFA9876P1ZH',
        identifierLabel: 'GSTIN',
        registered: true,
        compositionScheme: false,
        placeOfSupplyStateCode: '29',
        // Deliberately under the threshold, so the "not applicable" path is
        // visible by switching companies.
        turnoverSlab: 'under5cr',
        eInvoiceEnabled: true,
        eWayBillEnabled: true,
      },
      fiscalYearStartMonth: 4,
      createdAt: daysAgo(180),
    },
  ];
}

export function seedBranches(): Branch[] {
  return [
    {
      id: 'brn_mum',
      companyId: PRIMARY_COMPANY_ID,
      name: 'Mumbai — Head office',
      code: 'MUM',
      address: addr('14 Linking Road, Bandra West', 'Mumbai', '27', '400050'),
      isPrimary: true,
      phone: '+91 98200 41120',
    },
    {
      id: 'brn_pun',
      companyId: PRIMARY_COMPANY_ID,
      name: 'Pune — Warehouse',
      code: 'PUN',
      address: addr('Plot 22, MIDC Bhosari', 'Pune', '27', '411026'),
      isPrimary: false,
      phone: '+91 98220 77341',
    },
    {
      id: 'brn_blr',
      companyId: SECOND_COMPANY_ID,
      name: 'Bengaluru — Studio',
      code: 'BLR',
      address: addr('7 Church Street, Ashok Nagar', 'Bengaluru', '29', '560001'),
      isPrimary: true,
    },
  ];
}

export function seedUsers(): User[] {
  return [
    {
      id: CURRENT_USER_ID,
      accountId: ACCOUNT_ID,
      name: 'Gowtham Mohan',
      email: 'gowtham@vertextraders.in',
      phone: '+91 98200 41120',
      role: 'owner',
      companyIds: [PRIMARY_COMPANY_ID, SECOND_COMPANY_ID],
      branchIds: ['brn_mum', 'brn_pun', 'brn_blr'],
      avatarColor: '#007AFF',
      status: 'active',
      lastActiveAt: new Date().toISOString(),
    },
    {
      id: 'usr_accountant',
      accountId: ACCOUNT_ID,
      name: 'Meera Iyer',
      email: 'meera@vertextraders.in',
      phone: '+91 99300 12045',
      role: 'accountant',
      companyIds: [PRIMARY_COMPANY_ID],
      branchIds: ['brn_mum'],
      avatarColor: '#34C88A',
      status: 'active',
      lastActiveAt: daysAgo(1),
    },
    {
      id: 'usr_sales',
      accountId: ACCOUNT_ID,
      name: 'Rahul Shetty',
      email: 'rahul@vertextraders.in',
      role: 'sales',
      companyIds: [PRIMARY_COMPANY_ID],
      branchIds: ['brn_pun'],
      avatarColor: '#F0B429',
      status: 'active',
      lastActiveAt: daysAgo(3),
    },
    {
      id: 'usr_invited',
      accountId: ACCOUNT_ID,
      name: 'Priya Nair',
      email: 'priya@vertextraders.in',
      role: 'viewer',
      companyIds: [PRIMARY_COMPANY_ID],
      branchIds: ['brn_mum'],
      avatarColor: '#C77DFF',
      status: 'invited',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

const CUSTOMER_SEED: [string, string, string, string, number][] = [
  ['Sunrise Retail', 'Ananya Deshpande', '27', '400086', 30],
  ['Kumar Electronics', 'Suresh Kumar', '29', '560034', 15],
  ['Mehta Hardware', 'Nikhil Mehta', '27', '400601', 30],
  ['Blue Ocean Traders', 'Farid Shaikh', '24', '380015', 45],
  ['Galaxy Superstore', 'Renu Sharma', '07', '110024', 30],
  ['Anand Enterprises', 'Vikram Anand', '33', '600042', 21],
  ['Crescent Distributors', 'Imran Qureshi', '36', '500081', 30],
  ['Pearl Home Needs', 'Lata Menon', '32', '682020', 15],
  ['Nova Office Supplies', 'Deepak Rao', '27', '411038', 30],
  ['Skyline Interiors', 'Kavita Joshi', '29', '560066', 45],
  ['Metro Mart', 'Arjun Pillai', '27', '400703', 7],
  ['Zenith Corporate', 'Sneha Kulkarni', '09', '201301', 60],
];

function cityFor(stateCode: string): string {
  const map: Record<string, string> = {
    '27': 'Mumbai', '29': 'Bengaluru', '33': 'Chennai', '07': 'New Delhi',
    '24': 'Ahmedabad', '36': 'Hyderabad', '32': 'Kochi', '09': 'Noida',
    '19': 'Kolkata', '08': 'Jaipur', '23': 'Indore', '03': 'Ludhiana',
  };
  return map[stateCode] ?? 'Mumbai';
}

/**
 * Build a GSTIN that passes its own check digit.
 *
 * The digit is not decoration — isValidGstin recomputes it, and a fabricated
 * one would make every seeded customer fail e-invoice validation with 3029.
 */
function gstinFor(stateCode: string, i: number): string {
  const pan = `AAB${String.fromCharCode(67 + (i % 20))}${String(1000 + i * 7).slice(0, 4)}${String.fromCharCode(65 + (i % 26))}`;
  const body = `${stateCode}${pan}1Z`;
  return body + gstinChecksum(body);
}

export function seedParties(): Party[] {
  const out: Party[] = [];

  CUSTOMER_SEED.forEach(([name, contact, stateCode, pin, terms], i) => {
    out.push({
      id: `cus_${i + 1}`,
      companyId: PRIMARY_COMPANY_ID,
      name,
      code: `C-${String(i + 1).padStart(3, '0')}`,
      displayName: contact,
      // Every fifth customer is unregistered, so the B2C path has data.
      taxId: i % 5 === 4 ? undefined : gstinFor(stateCode, i),
      gstRegistrationType: i % 5 === 4 ? 'unregistered' : 'regular',
      email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.in`,
      phone: `+91 9${String(8000000000 + i * 1234567).slice(1, 10)}`,
      billingAddress: addr(`${10 + i} Commerce Lane`, cityFor(stateCode), stateCode, pin),
      creditLimit: i % 3 === 0 ? fromMajor(500000, 'INR') : undefined,
      openingBalance: i % 4 === 0 ? fromMajor(rng.int(2000, 25000), 'INR') : zero('INR'),
      paymentTermsDays: terms,
      status: i === 11 ? 'inactive' : 'active',
      createdAt: daysAgo(400 - i * 12),
    });
  });

  // An SEZ unit, so the SEZ supply type has somewhere to come from.
  out.push({
    id: 'cus_13',
    companyId: PRIMARY_COMPANY_ID,
    name: 'Harbour Supplies (SEZ)',
    code: 'C-013',
    displayName: 'Omar Balan',
    taxId: gstinFor('27', 71),
    gstRegistrationType: 'sez',
    email: 'accounts@harboursupplies.in',
    phone: '+91 98200 44889',
    billingAddress: addr('Unit 12, SEEPZ SEZ', 'Mumbai', '27', '400096'),
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: daysAgo(150),
  });

  // Second company gets its own isolated book of customers.
  out.push({
    id: 'cus_a1',
    companyId: SECOND_COMPANY_ID,
    name: 'Lumen Brand Works',
    code: 'C-001',
    displayName: 'Tara Sen',
    taxId: gstinFor('29', 88),
    gstRegistrationType: 'regular',
    email: 'finance@lumenbrand.works',
    phone: '+91 90190 22110',
    billingAddress: addr('3 Residency Road', 'Bengaluru', '29', '560025'),
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: daysAgo(120),
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

const ITEM_SEED: [string, string, number, number, string, string, string, boolean][] = [
  ['Steel Ball Bearing 6203', 'BRG-6203', 180, 118, 'PCS', 'tax_18', '84821011', true],
  ['Steel Ball Bearing 6205', 'BRG-6205', 245, 165, 'PCS', 'tax_18', '84821011', true],
  ['V-Belt A-42', 'BLT-A42', 320, 210, 'PCS', 'tax_18', '40103999', true],
  ['Hex Bolt M10x50 (100 pk)', 'BLT-M1050', 640, 420, 'BOX', 'tax_18', '73181500', true],
  ['Washer M10 (500 pk)', 'WSH-M10', 285, 175, 'BOX', 'tax_18', '73182200', true],
  ['Copper Wire 1.5sqmm 90m', 'WIR-15', 1290, 980, 'PCS', 'tax_18', '85444911', true],
  ['Copper Wire 2.5sqmm 90m', 'WIR-25', 2050, 1580, 'PCS', 'tax_18', '85444911', true],
  ['LED Panel 18W', 'LED-18', 540, 355, 'PCS', 'tax_12', '94054090', true],
  ['LED Batten 20W', 'LED-B20', 420, 268, 'PCS', 'tax_12', '94054090', true],
  ['MCB 16A Single Pole', 'MCB-16', 265, 168, 'PCS', 'tax_18', '85362010', true],
  ['MCB 32A Double Pole', 'MCB-32', 610, 395, 'PCS', 'tax_18', '85362010', true],
  ['PVC Conduit 25mm 3m', 'CON-25', 145, 92, 'PCS', 'tax_18', '39172390', true],
  ['Junction Box 4x4', 'JBX-44', 95, 58, 'PCS', 'tax_18', '85389000', true],
  ['Insulation Tape (10 pk)', 'TAP-INS', 180, 105, 'BOX', 'tax_18', '39191000', true],
  ['Cable Tie 200mm (100 pk)', 'CTY-200', 120, 68, 'BOX', 'tax_18', '39231010', true],
  ['Industrial Grease 500g', 'GRS-500', 410, 280, 'PCS', 'tax_18', '27101980', true],
  ['Cutting Oil 5L', 'OIL-C5', 1150, 845, 'PCS', 'tax_18', '27101980', true],
  ['Safety Gloves Pair', 'SFT-GLV', 165, 92, 'PCS', 'tax_5', '61161010', true],
  ['Safety Goggles', 'SFT-GOG', 240, 140, 'PCS', 'tax_5', '90049090', true],
  ['Tool Kit 42 pcs', 'TLK-42', 2450, 1720, 'SET', 'tax_18', '82060010', true],
  ['Digital Multimeter', 'MTR-DGT', 1890, 1310, 'PCS', 'tax_18', '90303100', true],
  ['Measuring Tape 5m', 'TAP-5M', 210, 128, 'PCS', 'tax_18', '90178010', true],
  ['Corrugated Box Medium', 'PKG-MED', 42, 24, 'PCS', 'tax_12', '48191010', true],
  ['Stretch Wrap Roll', 'PKG-WRP', 385, 265, 'PCS', 'tax_18', '39201019', true],
  ['Bubble Wrap 100m', 'PKG-BBL', 720, 510, 'PCS', 'tax_18', '39211900', true],
  ['A4 Copier Paper Ream', 'STN-A4', 320, 248, 'PCS', 'tax_12', '48025690', true],
  ['Rice Bran Oil 5L', 'FMC-RBO', 880, 745, 'PCS', 'tax_5', '15152900', true],
  ['Packaged Drinking Water 1L (12 pk)', 'FMC-WTR', 168, 120, 'BOX', 'tax_18', '22011010', true],
  ['Annual Maintenance Contract', 'SRV-AMC', 24000, 0, 'NOS', 'tax_18', '998719', false],
  ['On-site Installation (per hour)', 'SRV-INST', 850, 0, 'HR', 'tax_18', '995461', false],
  ['Equipment Calibration', 'SRV-CAL', 3500, 0, 'NOS', 'tax_18', '998346', false],
  ['Freight & Delivery', 'SRV-FRT', 1200, 0, 'NOS', 'tax_5', '996511', false],
];

export function seedItems(): Item[] {
  const items: Item[] = ITEM_SEED.map(([name, sku, sale, , unit, tax, hsn, track], i) => ({
    id: `itm_${i + 1}`,
    companyId: PRIMARY_COMPANY_ID,
    sku,
    name,
    type: track ? 'goods' : 'service',
    unit,
    salePrice: fromMajor(sale, 'INR'),
    taxCategoryId: tax,
    hsnCode: hsn,
    status: i === 27 ? 'inactive' : 'active',
    createdAt: daysAgo(390 - i * 8),
  }));

  items.push({
    id: 'itm_a1',
    companyId: SECOND_COMPANY_ID,
    sku: 'SRV-BRAND',
    name: 'Brand identity package',
    type: 'service',
    unit: 'NOS',
    salePrice: fromMajor(185000, 'INR'),
    taxCategoryId: 'tax_18',
    hsnCode: '998391',
    status: 'active',
    createdAt: daysAgo(115),
  });

  return items;
}

export function seedTaxCategories(): TaxCategory[] {
  return [...gstCategories(PRIMARY_COMPANY_ID), ...gstCategories(SECOND_COMPANY_ID).map((c) => ({ ...c, id: `${c.id}_a` }))];
}

export function seedTransporters(): Transporter[] {
  return [
    { id: 'trn_1', companyId: PRIMARY_COMPANY_ID, name: 'Gati Logistics', transporterId: gstinFor('27', 51), phone: '+91 22 6789 1000', status: 'active' },
    { id: 'trn_2', companyId: PRIMARY_COMPANY_ID, name: 'Safexpress', transporterId: gstinFor('07', 52), phone: '+91 11 4567 2000', status: 'active' },
    { id: 'trn_3', companyId: PRIMARY_COMPANY_ID, name: 'VRL Roadlines', transporterId: gstinFor('29', 53), phone: '+91 80 2345 3000', status: 'active' },
    { id: 'trn_a1', companyId: SECOND_COMPANY_ID, name: 'Blue Dart', transporterId: gstinFor('29', 54), phone: '+91 80 6677 4000', status: 'active' },
  ];
}

export function seedPaymentAccounts(): PaymentAccount[] {
  return [
    { id: 'acc_cash', companyId: PRIMARY_COMPANY_ID, name: 'Cash in hand', type: 'cash', openingBalance: fromMajor(45000, 'INR'), isDefault: false },
    { id: 'acc_hdfc', companyId: PRIMARY_COMPANY_ID, name: 'HDFC Current — 8842', type: 'bank', accountNumber: 'XXXX8842', openingBalance: fromMajor(1250000, 'INR'), isDefault: true },
    { id: 'acc_icici', companyId: PRIMARY_COMPANY_ID, name: 'ICICI Current — 3310', type: 'bank', accountNumber: 'XXXX3310', openingBalance: fromMajor(380000, 'INR'), isDefault: false },
    { id: 'acc_upi', companyId: PRIMARY_COMPANY_ID, name: 'UPI wallet', type: 'wallet', openingBalance: fromMajor(18500, 'INR'), isDefault: false },
    { id: 'acc_a_bank', companyId: SECOND_COMPANY_ID, name: 'Axis Current — 7701', type: 'bank', accountNumber: 'XXXX7701', openingBalance: fromMajor(420000, 'INR'), isDefault: true },
  ];
}

export function seedNumberingSeries(): NumberingSeries[] {
  const kinds = Object.keys(DEFAULT_PREFIXES) as (keyof typeof DEFAULT_PREFIXES)[];
  const out: NumberingSeries[] = [];
  [PRIMARY_COMPANY_ID, SECOND_COMPANY_ID].forEach((companyId) => {
    kinds.forEach((kind) => {
      const s = defaultSeries(companyId, kind, DEFAULT_PREFIXES[kind]);
      out.push({ ...s, id: `series_${companyId}_${kind}` });
    });
  });
  return out;
}
