import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, line, moneySetup } from './money-fixtures';

/** RULES 1.10: from 1 Dec 2026 an invoice's charges are spread over its lines and taxed with them. */
const t = setupApi();

const inr = (minor: number) => ({ minor, currency: 'INR' });

describe('charges taxed with the lines (RULES 1.10)', () => {
  it('taxes the charges of a December invoice pro rata over its 5% and 18% lines, and the books balance', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-12-10T06:00:00.000Z');
    // 2,000 at 18% and 6,000 at 5%: ₹400 of freight splits 100 / 300.
    const res = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, { date: '2026-12-05', status: 'issued', charges: inr(40000), lines: [line(m.gst(18)), line(m.gst(5), { name: 'Rice', quantity: 6 })] }),
      { token: m.token },
    );
    expect(res.status, res.raw).toBe(201);
    const totals = res.body.totals;
    expect(totals).toMatchObject({ taxableAmount: inr(840000), charges: inr(0), chargesTaxed: inr(40000) });
    const rate = (r: number) => totals.taxLines.find((l: { rate: number }) => l.rate === r);
    expect(rate(18).taxableAmount).toEqual(inr(210000));
    expect(rate(5).taxableAmount).toEqual(inr(630000));
    expect(totals.totalTax).toEqual(inr(37800 + 31500));
    expect(totals.grandTotal).toEqual(inr(840000 + 69300));

    // Read back, the totals are the same: the charges are not counted twice.
    const back = await t.get(`${m.c}/documents/${res.body.id}`, { token: m.token });
    expect(back.body.totals).toMatchObject({ taxableAmount: inr(840000), charges: inr(0), chargesTaxed: inr(40000), grandTotal: inr(909300) });

    const tb = await t.get(`${m.c}/books/trial-balance`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(tb.status).toBe(200);
    expect(tb.body.totalDebit).toEqual(tb.body.totalCredit);

    const gstr1 = await t.get(`${m.c}/gst/gstr1`, { token: m.token, query: { period: '122026' } });
    expect(gstr1.status).toBe(200);
    const rows = [...gstr1.body.b2b, ...gstr1.body.b2cs, ...gstr1.body.b2cl].filter((r: { documentId?: string }) => !r.documentId || r.documentId === res.body.id);
    const taxable = rows.reduce((a: number, r: { taxableValue: { minor: number } }) => a + r.taxableValue.minor, 0);
    expect(taxable).toBe(840000);
  });

  it('leaves an invoice dated before 1 December with its charges after tax, untaxed', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-11-25T06:00:00.000Z');
    const res = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-11-20', status: 'issued', charges: inr(40000) }), { token: m.token });
    expect(res.status, res.raw).toBe(201);
    expect(res.body.totals).toMatchObject({ taxableAmount: inr(200000), totalTax: inr(36000), charges: inr(40000), grandTotal: inr(276000) });
    expect(res.body.totals.chargesTaxed).toBeUndefined();
  });
});
