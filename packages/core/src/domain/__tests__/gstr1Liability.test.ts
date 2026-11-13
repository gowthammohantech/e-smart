import { gstr1Liability, type Gstr1Row, type Gstr1Summary, type Gstr1Table } from '../gstr1';
import { money } from '../../lib/money';
import type { AdvanceRow } from '../advanceTax';

const inr = (minor: number) => money(minor, 'INR');

/** An intra-state row: half the tax CGST, half SGST. */
function row(table: Gstr1Table, taxable: number, tax: number, over: Partial<Gstr1Row> = {}): Gstr1Row {
  return {
    documentId: `${table}-${taxable}`,
    kind: 'invoice',
    table,
    partyName: 'P',
    number: '1',
    date: '2023-09-01',
    placeOfSupply: '33',
    placeOfSupplyName: 'Tamil Nadu',
    rate: 18,
    taxableValue: inr(taxable),
    cgst: inr(tax / 2),
    sgst: inr(tax / 2),
    igst: inr(0),
    cess: inr(0),
    invoiceValue: inr(taxable + tax),
    ...over,
  };
}

const advance = (taxable: number, tax: number): AdvanceRow => ({ placeOfSupply: '33', rate: 18, interState: false, taxable, igst: 0, cgst: tax / 2, sgst: tax / 2, cess: 0 });

function summary(over: Partial<Record<Gstr1Table, Gstr1Row[]>> & { advances?: Gstr1Summary['advances'] }): Pick<Gstr1Summary, Gstr1Table | 'advances'> {
  return { b2b: [], b2cl: [], b2cs: [], exp: [], cdnr: [], cdnur: [], advances: { received: [], adjusted: [] }, ...over };
}

describe('GSTR-1 total liabilities', () => {
  it('is supplies + advances received − advances adjusted − credit notes, head by head (the books’ consolidated report)', () => {
    // Sep 2023 as the books show it: B2B 6,34,883.00 (CGST and SGST 10,837.20 each), advance 28,813.56
    // (2,593.22 each), advance adjustment 45,762.71 (4,118.64 each), a registered credit note 55.00 (3.30 each).
    const l = gstr1Liability(
      summary({
        b2b: [row('b2b', 63488300, 2167440)],
        cdnr: [row('cdnr', 5500, 660, { kind: 'creditNote', noteType: 'C' })],
        advances: { received: [advance(2881356, 518644)], adjusted: [advance(4576271, 823728)] },
      }),
    );
    expect(l.taxable).toBe(61787885);
    expect(l.cgst).toBe(930848);
    expect(l.sgst).toBe(930848);
    expect(l.igst).toBe(0);
    expect(l.supplies.taxable).toBe(63488300);
    expect(l.advancesReceived.taxable).toBe(2881356);
    expect(l.advancesAdjusted.taxable).toBe(4576271);
    expect(l.creditNotes.taxable).toBe(5500);
  });

  it('takes in every supply table, nets the notes inside B2CS, adds a debit note and leaves reverse-charge tax to the buyer', () => {
    const l = gstr1Liability(
      summary({
        b2b: [row('b2b', 10000, 1800), row('b2b', 5000, 900, { reverseCharge: true })],
        b2cl: [row('b2cl', 300000, 54000, { cgst: inr(0), sgst: inr(0), igst: inr(54000) })],
        b2cs: [row('b2cs', 2000, 360), row('b2cs', 500, 90, { kind: 'creditNote', noteType: 'C' })],
        exp: [row('exp', 7000, 0)],
        cdnr: [row('cdnr', 1000, 180, { kind: 'debitNote', noteType: 'D' })],
        cdnur: [row('cdnur', 3000, 540, { kind: 'creditNote', noteType: 'C', cgst: inr(0), sgst: inr(0), igst: inr(540) })],
      }),
    );
    // 10,000 + 5,000 + 3,00,000 + 2,000 − 500 + 7,000, then − (3,000 − 1,000) for the notes.
    expect(l.taxable).toBe(321500);
    // The reverse-charge B2B's 900 isn't the seller's to pay.
    expect(l.cgst + l.sgst).toBe(1800 + 360 - 90 + 180);
    expect(l.igst).toBe(54000 - 540);
    expect(l.creditNotes.taxable).toBe(2000);
  });

  it('is nothing for a month with nothing in it', () => {
    expect(gstr1Liability(summary({}))).toMatchObject({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  });
});
