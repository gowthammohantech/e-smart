import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

const t = setupApi();

describe('cash-flow forecast', () => {
  it('starts from cash in hand and adds what customers owe and recurring invoices, less bills', async () => {
    const m = await moneySetup(t);
    t.setNow('2026-09-29T10:00:00Z');
    await t.deps.db.update(schema.paymentAccounts).set({ openingBalanceMinor: 1_000_000 }).where(eq(schema.paymentAccounts.id, m.cash.id));
    const inv = await issueInvoice(t, m, { date: '2026-09-29', dueDate: '2026-10-10' });
    const bill = await t.post(
      `${m.c}/documents`,
      { kind: 'purchaseBill', partyId: m.supplier!.id, date: '2026-09-20', dueDate: '2026-10-02', currency: 'INR', supplierDocNumber: 'S/1', lines: [{ name: 'Rod', quantity: 1, unit: 'NOS', unitPrice: { minor: 300_000, currency: 'INR' }, taxCategoryId: m.gst(18) }], status: 'issued' },
      { token: m.token },
    );
    await t.put(`${m.c}/documents/${inv.id}/recurrence`, { recurrence: 'monthly' }, { token: m.token, headers: { 'if-match': `"v${inv.version}"` } });

    const res = await t.get(`${m.c}/cash-forecast`, { token: m.token, query: { weeks: 6 } });
    expect(res.status).toBe(200);
    expect(res.body.openingCash).toBe(1_000_000);
    expect(res.body.weeks).toHaveLength(6);
    const all = res.body.weeks.flatMap((w: { flows: { label: string; kind: string; date: string }[] }) => w.flows);
    expect(all.find((f: { kind: string }) => f.kind === 'payable')).toMatchObject({ label: bill.body.number, date: '2026-10-02' });
    expect(all.filter((f: { kind: string }) => f.kind === 'receivable').map((f: { date: string }) => f.date)).toEqual(['2026-10-10']);
    // The next copy of the recurring invoice, on the 29th.
    expect(all.filter((f: { kind: string }) => f.kind === 'recurringInvoice').map((f: { date: string }) => f.date)).toEqual(['2026-10-29']);
    const last = res.body.weeks.at(-1);
    expect(last.closing).toBe(1_000_000 + 2 * inv.totals.grandTotal.minor - bill.body.totals.grandTotal.minor);
  });
});
