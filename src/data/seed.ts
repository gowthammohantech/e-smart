import {
  Address,
  Branch,
  Company,
  ComplianceSettings,
  DeviceSession,
  ExpenseCategory,
  ExchangeRate,
  Item,
  NumberingSeries,
  Party,
  PaymentAccount,
  TaxCategory,
  User,
} from '@/types';
import { fromMajor, zero } from '@/lib/money';
import { addDaysISO, nowISO, today } from '@/lib/date';
import { DEFAULT_PREFIXES, defaultSeries } from '@/domain/numbering';
import { INDIAN_STATES, expenseCategories, gstCategories } from './masters';
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
    state: INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? 'Maharashtra',
    stateCode,
    postalCode,
    country: 'IN',
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
        identifier: '27AABCV1234F1Z5',
        identifierLabel: 'GSTIN',
        registered: true,
        compositionScheme: false,
        placeOfSupplyStateCode: '27',
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
        identifier: '29AACFA9876P1ZK',
        identifierLabel: 'GSTIN',
        registered: true,
        compositionScheme: false,
        placeOfSupplyStateCode: '29',
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

export function seedDevices(): DeviceSession[] {
  return [
    { id: 'dev_1', label: 'iPhone 15 Pro', platform: 'iOS 18.2', lastActiveAt: new Date().toISOString(), current: true, location: 'Mumbai, IN' },
    { id: 'dev_2', label: 'Pixel 8', platform: 'Android 15', lastActiveAt: daysAgo(2), current: false, location: 'Pune, IN' },
    { id: 'dev_3', label: 'iPad Air', platform: 'iPadOS 18.1', lastActiveAt: daysAgo(11), current: false, location: 'Mumbai, IN' },
  ];
}

/* ------------------------------------------------------------------ */
/* Parties                                                             */
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

const SUPPLIER_SEED: [string, string, string, string, number][] = [
  ['Precision Components', 'Ramesh Gupta', '24', '390002', 30],
  ['Global Packaging Co', 'Hardik Patel', '27', '400093', 15],
  ['Nexus Wholesale', 'Sanjay Bhat', '29', '560058', 30],
  ['Apex Steel Works', 'Mohit Jain', '08', '302017', 45],
  ['Urban Logistics', 'Feroz Khan', '27', '400059', 7],
  ['Delta Paper Mills', 'Ravi Verma', '23', '452001', 30],
  ['Sigma Fasteners', 'Kiran Rao', '33', '641004', 21],
  ['Orion Electricals', 'Naveen Reddy', '36', '500032', 30],
];

function cityFor(stateCode: string): string {
  const map: Record<string, string> = {
    '27': 'Mumbai', '29': 'Bengaluru', '33': 'Chennai', '07': 'New Delhi',
    '24': 'Ahmedabad', '36': 'Hyderabad', '32': 'Kochi', '09': 'Noida',
    '19': 'Kolkata', '08': 'Jaipur', '23': 'Indore', '03': 'Ludhiana',
  };
  return map[stateCode] ?? 'Mumbai';
}

function gstinFor(stateCode: string, i: number): string {
  const pan = `AAB${String.fromCharCode(67 + (i % 20))}${String(1000 + i * 7).slice(0, 4)}${String.fromCharCode(65 + (i % 26))}`;
  return `${stateCode}${pan}1Z${String.fromCharCode(65 + (i % 26))}`;
}

export function seedParties(): Party[] {
  const out: Party[] = [];

  CUSTOMER_SEED.forEach(([name, contact, stateCode, pin, terms], i) => {
    out.push({
      id: `cus_${i + 1}`,
      companyId: PRIMARY_COMPANY_ID,
      kind: 'customer',
      name,
      code: `C-${String(i + 1).padStart(3, '0')}`,
      displayName: contact,
      taxId: i % 5 === 4 ? undefined : gstinFor(stateCode, i),
      email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.in`,
      phone: `+91 9${String(8000000000 + i * 1234567).slice(1, 10)}`,
      currency: 'INR',
      billingAddress: addr(`${10 + i} Commerce Lane`, cityFor(stateCode), stateCode, pin),
      creditLimit: i % 3 === 0 ? fromMajor(500000, 'INR') : undefined,
      openingBalance: i % 4 === 0 ? fromMajor(rng.int(2000, 25000), 'INR') : zero('INR'),
      paymentTermsDays: terms,
      status: i === 11 ? 'inactive' : 'active',
      createdAt: daysAgo(400 - i * 12),
    });
  });

  // One export customer to exercise the multi-currency paths.
  out.push({
    id: 'cus_13',
    companyId: PRIMARY_COMPANY_ID,
    kind: 'customer',
    name: 'Harbour Supplies FZE',
    code: 'C-013',
    displayName: 'Omar Al Balushi',
    email: 'accounts@harboursupplies.ae',
    phone: '+971 50 442 8890',
    currency: 'AED',
    billingAddress: {
      line1: 'Warehouse 12, Jebel Ali Free Zone',
      city: 'Dubai',
      state: 'Dubai',
      postalCode: '17000',
      country: 'AE',
    },
    openingBalance: zero('AED'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: daysAgo(150),
  });

  SUPPLIER_SEED.forEach(([name, contact, stateCode, pin, terms], i) => {
    out.push({
      id: `sup_${i + 1}`,
      companyId: PRIMARY_COMPANY_ID,
      kind: 'supplier',
      name,
      code: `S-${String(i + 1).padStart(3, '0')}`,
      displayName: contact,
      taxId: gstinFor(stateCode, i + 40),
      email: `purchase@${name.toLowerCase().replace(/[^a-z]/g, '')}.in`,
      phone: `+91 9${String(7000000000 + i * 987654).slice(1, 10)}`,
      currency: 'INR',
      billingAddress: addr(`${20 + i} Industrial Estate`, cityFor(stateCode), stateCode, pin),
      openingBalance: zero('INR'),
      paymentTermsDays: terms,
      status: 'active',
      createdAt: daysAgo(380 - i * 15),
    });
  });

  // Second company gets its own isolated book of contacts.
  out.push({
    id: 'cus_a1',
    companyId: SECOND_COMPANY_ID,
    kind: 'customer',
    name: 'Lumen Brand Works',
    code: 'C-001',
    displayName: 'Tara Sen',
    taxId: '29AADCL5544K1Z2',
    email: 'finance@lumenbrand.works',
    phone: '+91 90190 22110',
    currency: 'INR',
    billingAddress: addr('3 Residency Road', 'Bengaluru', '29', '560025'),
    openingBalance: zero('INR'),
    paymentTermsDays: 30,
    status: 'active',
    createdAt: daysAgo(120),
  });
  out.push({
    id: 'sup_a1',
    companyId: SECOND_COMPANY_ID,
    kind: 'supplier',
    name: 'Inkline Print House',
    code: 'S-001',
    displayName: 'Girish Kamath',
    taxId: '29AAECI7788M1ZP',
    email: 'orders@inkline.in',
    phone: '+91 99001 55220',
    currency: 'INR',
    billingAddress: addr('40 Mysore Road', 'Bengaluru', '29', '560026'),
    openingBalance: zero('INR'),
    paymentTermsDays: 15,
    status: 'active',
    createdAt: daysAgo(110),
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
  const items: Item[] = ITEM_SEED.map(([name, sku, sale, purchase, unit, tax, hsn, track], i) => ({
    id: `itm_${i + 1}`,
    companyId: PRIMARY_COMPANY_ID,
    sku,
    name,
    description: track ? undefined : 'Service — no stock tracking.',
    type: track ? 'goods' : 'service',
    unit,
    salePrice: fromMajor(sale, 'INR'),
    purchasePrice: fromMajor(purchase, 'INR'),
    taxCategoryId: tax,
    hsnCode: hsn,
    barcode: track ? `89${String(10000000000 + i * 137).slice(0, 11)}` : undefined,
    trackInventory: track,
    openingStock: track ? rng.int(20, 300) : 0,
    reorderLevel: track ? rng.int(10, 40) : 0,
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
    purchasePrice: zero('INR'),
    taxCategoryId: 'tax_18',
    hsnCode: '998391',
    trackInventory: false,
    openingStock: 0,
    reorderLevel: 0,
    status: 'active',
    createdAt: daysAgo(115),
  });

  return items;
}

export function seedTaxCategories(): TaxCategory[] {
  return [...gstCategories(PRIMARY_COMPANY_ID), ...gstCategories(SECOND_COMPANY_ID).map((c) => ({ ...c, id: `${c.id}_a` }))];
}

export function seedExpenseCategories(): ExpenseCategory[] {
  return [
    ...expenseCategories(PRIMARY_COMPANY_ID),
    ...expenseCategories(SECOND_COMPANY_ID).map((c) => ({ ...c, id: `${c.id}_a` })),
  ];
}

export function seedPaymentAccounts(): PaymentAccount[] {
  return [
    { id: 'acc_cash', companyId: PRIMARY_COMPANY_ID, name: 'Cash in hand', type: 'cash', currency: 'INR', openingBalance: fromMajor(45000, 'INR'), isDefault: false },
    { id: 'acc_hdfc', companyId: PRIMARY_COMPANY_ID, name: 'HDFC Current — 8842', type: 'bank', currency: 'INR', accountNumber: 'XXXX8842', openingBalance: fromMajor(1250000, 'INR'), isDefault: true },
    { id: 'acc_icici', companyId: PRIMARY_COMPANY_ID, name: 'ICICI Current — 3310', type: 'bank', currency: 'INR', accountNumber: 'XXXX3310', openingBalance: fromMajor(380000, 'INR'), isDefault: false },
    { id: 'acc_upi', companyId: PRIMARY_COMPANY_ID, name: 'UPI wallet', type: 'wallet', currency: 'INR', openingBalance: fromMajor(18500, 'INR'), isDefault: false },
    { id: 'acc_a_bank', companyId: SECOND_COMPANY_ID, name: 'Axis Current — 7701', type: 'bank', currency: 'INR', accountNumber: 'XXXX7701', openingBalance: fromMajor(420000, 'INR'), isDefault: true },
  ];
}

export function seedExchangeRates(): ExchangeRate[] {
  const base: ExchangeRate[] = [];
  const pairs: [string, string, number][] = [
    ['AED', 'INR', 23.85],
    ['USD', 'INR', 87.4],
    ['EUR', 'INR', 94.2],
    ['GBP', 'INR', 110.6],
    ['SGD', 'INR', 64.8],
  ];
  pairs.forEach(([from, to, rate], i) => {
    [0, 30, 60, 120].forEach((d, j) => {
      base.push({
        id: `fx_${from}_${j}`,
        companyId: PRIMARY_COMPANY_ID,
        from,
        to,
        rate: Number((rate * (1 - j * 0.004 + (i % 3) * 0.001)).toFixed(4)),
        effectiveFrom: daysAgo(d),
        source: j === 0 ? 'provider' : 'manual',
      });
    });
  });
  return base;
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

/**
 * Compliance configuration, one row per company (FRD 16).
 *
 * Kept as its own record rather than a field on `Company`, because the business
 * profile form replaces the whole company object on save and would otherwise
 * wipe this on an unrelated edit.
 */
export function defaultComplianceSettings(companyId: string, baseCurrency = 'INR'): ComplianceSettings {
  return {
    companyId,
    eInvoiceEnabled: true,
    annualTurnover: zero(baseCurrency),
    // Mandatory for businesses at or above 5 crore of aggregate turnover.
    eInvoiceTurnoverThreshold: fromMajor('50000000', baseCurrency),
    reportingWindowDays: 30,
    autoGenerateEInvoiceOnFinalise: false,
    irpEnvironment: 'sandbox',
    ewayBillEnabled: true,
    // The statute sets 50,000; several states set a higher intra-state figure.
    ewayBillThreshold: fromMajor('50000', baseCurrency),
    autoGenerateEwayBillOnFinalise: false,
    defaultDistanceKm: 120,
    defaultTransportMode: 'road',
    defaultVehicleType: 'regular',
    updatedAt: nowISO(),
  };
}

export function seedComplianceSettings(): ComplianceSettings[] {
  return [
    {
      ...defaultComplianceSettings(PRIMARY_COMPANY_ID),
      // Vertex trades above the threshold, so e-invoicing bites.
      annualTurnover: fromMajor('84000000', 'INR'),
      irpUsername: 'vertex_irp01',
      irpClientIdMasked: 'ELX-****-9F21',
      defaultTransporterId: '27AABCT5512M1ZQ',
      defaultTransporterName: 'Konkan Roadlines',
      defaultDistanceKm: 340,
    },
    {
      ...defaultComplianceSettings(SECOND_COMPANY_ID),
      // Aurora is a services business under the threshold, so switching to it
      // shows the "not applicable" side of the same screens.
      annualTurnover: fromMajor('14000000', 'INR'),
      ewayBillEnabled: false,
      irpUsername: 'aurora_irp01',
      irpClientIdMasked: 'ELX-****-3C08',
    },
  ];
}
