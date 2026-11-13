import { buildTaxContext, defaultSezTax, splitTax } from '../taxEngine';
import { fromMajor } from '../../lib/money';
import { Company, Party } from '../../types';

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

  it('charges an SEZ supply IGST or none as chosen, on a sale and on a bill, LUT or not', () => {
    const lut = company({ lutNumber: 'AD270426012345X', lutValidTill: '2027-03-31' });
    for (const c of [company(), lut]) {
      for (const purchase of [false, true]) {
        const at = (sezTax?: 'withTax' | 'withoutTax') => buildTaxContext(c, { party: party('sez', '29'), placeOfSupply: '29', date: '2026-06-01', purchase, sezTax });
        expect(types(at('withTax'))).toEqual(['IGST']);
        expect(splitTax(taxable, 18, at('withoutTax'))).toEqual([]);
      }
    }
    // Unchosen: a sale follows the LUT, a bill from an SEZ supplier charges IGST.
    const unchosen = (c: Company, purchase: boolean) => buildTaxContext(c, { party: party('sez', '29'), placeOfSupply: '29', date: '2026-06-01', purchase });
    expect(splitTax(taxable, 18, unchosen(lut, false))).toEqual([]);
    expect(types(unchosen(company(), false))).toEqual(['IGST']);
    expect(types(unchosen(lut, true))).toEqual(['IGST']);
    expect(defaultSezTax(lut, '2026-06-01', false)).toBe('withoutTax');
    expect(defaultSezTax(lut, '2026-06-01', true)).toBe('withTax');
  });

  it('leaves exports to the LUT whatever an SEZ choice says', () => {
    const ctx = buildTaxContext(company(), { party: party('overseas', '96'), placeOfSupply: '96', date: '2026-06-01', purchase: false, sezTax: 'withoutTax' });
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
