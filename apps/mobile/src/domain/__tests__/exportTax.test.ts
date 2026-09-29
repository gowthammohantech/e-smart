import { buildTaxContext, splitTax } from '@/domain/taxEngine';
import { fromMajor } from '@/lib/money';
import { Company, Party } from '@/types';

const company = (lut?: { lutNumber: string; lutValidTill?: string }): Company => ({
  id: 'c',
  accountId: 'a',
  name: 'Acme',
  businessType: 'Trading',
  country: 'IN',
  baseCurrency: 'INR',
  address: { line1: '', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '', country: 'IN' },
  taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27', ...lut },
  fiscalYearStartMonth: 4,
  plan: 'pro',
  createdAt: '2026-01-01',
});

const party = (type: Party['gstRegistrationType'], stateCode: string): Party =>
  ({ id: 'p', gstRegistrationType: type, billingAddress: { stateCode } }) as Party;

const taxable = fromMajor('1000', 'INR');
const types = (c: ReturnType<typeof buildTaxContext>) => splitTax(taxable, 18, c).map((x) => x.type);

describe('export, SEZ and import tax', () => {
  it('charges IGST on an export without LUT', () => {
    const ctx = buildTaxContext(company(), { party: party('overseas', '96'), placeOfSupply: '96', date: '2026-06-01', purchase: false });
    expect(ctx.crossBorder).toBe('export');
    expect(types(ctx)).toEqual(['IGST']);
  });

  it('zero-rates an export under a valid LUT', () => {
    const c = company({ lutNumber: 'AD270426012345X', lutValidTill: '2027-03-31' });
    const ctx = buildTaxContext(c, { party: party('overseas', '96'), placeOfSupply: '96', date: '2026-06-01', purchase: false });
    expect(splitTax(taxable, 18, ctx)).toEqual([]);
  });

  it('charges IGST again once the LUT has lapsed', () => {
    const c = company({ lutNumber: 'AD270426012345X', lutValidTill: '2026-03-31' });
    const ctx = buildTaxContext(c, { party: party('overseas', '96'), placeOfSupply: '96', date: '2026-06-01', purchase: false });
    expect(types(ctx)).toEqual(['IGST']);
  });

  it('treats an SEZ buyer in the home state as inter-state', () => {
    const ctx = buildTaxContext(company(), { party: party('sez', '27'), placeOfSupply: '27', date: '2026-06-01', purchase: false });
    expect(types(ctx)).toEqual(['IGST']);
  });

  it('puts no GST on a bill from an overseas supplier', () => {
    const ctx = buildTaxContext(company(), { party: party('overseas', '96'), placeOfSupply: '96', date: '2026-06-01', purchase: true });
    expect(ctx.crossBorder).toBe('import');
    expect(splitTax(taxable, 18, ctx)).toEqual([]);
  });

  it('keeps CGST + SGST for an ordinary local sale', () => {
    const ctx = buildTaxContext(company(), { party: party('regular', '27'), placeOfSupply: '27', date: '2026-06-01', purchase: false });
    expect(types(ctx)).toEqual(['CGST', 'SGST']);
  });
});
