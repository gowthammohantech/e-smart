import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup, pdfText } from './money-fixtures';
import { INR, books } from './report-fixtures';

const t = setupApi();

const range = { from: '2026-08-01', to: '2026-09-30' };

describe('reports', () => {
  it('builds every report from the books with core reports', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    const report = async (key: string, query: Record<string, string> = {}) => {
      const res = await t.get(`${m.c}/reports/${key}`, { token: m.token, query: { ...range, ...query } });
      expect(res.status, key).toBe(200);
      return res.body;
    };

    const sales = await report('sales-summary');
    expect(sales).toMatchObject({ total: INR(354000), taxable: INR(300000), tax: INR(54000), discount: INR(0), count: 2 });
    expect(sales.byMonth).toEqual([{ key: '2026-08', value: INR(118000) }, { key: '2026-09', value: INR(236000) }]);
    expect(sales.byParty).toEqual([
      { label: 'Sunrise Retail', value: INR(236000), count: 1 },
      { label: 'Anand Enterprises', value: INR(118000), count: 1 },
    ]);
    expect(sales.byItem).toEqual([{ label: 'Steel rod', value: INR(300000), count: 3 }]);
    expect(sales.documents.map((d: { id: string }) => d.id).sort()).toEqual([k.a.id, k.b.id].sort());
    expect((await report('sales-summary', { partyId: m.bengaluru.id })).total).toEqual(INR(118000));
    expect((await report('sales-summary', { from: '2026-09-01' })).count).toBe(1);

    expect(await report('purchase-summary')).toMatchObject({ total: INR(324500), taxable: INR(275000), tax: INR(49500), count: 1 });

    const expenses = await report('expense-summary');
    expect(expenses).toMatchObject({ total: INR(11800), tax: INR(1800), count: 1, byCategory: [{ label: k.category.name, value: INR(11800), count: 1 }], byMonth: [{ key: '2026-09', value: INR(11800) }] });
    expect(expenses.expenses[0].id).toBe(k.expense.id);

    const tax = await report('tax-summary');
    expect(tax.outward).toEqual([{ rate: 18, taxable: INR(300000), cgst: INR(18000), sgst: INR(18000), igst: INR(18000), total: INR(54000) }]);
    expect(tax.inward).toEqual([{ rate: 18, taxable: INR(275000), cgst: INR(24750), sgst: INR(24750), igst: INR(0), total: INR(49500) }]);
    expect(tax.netPayable).toEqual(INR(4500));

    const payments = await report('payments');
    expect(payments).toMatchObject({ received: INR(100000), paid: INR(0), net: INR(100000), byMethod: [{ label: 'Cash', value: INR(100000), count: 1 }], byAccount: [{ label: 'Cash', value: INR(100000), count: 1 }] });
    expect(payments.payments[0].id).toBe(k.payment.id);

    // Core's profit: revenue is taxable sales, less cost of goods sold at the
    // items' purchase price (3 × 600), less expenses net of their input tax.
    const profit = await report('profit');
    expect(profit).toMatchObject({ revenue: INR(300000), costOfGoods: INR(180000), grossProfit: INR(120000), expenses: INR(10000), netProfit: INR(110000) });
    expect(profit.netProfit.minor).toBe(sales.taxable.minor - 3 * 60000 - (expenses.total.minor - expenses.tax.minor));
    expect(profit.margin).toBeCloseTo((110000 / 300000) * 100, 6);
    expect(profit.byMonth).toEqual([
      { key: '2026-08', revenue: INR(100000), cost: INR(60000), expenses: INR(0), profit: INR(40000) },
      { key: '2026-09', revenue: INR(200000), cost: INR(120000), expenses: INR(10000), profit: INR(70000) },
    ]);

    // As of the end of the range: A is part paid and not yet due, B is 16 days overdue.
    const receivables = await report('receivables');
    expect(receivables).toMatchObject({ asOf: '2026-09-30', total: INR(254000) });
    expect(receivables.buckets.find((b: { key: string }) => b.key === 'current')).toEqual({ key: 'current', amount: INR(136000), count: 1 });
    expect(receivables.buckets.find((b: { key: string }) => b.key === 'd1_30')).toEqual({ key: 'd1_30', amount: INR(118000), count: 1 });
    expect((await report('payables')).total).toEqual(INR(324500));

    // Stock: +5 received, −3 invoiced (the draft moves nothing), valued at the 550 it came in at.
    const stock = await report('stock');
    expect(stock).toMatchObject({ totalValue: INR(110000), trackedCount: 1, lowCount: 0, outCount: 0 });
    expect(stock.rows).toMatchObject([{ item: { id: k.rod, name: 'Steel rod' }, onHand: 2, value: INR(110000), low: false }]);
  });

  it('exports CSV and PDF', async () => {
    const m = await moneySetup(t);
    const k = await books(t, m);
    const csv = await t.get(`${m.c}/reports/sales-summary`, { token: m.token, query: range, headers: { accept: 'text/csv' } });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('sales-summary-2026-08-01-2026-09-30.csv');
    const lines = csv.raw.trim().split('\r\n');
    expect(lines[0]).toBe('number,date,party,status,total,currency');
    expect(lines).toContain(`${k.a.number},2026-09-10,Sunrise Retail,partiallyPaid,2360,INR`);
    expect(lines).toHaveLength(3);

    const pdf = await t.get(`${m.c}/reports/profit`, { token: m.token, query: range, headers: { accept: 'application/pdf' } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.raw.startsWith('%PDF')).toBe(true);
    const text = pdfText(pdf.raw);
    expect(text).toContain('Profit snapshot');
    expect(text).toContain('Net profit 1100');
  });

  it('gates the buying-side reports by plan', async () => {
    const m = await moneySetup(t, 'basic');
    await issueInvoice(t, m, { date: '2026-09-10' });
    for (const key of ['purchase-summary', 'expense-summary', 'payables', 'stock', 'profit']) {
      const res = await t.get(`${m.c}/reports/${key}`, { token: m.token, query: range });
      expect(res.status, key).toBe(403);
      expect(res.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro' });
    }
    for (const key of ['sales-summary', 'receivables', 'tax-summary', 'payments']) {
      expect((await t.get(`${m.c}/reports/${key}`, { token: m.token, query: range })).status, key).toBe(200);
    }
    expect((await t.get(`${m.c}/reports/sales-summary`, { token: m.token, query: range })).body.total).toEqual(INR(236000));
    expect((await t.get(`${m.c}/reports/sales-summary`, { token: m.token, query: { from: '2026-10-01', to: '2026-09-01' } })).status).toBe(422);
  });
});
