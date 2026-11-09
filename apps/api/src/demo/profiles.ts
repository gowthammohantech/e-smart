/**
 * The eight businesses in the public demo, one per business type. Each is a plain description;
 * build.ts turns it into real records through the API, so every rule a person meets applies.
 */
import { gstinChecksum } from '@esmart/core/domain/gstin';
import { INDIAN_STATES, type BusinessType } from '@esmart/core/data/masters';

export type Address = { line1: string; city: string; state: string; stateCode: string; postalCode: string; country: string };

export function addr(line1: string, city: string, stateCode: string, postalCode: string, country = 'IN'): Address {
  return { line1, city, state: INDIAN_STATES.find((s) => s.code === stateCode)?.name ?? city, stateCode, postalCode, country };
}

/** A GSTIN that passes its own check digit: state + PAN + entity 1 + Z + checksum. */
export function gstin(stateCode: string, pan: string, entity = '1'): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinChecksum(first14);
}

export type ItemSpec = {
  sku: string;
  name: string;
  type?: 'goods' | 'service';
  unit: string;
  /** Rupees. */
  sale: number;
  purchase: number;
  gst: 0 | 5 | 12 | 18 | 28;
  hsn: string;
  /** Opening stock at the primary branch; omit for services and untracked goods. */
  stock?: number;
  reorder?: number;
  category?: string;
  brand?: string;
  /** Bought, not sold (raw material, consumables). */
  rawMaterial?: boolean;
  capitalGoods?: boolean;
  exempt?: boolean;
};

export type PartySpec = {
  name: string;
  contact?: string;
  line1: string;
  city: string;
  state: string;
  pin: string;
  /** PAN; registered parties get a GSTIN from it. Absent = unregistered (B2C, or a small supplier). */
  pan?: string;
  terms?: number;
  msme?: 'micro' | 'small' | 'medium';
  tds?: '194C' | '194JA' | '194JB' | '194H' | '194IA' | '194IB' | '194A' | '194Q';
  tcs?: 'scrap';
  overseas?: { country: string; currency: string };
  reverseCharge?: boolean;
  creditLimit?: number;
  /** Rupees owed at the start (customer dr / supplier cr). */
  opening?: number;
};

export type Profile = {
  key: string;
  type: BusinessType;
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website?: string;
  pan: string;
  registered: boolean;
  /** Return filing frequency for a registered business. */
  returnFrequency?: 'monthly' | 'qrmp';
  lut?: string;
  branches: { name: string; code: string; address: Address; phone?: string; ownGstin?: boolean }[];
  bank: { name: string; ifsc: string; branch: string; account: string; upi: string };
  categories: { name: string; color: string }[];
  brands: string[];
  items: ItemSpec[];
  customers: PartySpec[];
  suppliers: PartySpec[];
  /** Scenarios this business shows off over and above the common ones. */
  traits: {
    eway?: boolean;
    einvoice?: boolean;
    fifo?: boolean;
    walkIn?: boolean;
    exports?: boolean;
    retainers?: boolean;
    scrapTcs?: boolean;
    vehicles?: string[];
    costCentres: { name: string; category: string }[];
    assets: { name: string; category: string; account: string; cost: number; months: number; method: 'slm' | 'wdv'; rate?: number; life?: number; disposed?: boolean }[];
    /** Expense category name → a typical monthly amount in rupees (and its GST rate). */
    expenses: [category: string, rupees: number, gst: number][];
  };
};

const VIVID = ['#4DA3FF', '#34C88A', '#F0B429', '#FF6B6B', '#C77DFF', '#00C2C7', '#FF9F45', '#7AA2F7'];
const cats = (...names: string[]) => names.map((name, i) => ({ name, color: VIVID[i % VIVID.length] }));

export const PROFILES: Profile[] = [
  /* ------------------------------------------------------------------ wholesale */
  {
    key: 'wholesale',
    type: 'wholesale',
    name: 'Meridian Wholesale Traders',
    legalName: 'Meridian Wholesale Traders Pvt Ltd',
    email: 'accounts@meridiantraders.example',
    phone: '+91 22 4012 7700',
    website: 'meridiantraders.example',
    pan: 'AAMCM4821K',
    registered: true,
    returnFrequency: 'monthly',
    branches: [
      { name: 'Mumbai — Head office', code: 'MUM', address: addr('Unit 402, Kanakia Wall Street, Andheri East', 'Mumbai', '27', '400093'), phone: '+91 22 4012 7700' },
      { name: 'Bhiwandi — Warehouse', code: 'BHW', address: addr('Gala 18, Rajlaxmi Compound, Vahuli', 'Bhiwandi', '27', '421302'), phone: '+91 25 2228 1100' },
      { name: 'Ahmedabad — Depot', code: 'AMD', address: addr('Shed 7, Changodar Industrial Estate', 'Ahmedabad', '24', '382213'), phone: '+91 79 2970 4410', ownGstin: true },
    ],
    bank: { name: 'HDFC Bank', ifsc: 'HDFC0000212', branch: 'Andheri East', account: '50200061234412', upi: 'meridian@hdfcbank' },
    categories: cats('Kitchen appliances', 'Cookware', 'Home care', 'Storage'),
    brands: ['Prestige', 'Hawkins', 'Milton', 'Cello', 'Borosil'],
    items: [
      { sku: 'KA-MXR-750', name: 'Mixer grinder 750W', unit: 'PCS', sale: 3450, purchase: 2620, gst: 18, hsn: '850940', stock: 120, reorder: 30, category: 'Kitchen appliances', brand: 'Prestige' },
      { sku: 'KA-KTL-15', name: 'Electric kettle 1.5 L', unit: 'PCS', sale: 1190, purchase: 840, gst: 18, hsn: '851671', stock: 200, reorder: 40, category: 'Kitchen appliances', brand: 'Prestige' },
      { sku: 'CW-PC-5', name: 'Pressure cooker 5 L', unit: 'PCS', sale: 2150, purchase: 1610, gst: 12, hsn: '761510', stock: 150, reorder: 30, category: 'Cookware', brand: 'Hawkins' },
      { sku: 'CW-TAWA-28', name: 'Non-stick tawa 28 cm', unit: 'PCS', sale: 890, purchase: 610, gst: 12, hsn: '732393', stock: 18, reorder: 25, category: 'Cookware', brand: 'Prestige' },
      { sku: 'ST-FLASK-1', name: 'Steel flask 1 L', unit: 'PCS', sale: 760, purchase: 520, gst: 12, hsn: '961700', stock: 300, reorder: 50, category: 'Storage', brand: 'Milton' },
      { sku: 'ST-CONT-SET', name: 'Container set (18 pcs)', unit: 'SET', sale: 1290, purchase: 905, gst: 18, hsn: '392410', stock: 90, reorder: 20, category: 'Storage', brand: 'Cello' },
      { sku: 'HC-MOP-SPIN', name: 'Spin mop with bucket', unit: 'PCS', sale: 1490, purchase: 1020, gst: 18, hsn: '960390', stock: 75, reorder: 15, category: 'Home care', brand: 'Cello' },
      { sku: 'CW-GLS-6', name: 'Glass tumbler (box of 6)', unit: 'BOX', sale: 640, purchase: 430, gst: 18, hsn: '701337', stock: 0, reorder: 20, category: 'Cookware', brand: 'Borosil' },
      { sku: 'KA-IND-2K', name: 'Induction cooktop 2000W', unit: 'PCS', sale: 2890, purchase: 2180, gst: 18, hsn: '851660', stock: 60, reorder: 15, category: 'Kitchen appliances', brand: 'Prestige' },
      { sku: 'SV-DEL', name: 'Delivery and handling', type: 'service', unit: 'NOS', sale: 450, purchase: 0, gst: 18, hsn: '996812' },
    ],
    customers: [
      { name: 'Shree Ganesh Home Store', line1: 'Shop 3, Station Road', city: 'Thane', state: '27', pin: '400601', pan: 'ADGPS3311K', terms: 30, creditLimit: 400000, opening: 42000 },
      { name: 'Kaveri Kitchen World', line1: '88 Avenue Road', city: 'Bengaluru', state: '29', pin: '560002', pan: 'AAKFK7712M', terms: 21 },
      { name: 'Patel Vasan Bhandar', line1: 'Relief Road', city: 'Ahmedabad', state: '24', pin: '380001', pan: 'AEFPP2290Q', terms: 30 },
      { name: 'Royal Appliances', line1: '12 Lamington Road', city: 'Mumbai', state: '27', pin: '400007', pan: 'AABFR5501D', terms: 15 },
      { name: 'Sai Super Mart', line1: 'Near Bus Stand', city: 'Nashik', state: '27', pin: '422001', terms: 15 },
      { name: 'Delhi Crockery House', line1: '2211 Sadar Bazar', city: 'Delhi', state: '07', pin: '110006', pan: 'AAHFD8834P', terms: 45 },
      { name: 'Coastal Traders', line1: 'Market Road', city: 'Panaji', state: '30', pin: '403001', pan: 'AAKFC1209R', terms: 30 },
    ],
    suppliers: [
      { name: 'TTK Prestige Distributors', line1: 'Plot 21, MIDC Taloja', city: 'Navi Mumbai', state: '27', pin: '410208', pan: 'AABCT1123E', terms: 30, msme: 'small', opening: 65000 },
      { name: 'Hawkins Cookers Ltd', line1: 'Maker Tower F, Cuffe Parade', city: 'Mumbai', state: '27', pin: '400005', pan: 'AAACH1123L', terms: 45 },
      { name: 'Hamilton Housewares', line1: 'Survey 44, Daman Industrial Area', city: 'Vapi', state: '24', pin: '396195', pan: 'AAACH5521N', terms: 30, msme: 'micro' },
      { name: 'Konkan Roadlines', line1: 'Transport Nagar', city: 'Bhiwandi', state: '27', pin: '421302', pan: 'AAFFK4410C', terms: 15, tds: '194C', reverseCharge: true },
    ],
    traits: {
      eway: true,
      einvoice: true,
      vehicles: ['MH04KL2210', 'MH05DS8812'],
      costCentres: [
        { name: 'Modern trade', category: 'Channel' },
        { name: 'General trade', category: 'Channel' },
        { name: 'Online', category: 'Channel' },
      ],
      assets: [
        { name: 'Forklift — Godrej 2T', category: 'Machinery', account: 'sys:fixedAssets', cost: 685000, months: 26, method: 'wdv', rate: 15 },
        { name: 'Racking system — Bhiwandi', category: 'Furniture', account: 'sys:fixedAssets', cost: 412000, months: 18, method: 'slm', life: 120 },
        { name: 'Tata Ace delivery van', category: 'Vehicles', account: 'sys:fixedAssets', cost: 590000, months: 40, method: 'wdv', rate: 15, disposed: true },
      ],
      expenses: [
        ['Rent', 95000, 18],
        ['Salaries & wages', 310000, 0],
        ['Transport & freight', 42000, 5],
        ['Utilities', 18500, 18],
        ['Marketing', 25000, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ retail */
  {
    key: 'retail',
    type: 'retail',
    name: 'Anand Family Store',
    legalName: 'Anand Family Store',
    email: 'hello@anandstore.example',
    phone: '+91 44 2434 9900',
    pan: 'ACBPA6619H',
    registered: true,
    returnFrequency: 'qrmp',
    branches: [
      { name: 'T. Nagar store', code: 'TNR', address: addr('45 Usman Road, T. Nagar', 'Chennai', '33', '600017'), phone: '+91 44 2434 9900' },
      { name: 'Coimbatore store', code: 'CBE', address: addr('112 Cross Cut Road, Gandhipuram', 'Coimbatore', '33', '641012'), phone: '+91 42 2249 8800' },
    ],
    bank: { name: 'Indian Bank', ifsc: 'IDIB000T024', branch: 'T. Nagar', account: '6612009871', upi: 'anandstore@indianbk' },
    categories: cats('Groceries', 'Personal care', 'Snacks', 'Beverages', 'Household'),
    brands: ['Aashirvaad', 'Tata', 'Britannia', 'Dabur', 'Surf Excel'],
    items: [
      { sku: 'GR-ATTA-5', name: 'Whole wheat atta 5 kg', unit: 'PCS', sale: 285, purchase: 238, gst: 0, hsn: '110100', stock: 220, reorder: 60, category: 'Groceries', brand: 'Aashirvaad', exempt: true },
      { sku: 'GR-SALT-1', name: 'Iodised salt 1 kg', unit: 'PCS', sale: 28, purchase: 21, gst: 0, hsn: '250100', stock: 400, reorder: 80, category: 'Groceries', brand: 'Tata', exempt: true },
      { sku: 'GR-TEA-500', name: 'Tea 500 g', unit: 'PCS', sale: 280, purchase: 228, gst: 5, hsn: '090230', stock: 160, reorder: 40, category: 'Beverages', brand: 'Tata' },
      { sku: 'SN-BISC-PK', name: 'Biscuits family pack', unit: 'PCS', sale: 60, purchase: 46, gst: 18, hsn: '190531', stock: 500, reorder: 100, category: 'Snacks', brand: 'Britannia' },
      { sku: 'PC-SHMP-340', name: 'Herbal shampoo 340 ml', unit: 'PCS', sale: 245, purchase: 186, gst: 18, hsn: '330510', stock: 12, reorder: 30, category: 'Personal care', brand: 'Dabur' },
      { sku: 'PC-HONEY-500', name: 'Honey 500 g', unit: 'PCS', sale: 230, purchase: 172, gst: 5, hsn: '040900', stock: 90, reorder: 25, category: 'Groceries', brand: 'Dabur' },
      { sku: 'HH-DET-1', name: 'Detergent powder 1 kg', unit: 'PCS', sale: 140, purchase: 108, gst: 18, hsn: '340220', stock: 260, reorder: 60, category: 'Household', brand: 'Surf Excel' },
      { sku: 'BV-COLA-2', name: 'Cola 2 L', unit: 'PCS', sale: 95, purchase: 70, gst: 28, hsn: '220210', stock: 140, reorder: 40, category: 'Beverages' },
      { sku: 'GR-RICE-25', name: 'Ponni rice 25 kg', unit: 'PCS', sale: 1450, purchase: 1240, gst: 5, hsn: '100630', stock: 6, reorder: 15, category: 'Groceries' },
    ],
    customers: [
      { name: 'Walk-in customer', line1: 'Counter sale', city: 'Chennai', state: '33', pin: '600017', terms: 0 },
      { name: 'Hotel Saravana Residency', line1: '12 GN Chetty Road', city: 'Chennai', state: '33', pin: '600017', pan: 'AAHFS2201B', terms: 15, creditLimit: 150000 },
      { name: 'Little Flower School Canteen', line1: '3 Mount Road', city: 'Chennai', state: '33', pin: '600002', terms: 30 },
      { name: 'Lakshmi Mess', line1: 'Gandhipuram 2nd Street', city: 'Coimbatore', state: '33', pin: '641012', terms: 7 },
      { name: 'Meena Venkatesh', line1: '9 Burkit Road', city: 'Chennai', state: '33', pin: '600017', terms: 0 },
    ],
    suppliers: [
      { name: 'Sri Murugan Agencies', line1: '18 Kotwal Chavadi', city: 'Chennai', state: '33', pin: '600001', pan: 'AAKFS6614C', terms: 21, msme: 'micro', opening: 28000 },
      { name: 'HUL Redistribution Stockist', line1: 'Ambattur Industrial Estate', city: 'Chennai', state: '33', pin: '600058', pan: 'AABCH4410G', terms: 15 },
      { name: 'Kongu Rice Mill', line1: 'Mettupalayam Road', city: 'Coimbatore', state: '33', pin: '641043', terms: 7, msme: 'micro' },
    ],
    traits: {
      walkIn: true,
      costCentres: [
        { name: 'T. Nagar floor', category: 'Store' },
        { name: 'Coimbatore floor', category: 'Store' },
      ],
      assets: [
        { name: 'Billing counters and POS', category: 'Computers', account: 'sys:fixedAssets', cost: 168000, months: 20, method: 'slm', life: 60 },
        { name: 'Visi-coolers (3)', category: 'Machinery', account: 'sys:fixedAssets', cost: 126000, months: 14, method: 'wdv', rate: 15 },
      ],
      expenses: [
        ['Rent', 140000, 18],
        ['Salaries & wages', 185000, 0],
        ['Utilities', 32000, 0],
        ['Bank charges', 2400, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ distributor */
  {
    key: 'distributor',
    type: 'distributor',
    name: 'Deccan FMCG Distributors',
    legalName: 'Deccan FMCG Distributors LLP',
    email: 'billing@deccanfmcg.example',
    phone: '+91 40 2784 5500',
    pan: 'AARFD3378M',
    registered: true,
    returnFrequency: 'monthly',
    branches: [
      { name: 'Hyderabad — Main godown', code: 'HYD', address: addr('Plot 9, IDA Kukatpally', 'Hyderabad', '36', '500072'), phone: '+91 40 2784 5500' },
      { name: 'Vijayawada — Depot', code: 'VJA', address: addr('D.No 40-1-12, Benz Circle', 'Vijayawada', '37', '520010'), ownGstin: true },
      { name: 'Bengaluru — Depot', code: 'BLR', address: addr('No 14, Peenya 2nd Stage', 'Bengaluru', '29', '560058'), ownGstin: true },
    ],
    bank: { name: 'ICICI Bank', ifsc: 'ICIC0000654', branch: 'Kukatpally', account: '065405002211', upi: 'deccanfmcg@icici' },
    categories: cats('Beverages', 'Snacks', 'Dairy', 'Personal care'),
    brands: ['Parle', 'Amul', 'Haldiram', 'Colgate', 'Bisleri'],
    items: [
      { sku: 'BV-WTR-1C', name: 'Packaged water 1 L (case of 12)', unit: 'BOX', sale: 192, purchase: 150, gst: 18, hsn: '220110', stock: 900, reorder: 200, category: 'Beverages', brand: 'Bisleri' },
      { sku: 'SN-PARLE-C', name: 'Glucose biscuits (carton of 48)', unit: 'BOX', sale: 420, purchase: 352, gst: 18, hsn: '190531', stock: 640, reorder: 150, category: 'Snacks', brand: 'Parle' },
      { sku: 'DY-BUTTER-C', name: 'Butter 500 g (carton of 20)', unit: 'BOX', sale: 5400, purchase: 4880, gst: 12, hsn: '040510', stock: 80, reorder: 20, category: 'Dairy', brand: 'Amul' },
      { sku: 'SN-BHUJIA-C', name: 'Bhujia 400 g (carton of 24)', unit: 'BOX', sale: 2350, purchase: 1960, gst: 12, hsn: '210690', stock: 210, reorder: 50, category: 'Snacks', brand: 'Haldiram' },
      { sku: 'PC-PASTE-C', name: 'Toothpaste 150 g (carton of 36)', unit: 'BOX', sale: 3420, purchase: 2950, gst: 18, hsn: '330610', stock: 140, reorder: 30, category: 'Personal care', brand: 'Colgate' },
      { sku: 'DY-GHEE-C', name: 'Ghee 1 L (carton of 12)', unit: 'BOX', sale: 7680, purchase: 7050, gst: 12, hsn: '040590', stock: 25, reorder: 30, category: 'Dairy', brand: 'Amul' },
      { sku: 'SV-SCHEME', name: 'Display and merchandising service', type: 'service', unit: 'NOS', sale: 15000, purchase: 0, gst: 18, hsn: '998397' },
    ],
    customers: [
      { name: 'Ratnadeep Supermarket', line1: 'Ameerpet X Roads', city: 'Hyderabad', state: '36', pin: '500016', pan: 'AAFCR3389L', terms: 21, creditLimit: 900000, opening: 118000 },
      { name: 'Vijetha Retail', line1: 'Kondapur Main Road', city: 'Hyderabad', state: '36', pin: '500084', pan: 'AADCV6600Q', terms: 30 },
      { name: 'Sri Lakshmi Kirana', line1: 'Governorpet', city: 'Vijayawada', state: '37', pin: '520002', terms: 15 },
      { name: 'Namdhari Fresh', line1: 'Bannerghatta Road', city: 'Bengaluru', state: '29', pin: '560076', pan: 'AAACN4471F', terms: 30 },
      { name: 'Guntur Wholesale Mart', line1: 'Brodipet', city: 'Guntur', state: '37', pin: '522002', pan: 'AAKFG2208H', terms: 30 },
      { name: 'Heritage Mini Mart', line1: 'Banjara Hills Road 12', city: 'Hyderabad', state: '36', pin: '500034', terms: 7 },
    ],
    suppliers: [
      { name: 'Parle Products — CFA Hyderabad', line1: 'Shamshabad Logistics Park', city: 'Hyderabad', state: '36', pin: '501218', pan: 'AAACP2264E', terms: 15, opening: 210000 },
      { name: 'Kaira Dairy Co-op — Hyderabad', line1: 'Uppal Industrial Area', city: 'Hyderabad', state: '36', pin: '500039', pan: 'AAAAK0153M', terms: 7 },
      { name: 'Haldiram Snacks — Nagpur', line1: 'Hingna MIDC', city: 'Nagpur', state: '27', pin: '440016', pan: 'AAACH8857J', terms: 30 },
      { name: 'VRL Logistics', line1: 'Hubballi Road', city: 'Hubballi', state: '29', pin: '580030', pan: 'AABCV3609C', terms: 15, tds: '194C' },
    ],
    traits: {
      eway: true,
      einvoice: true,
      vehicles: ['TS09UB4471', 'AP16TC9021', 'KA51AB3390'],
      costCentres: [
        { name: 'Telangana', category: 'Region' },
        { name: 'Andhra Pradesh', category: 'Region' },
        { name: 'Karnataka', category: 'Region' },
      ],
      assets: [
        { name: 'Eicher 14 ft truck', category: 'Vehicles', account: 'sys:fixedAssets', cost: 1640000, months: 30, method: 'wdv', rate: 15 },
        { name: 'Cold room — Hyderabad', category: 'Machinery', account: 'sys:fixedAssets', cost: 920000, months: 22, method: 'slm', life: 120 },
      ],
      expenses: [
        ['Rent', 120000, 18],
        ['Salaries & wages', 420000, 0],
        ['Transport & freight', 96000, 5],
        ['Repairs & maintenance', 22000, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ manufacturer */
  {
    key: 'manufacturer',
    type: 'manufacturer',
    name: 'Sahyadri Precision Components',
    legalName: 'Sahyadri Precision Components Pvt Ltd',
    email: 'accounts@sahyadriprecision.example',
    phone: '+91 20 2712 3300',
    website: 'sahyadriprecision.example',
    pan: 'AAKCS7745P',
    registered: true,
    returnFrequency: 'monthly',
    branches: [
      { name: 'Pune — Plant', code: 'PNQ', address: addr('Gat 112, Chakan MIDC Phase 2', 'Pune', '27', '410501'), phone: '+91 20 2712 3300' },
      { name: 'Nagpur — Depot', code: 'NAG', address: addr('Plot B-41, Butibori MIDC', 'Nagpur', '27', '441122') },
    ],
    bank: { name: 'State Bank of India', ifsc: 'SBIN0011870', branch: 'Chakan', account: '39011223344', upi: 'sahyadri@sbi' },
    categories: cats('Raw material', 'Finished goods', 'Consumables', 'Scrap'),
    brands: ['Sahyadri'],
    items: [
      { sku: 'RM-MS-RD20', name: 'MS round bar 20 mm', unit: 'KG', sale: 0, purchase: 62, gst: 18, hsn: '721420', stock: 4200, reorder: 1500, category: 'Raw material', rawMaterial: true },
      { sku: 'RM-AL-ING', name: 'Aluminium ingot', unit: 'KG', sale: 0, purchase: 238, gst: 18, hsn: '760110', stock: 900, reorder: 400, category: 'Raw material', rawMaterial: true },
      { sku: 'CN-CUT-OIL', name: 'Cutting oil 20 L', unit: 'PCS', sale: 0, purchase: 3150, gst: 18, hsn: '271019', stock: 14, reorder: 6, category: 'Consumables', rawMaterial: true },
      { sku: 'FG-FLG-50', name: 'Machined flange 50 NB', unit: 'PCS', sale: 485, purchase: 300, gst: 18, hsn: '730791', stock: 1200, reorder: 300, category: 'Finished goods', brand: 'Sahyadri' },
      { sku: 'FG-SHAFT-A', name: 'Drive shaft type A', unit: 'PCS', sale: 1860, purchase: 1150, gst: 18, hsn: '848310', stock: 320, reorder: 80, category: 'Finished goods', brand: 'Sahyadri' },
      { sku: 'FG-HSG-AL', name: 'Aluminium pump housing', unit: 'PCS', sale: 2740, purchase: 1720, gst: 18, hsn: '841391', stock: 140, reorder: 50, category: 'Finished goods', brand: 'Sahyadri' },
      { sku: 'SC-MS-TURN', name: 'MS turning scrap', unit: 'KG', sale: 28, purchase: 0, gst: 18, hsn: '720449', stock: 2600, reorder: 0, category: 'Scrap' },
      { sku: 'SV-JOBWORK', name: 'CNC job work', type: 'service', unit: 'HR', sale: 1400, purchase: 0, gst: 12, hsn: '998873' },
      { sku: 'CG-VMC-850', name: 'VMC 850 machining centre', unit: 'PCS', sale: 0, purchase: 2850000, gst: 18, hsn: '845710', category: 'Consumables', rawMaterial: true, capitalGoods: true },
    ],
    customers: [
      { name: 'Kirloskar Pumps Ltd', line1: 'Kirloskarvadi Works', city: 'Sangli', state: '27', pin: '416308', pan: 'AAACK1234F', terms: 60, creditLimit: 2500000, opening: 365000 },
      { name: 'Mahindra Tractors — Nagpur', line1: 'MIDC Hingna Road', city: 'Nagpur', state: '27', pin: '440016', pan: 'AAACM3025E', terms: 45 },
      { name: 'Escorts Kubota', line1: 'Plot 18, Sector 13', city: 'Faridabad', state: '06', pin: '121007', pan: 'AAACE0702B', terms: 60 },
      { name: 'Shakti Pumps India', line1: 'Pithampur Sector 3', city: 'Dhar', state: '23', pin: '454774', pan: 'AAECS4497K', terms: 45 },
      { name: 'Shree Ram Scrap Traders', line1: 'Bhosari Scrap Market', city: 'Pune', state: '27', pin: '411026', pan: 'AJBPR6618L', terms: 0, tcs: 'scrap' },
    ],
    suppliers: [
      { name: 'JSW Steel Service Centre', line1: 'Talegaon MIDC', city: 'Pune', state: '27', pin: '410507', pan: 'AABCJ4371N', terms: 30, opening: 480000 },
      { name: 'Hindalco Metal Depot', line1: 'Taloja MIDC', city: 'Navi Mumbai', state: '27', pin: '410208', pan: 'AAACH1201R', terms: 30 },
      { name: 'Pune Tooling Works', line1: 'Bhosari MIDC J-Block', city: 'Pune', state: '27', pin: '411026', pan: 'AAQFP6620D', terms: 30, msme: 'micro', tds: '194C' },
      { name: 'Makino India', line1: 'Peenya Phase 1', city: 'Bengaluru', state: '29', pin: '560058', pan: 'AAACM6640H', terms: 30 },
      { name: 'Deshmukh Security Services', line1: 'Chinchwad Station Road', city: 'Pune', state: '27', pin: '411019', pan: 'ABDPD7731G', terms: 15, tds: '194C', reverseCharge: true },
    ],
    traits: {
      eway: true,
      einvoice: true,
      fifo: true,
      scrapTcs: true,
      vehicles: ['MH14HU2290', 'MH12QW7781'],
      costCentres: [
        { name: 'Machine shop', category: 'Department' },
        { name: 'Foundry', category: 'Department' },
        { name: 'Assembly', category: 'Department' },
      ],
      assets: [
        { name: 'CNC turning centre — LMW', category: 'Machinery', account: 'sys:fixedAssets', cost: 3450000, months: 34, method: 'slm', life: 180 },
        { name: 'Air compressor 30 HP', category: 'Machinery', account: 'sys:fixedAssets', cost: 545000, months: 16, method: 'wdv', rate: 15 },
        { name: 'Factory shed extension', category: 'Building', account: 'sys:fixedAssets', cost: 2200000, months: 28, method: 'slm', life: 360 },
        { name: 'Old lathe machine', category: 'Machinery', account: 'sys:fixedAssets', cost: 380000, months: 70, method: 'slm', life: 120, disposed: true },
      ],
      expenses: [
        ['Salaries & wages', 680000, 0],
        ['Utilities', 145000, 18],
        ['Repairs & maintenance', 48000, 18],
        ['Transport & freight', 36000, 5],
      ],
    },
  },

  /* ------------------------------------------------------------------ restaurant */
  {
    key: 'restaurant',
    type: 'restaurant',
    name: 'Malgudi Kitchen',
    legalName: 'Malgudi Kitchen Hospitality LLP',
    email: 'manager@malgudikitchen.example',
    phone: '+91 80 4115 2200',
    website: 'malgudikitchen.example',
    pan: 'ABEFM9921R',
    registered: true,
    returnFrequency: 'qrmp',
    branches: [
      { name: 'Indiranagar outlet', code: 'IND', address: addr('640, 12th Main, HAL 2nd Stage, Indiranagar', 'Bengaluru', '29', '560038'), phone: '+91 80 4115 2200' },
      { name: 'Jayanagar outlet', code: 'JAY', address: addr('31, 11th Main, 4th Block, Jayanagar', 'Bengaluru', '29', '560011'), phone: '+91 80 4115 3300' },
    ],
    bank: { name: 'Kotak Mahindra Bank', ifsc: 'KKBK0008042', branch: 'Indiranagar', account: '8812345670', upi: 'malgudi@kotak' },
    categories: cats('Meals', 'Beverages', 'Catering', 'Ingredients'),
    brands: [],
    items: [
      { sku: 'ML-THALI', name: 'South Indian thali', type: 'service', unit: 'NOS', sale: 280, purchase: 0, gst: 5, hsn: '996331', category: 'Meals' },
      { sku: 'ML-DOSA', name: 'Ghee roast dosa', type: 'service', unit: 'NOS', sale: 160, purchase: 0, gst: 5, hsn: '996331', category: 'Meals' },
      { sku: 'BV-FILTER', name: 'Filter coffee', type: 'service', unit: 'NOS', sale: 60, purchase: 0, gst: 5, hsn: '996331', category: 'Beverages' },
      { sku: 'CT-BUFFET', name: 'Corporate lunch buffet (per plate)', type: 'service', unit: 'NOS', sale: 450, purchase: 0, gst: 5, hsn: '996334', category: 'Catering' },
      { sku: 'IN-RICE-25', name: 'Sona masoori rice 25 kg', unit: 'PCS', sale: 0, purchase: 1380, gst: 5, hsn: '100630', stock: 30, reorder: 10, category: 'Ingredients', rawMaterial: true },
      { sku: 'IN-GHEE-15', name: 'Ghee 15 kg tin', unit: 'PCS', sale: 0, purchase: 8250, gst: 12, hsn: '040590', stock: 4, reorder: 3, category: 'Ingredients', rawMaterial: true },
      { sku: 'IN-COFFEE-1', name: 'Coffee powder 1 kg', unit: 'PCS', sale: 0, purchase: 720, gst: 5, hsn: '090121', stock: 18, reorder: 8, category: 'Ingredients', rawMaterial: true },
    ],
    customers: [
      { name: 'Dine-in guests', line1: 'Counter sale', city: 'Bengaluru', state: '29', pin: '560038', terms: 0 },
      { name: 'Swiggy (aggregator settlements)', line1: 'Embassy Tech Village', city: 'Bengaluru', state: '29', pin: '560103', pan: 'AADCB2230M', terms: 7 },
      { name: 'Infosys Electronic City (catering)', line1: 'Hosur Road', city: 'Bengaluru', state: '29', pin: '560100', pan: 'AAACI4798L', terms: 30, creditLimit: 500000 },
      { name: 'Ramesh Iyer (party order)', line1: '22 3rd Cross, Malleshwaram', city: 'Bengaluru', state: '29', pin: '560003', terms: 0 },
    ],
    suppliers: [
      { name: 'Hopcoms Vegetable Supply', line1: 'Lalbagh Double Road', city: 'Bengaluru', state: '29', pin: '560027', terms: 7, msme: 'micro' },
      { name: 'Nandini Dairy Parlour Wholesale', line1: 'Dr MH Marigowda Road', city: 'Bengaluru', state: '29', pin: '560029', pan: 'AAACK2930B', terms: 7 },
      { name: 'Metro Cash & Carry', line1: 'Yeshwanthpur', city: 'Bengaluru', state: '29', pin: '560022', pan: 'AABCM5701H', terms: 0 },
    ],
    traits: {
      walkIn: true,
      costCentres: [
        { name: 'Indiranagar kitchen', category: 'Outlet' },
        { name: 'Jayanagar kitchen', category: 'Outlet' },
      ],
      assets: [
        { name: 'Commercial kitchen equipment', category: 'Machinery', account: 'sys:fixedAssets', cost: 1180000, months: 26, method: 'wdv', rate: 15 },
        { name: 'Interiors — Jayanagar', category: 'Furniture', account: 'sys:fixedAssets', cost: 860000, months: 12, method: 'slm', life: 84 },
      ],
      expenses: [
        ['Rent', 210000, 18],
        ['Salaries & wages', 380000, 0],
        ['Utilities', 64000, 18],
        ['Marketing', 30000, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ services */
  {
    key: 'services',
    type: 'services',
    name: 'Brightline Digital Services',
    legalName: 'Brightline Digital Services Pvt Ltd',
    email: 'finance@brightline.example',
    phone: '+91 11 4105 6600',
    website: 'brightline.example',
    pan: 'AAJCB8853Q',
    registered: true,
    returnFrequency: 'monthly',
    branches: [
      { name: 'Gurugram — Studio', code: 'GGN', address: addr('Tower B, 7th floor, DLF Cyber City', 'Gurugram', '06', '122002'), phone: '+91 12 4405 6600' },
      { name: 'Delhi — Client office', code: 'DEL', address: addr('Block E, Connaught Place', 'Delhi', '07', '110001'), ownGstin: true },
    ],
    bank: { name: 'Axis Bank', ifsc: 'UTIB0000700', branch: 'Cyber City', account: '920020045612288', upi: 'brightline@axisbank' },
    categories: cats('Retainers', 'Projects', 'Media'),
    brands: [],
    items: [
      { sku: 'RT-SOCIAL', name: 'Social media retainer (monthly)', type: 'service', unit: 'NOS', sale: 85000, purchase: 0, gst: 18, hsn: '998366', category: 'Retainers' },
      { sku: 'RT-SEO', name: 'SEO retainer (monthly)', type: 'service', unit: 'NOS', sale: 60000, purchase: 0, gst: 18, hsn: '998365', category: 'Retainers' },
      { sku: 'PJ-WEB', name: 'Website design and build', type: 'service', unit: 'NOS', sale: 350000, purchase: 0, gst: 18, hsn: '998314', category: 'Projects' },
      { sku: 'PJ-VIDEO', name: 'Brand film production', type: 'service', unit: 'NOS', sale: 240000, purchase: 0, gst: 18, hsn: '999613', category: 'Projects' },
      { sku: 'PJ-HOURS', name: 'Consulting hours', type: 'service', unit: 'HR', sale: 4500, purchase: 0, gst: 18, hsn: '998311', category: 'Projects' },
      { sku: 'MD-ADS', name: 'Media buying (pass-through)', type: 'service', unit: 'NOS', sale: 100000, purchase: 100000, gst: 18, hsn: '998365', category: 'Media' },
    ],
    customers: [
      { name: 'Urban Threads Apparel', line1: 'Sector 44', city: 'Gurugram', state: '06', pin: '122003', pan: 'AABCU2290N', terms: 30, tds: '194JB', opening: 177000 },
      { name: 'Nimbus Fintech', line1: 'Okhla Phase 3', city: 'Delhi', state: '07', pin: '110020', pan: 'AAFCN8871K', terms: 15 },
      { name: 'GreenLeaf Organics', line1: 'Koregaon Park', city: 'Pune', state: '27', pin: '411001', pan: 'AAGCG1109F', terms: 30 },
      { name: 'Aarohan Foundation', line1: 'Lodhi Estate', city: 'Delhi', state: '07', pin: '110003', terms: 30 },
      { name: 'Kestrel Motors', line1: 'IMT Manesar', city: 'Gurugram', state: '06', pin: '122051', pan: 'AAECK7712M', terms: 45, creditLimit: 1200000 },
    ],
    suppliers: [
      { name: 'Ritika Sen (freelance designer)', line1: 'Malviya Nagar', city: 'Delhi', state: '07', pin: '110017', pan: 'DXRPS4410K', terms: 7, tds: '194JB' },
      { name: 'Frame by Frame Studios', line1: 'Film City, Noida', city: 'Noida', state: '09', pin: '201301', pan: 'AAKFF6629E', terms: 30, tds: '194C', msme: 'small' },
      { name: 'Google India (Ads)', line1: 'RMZ Infinity', city: 'Bengaluru', state: '29', pin: '560016', pan: 'AACCG0527D', terms: 0 },
      { name: 'WeWork India', line1: 'DLF Cyber City', city: 'Gurugram', state: '06', pin: '122002', pan: 'AAACW1194L', terms: 0, tds: '194IB' },
    ],
    traits: {
      retainers: true,
      costCentres: [
        { name: 'Creative', category: 'Team' },
        { name: 'Performance marketing', category: 'Team' },
        { name: 'Tech', category: 'Team' },
      ],
      assets: [
        { name: 'MacBook Pro fleet (12)', category: 'Computers', account: 'sys:fixedAssets', cost: 2340000, months: 15, method: 'wdv', rate: 40 },
        { name: 'Studio camera kit', category: 'Machinery', account: 'sys:fixedAssets', cost: 640000, months: 9, method: 'slm', life: 60 },
      ],
      expenses: [
        ['Rent', 260000, 18],
        ['Salaries & wages', 1450000, 0],
        ['Professional fees', 75000, 18],
        ['Travel', 46000, 5],
        ['Marketing', 40000, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ freelancer */
  {
    key: 'freelancer',
    type: 'freelancer',
    name: 'Kavya Raman Consulting',
    legalName: 'Kavya Raman',
    email: 'kavya@kavyaraman.example',
    phone: '+91 98450 22110',
    website: 'kavyaraman.example',
    pan: 'BQRPR4471M',
    registered: true,
    returnFrequency: 'qrmp',
    lut: 'AD290426001234K',
    branches: [
      { name: 'Home office — Kochi', code: 'KOC', address: addr('Flat 6B, Marine Drive Residency', 'Kochi', '32', '682031') },
      { name: 'Co-working — Bengaluru', code: 'BLR', address: addr('91springboard, Koramangala 5th Block', 'Bengaluru', '29', '560095'), ownGstin: true },
    ],
    bank: { name: 'Federal Bank', ifsc: 'FDRL0001120', branch: 'Marine Drive', account: '11200100445566', upi: 'kavya@federal' },
    categories: cats('Consulting', 'Workshops'),
    brands: [],
    items: [
      { sku: 'CS-DAY', name: 'UX research consulting (day rate)', type: 'service', unit: 'DAY', sale: 28000, purchase: 0, gst: 18, hsn: '998311', category: 'Consulting' },
      { sku: 'CS-AUDIT', name: 'Usability audit (fixed fee)', type: 'service', unit: 'NOS', sale: 150000, purchase: 0, gst: 18, hsn: '998311', category: 'Consulting' },
      { sku: 'WS-TEAM', name: 'Design thinking workshop', type: 'service', unit: 'NOS', sale: 90000, purchase: 0, gst: 18, hsn: '999293', category: 'Workshops' },
      { sku: 'CS-HOUR', name: 'Advisory call (hourly)', type: 'service', unit: 'HR', sale: 6000, purchase: 0, gst: 18, hsn: '998311', category: 'Consulting' },
    ],
    customers: [
      { name: 'Northwind Labs Inc.', line1: '500 Howard Street', city: 'San Francisco', state: '96', pin: '94105', terms: 30, overseas: { country: 'US', currency: 'USD' } },
      { name: 'Fjord Studio AS', line1: 'Karl Johans gate 22', city: 'Oslo', state: '96', pin: '0159', terms: 30, overseas: { country: 'GB', currency: 'GBP' } },
      { name: 'Zeta Health Tech', line1: 'HSR Layout Sector 2', city: 'Bengaluru', state: '29', pin: '560102', pan: 'AAFCZ5521P', terms: 15, tds: '194JB' },
      { name: 'Kerala Startup Mission', line1: 'Technopark Phase 1', city: 'Thiruvananthapuram', state: '32', pin: '695581', pan: 'AAAGK0091C', terms: 30 },
    ],
    suppliers: [
      { name: '91springboard', line1: 'Koramangala 5th Block', city: 'Bengaluru', state: '29', pin: '560095', pan: 'AAGCS3376H', terms: 0 },
      { name: 'Figma (software)', line1: '760 Market Street', city: 'San Francisco', state: '96', pin: '94102', terms: 0, overseas: { country: 'US', currency: 'USD' }, reverseCharge: true },
    ],
    traits: {
      exports: true,
      costCentres: [
        { name: 'International clients', category: 'Market' },
        { name: 'Domestic clients', category: 'Market' },
      ],
      assets: [{ name: 'Laptop and monitor', category: 'Computers', account: 'sys:fixedAssets', cost: 245000, months: 11, method: 'wdv', rate: 40 }],
      expenses: [
        ['Rent', 18000, 18],
        ['Travel', 22000, 5],
        ['Office supplies', 4500, 18],
        ['Professional fees', 12000, 18],
      ],
    },
  },

  /* ------------------------------------------------------------------ other (unregistered) */
  {
    key: 'other',
    type: 'other',
    name: 'Nirmal Seva Trust',
    legalName: 'Nirmal Seva Charitable Trust',
    email: 'office@nirmalseva.example',
    phone: '+91 33 2465 1188',
    pan: 'AAATN2214D',
    registered: false,
    branches: [
      { name: 'Kolkata — Office', code: 'KOL', address: addr('14 Elgin Road, Bhowanipore', 'Kolkata', '19', '700020'), phone: '+91 33 2465 1188' },
      { name: 'Howrah — Community centre', code: 'HWH', address: addr('Shibpur Road, near Botanical Garden', 'Howrah', '19', '711103') },
    ],
    bank: { name: 'Bank of Baroda', ifsc: 'BARB0ELGINR', branch: 'Elgin Road', account: '27450100009911', upi: 'nirmalseva@barodampay' },
    categories: cats('Programmes', 'Supplies'),
    brands: [],
    items: [
      { sku: 'PG-TUITION', name: 'Evening tuition (monthly fee)', type: 'service', unit: 'NOS', sale: 600, purchase: 0, gst: 0, hsn: '999293', category: 'Programmes' },
      { sku: 'PG-SKILL', name: 'Tailoring course fee', type: 'service', unit: 'NOS', sale: 2500, purchase: 0, gst: 0, hsn: '999293', category: 'Programmes' },
      { sku: 'SP-KIT', name: 'Student stationery kit', unit: 'SET', sale: 350, purchase: 240, gst: 0, hsn: '482090', stock: 140, reorder: 40, category: 'Supplies' },
      { sku: 'SP-RATION', name: 'Dry ration kit', unit: 'SET', sale: 900, purchase: 760, gst: 0, hsn: '190490', stock: 60, reorder: 30, category: 'Supplies' },
    ],
    customers: [
      { name: 'Ballygunge Parents Group', line1: 'Ballygunge Place', city: 'Kolkata', state: '19', pin: '700019', terms: 15 },
      { name: 'Howrah Mahila Samiti', line1: 'GT Road', city: 'Howrah', state: '19', pin: '711101', terms: 30 },
      { name: 'CSR — Eastern Coalfields', line1: 'Sanctoria', city: 'Asansol', state: '19', pin: '713333', pan: 'AAACE6641E', terms: 30 },
    ],
    suppliers: [
      { name: 'Dey Stationers', line1: 'College Street', city: 'Kolkata', state: '19', pin: '700073', terms: 15, msme: 'micro' },
      { name: 'Annapurna Provisions', line1: 'Posta Bazar', city: 'Kolkata', state: '19', pin: '700007', terms: 7 },
    ],
    traits: {
      costCentres: [
        { name: 'Education', category: 'Programme' },
        { name: 'Relief', category: 'Programme' },
      ],
      assets: [{ name: 'Sewing machines (10)', category: 'Machinery', account: 'sys:fixedAssets', cost: 145000, months: 19, method: 'slm', life: 96 }],
      expenses: [
        ['Rent', 15000, 0],
        ['Salaries & wages', 68000, 0],
        ['Utilities', 6500, 0],
      ],
    },
  },
];
