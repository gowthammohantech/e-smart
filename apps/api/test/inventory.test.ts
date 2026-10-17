import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { BENGALURU, setupApi } from './helpers';
import { invoiceBody, issueInvoice, line, moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();

async function secondBranch(m: Money) {
  const res = await t.post(`${m.c}/branches`, { name: 'Bengaluru depot', code: 'BLR', address: BENGALURU }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const adjust = (m: Money, itemId: string, quantity: number, over: Record<string, unknown> = {}) => ({
  branchId: m.branch.id,
  date: '2026-09-15',
  reason: 'damaged',
  lines: [{ itemId, quantity }],
  ...over,
});

type Level = { itemId: string; branchId: string; onHand: number; low: boolean; value: { minor: number } };

describe('inventory', () => {
  it('derives stock per branch from opening, receipt, invoice, adjustment and transfer', async () => {
    const m = await moneySetup(t);
    const rod = await m.item({ reorderLevel: '5' });
    const blr = await secondBranch(m);

    const opening = await t.post(`${m.c}/stock/adjustments`, { branchId: m.branch.id, date: '2026-09-01', type: 'opening', lines: [{ itemId: rod, quantity: 20, unitCost: { minor: 60000, currency: 'INR' } }] }, { token: m.token });
    expect(opening.status).toBe(201);
    expect(opening.body.data).toMatchObject([{ itemId: rod, type: 'opening', quantity: 20, unitCost: { minor: 60000, currency: 'INR' } }]);

    const bill = await t.post(
      `${m.c}/documents`,
      invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, supplierDocNumber: 'KS-1', status: 'issued', date: '2026-09-05', lines: [line(m.gst(18), { itemId: rod, quantity: 5, unitPrice: { minor: 55000, currency: 'INR' } })] }),
      { token: m.token },
    );
    expect(bill.status).toBe(201);
    await issueInvoice(t, m, { date: '2026-09-10', lines: [line(m.gst(18), { itemId: rod, quantity: 2 })] });

    const damaged = await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, -3), { token: m.token });
    expect(damaged.status).toBe(201);
    expect(damaged.body.data[0]).toMatchObject({ type: 'adjustment', quantity: -3 });
    const [row] = await t.deps.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.id, damaged.body.data[0].id));
    expect(row.adjustReason).toBe('damaged');

    // 20 + 5 - 2 - 3 = 20 at the primary branch; move 16 to Bengaluru.
    const moved = await t.post(`${m.c}/stock/transfers`, { itemId: rod, fromBranchId: m.branch.id, toBranchId: blr, quantity: 16, date: '2026-09-20' }, { token: m.token });
    expect(moved.status).toBe(201);
    expect(moved.body.data).toMatchObject([
      { type: 'transferOut', branchId: m.branch.id, quantity: -16 },
      { type: 'transferIn', branchId: blr, quantity: 16 },
    ]);
    expect(moved.body.data[0].referenceId).toBe(moved.body.data[1].referenceId);

    const levels = await t.get(`${m.c}/stock/levels`, { token: m.token });
    const at = (b: string) => levels.body.data.find((l: Level) => l.itemId === rod && l.branchId === b);
    // Weighted average cost of what came in at the primary: (20×600 + 5×550) / 25 = 590.
    expect(at(m.branch.id)).toEqual({ itemId: rod, branchId: m.branch.id, onHand: 4, reorderLevel: 5, low: true, value: { minor: 236000, currency: 'INR' } });
    expect(at(blr)).toEqual({ itemId: rod, branchId: blr, onHand: 16, reorderLevel: 5, low: false, value: { minor: 944000, currency: 'INR' } });

    const low = await t.get(`${m.c}/stock/levels`, { token: m.token, query: { lowStock: true } });
    expect(low.body.data.map((l: Level) => l.branchId)).toEqual([m.branch.id]);
    const blrOnly = await t.get(`${m.c}/stock/levels`, { token: m.token, query: { branchId: blr, itemId: rod } });
    expect(blrOnly.body.data.map((l: Level) => l.onHand)).toEqual([16]);

    // The catalog agrees on the company-wide total.
    expect((await t.get(`${m.c}/items/${rod}`, { token: m.token })).body.stockOnHand).toBe(20);

    // The transfer took the primary branch under its reorder level: one lowStock notification.
    const notes = await t.deps.db.select().from(schema.notifications).where(and(eq(schema.notifications.companyId, m.companyId), eq(schema.notifications.kind, 'lowStock')));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ entityType: 'item', entityId: rod });
    expect(notes[0].body).toContain('down to 4');

    // A further drop while already low does not nag again.
    await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, -1, { reason: 'lost' }), { token: m.token });
    expect(await t.deps.db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'lowStock'))).toHaveLength(1);

    const all = await t.get(`${m.c}/stock/movements`, { token: m.token, query: { itemId: rod } });
    expect(all.body.data.map((x: { type: string }) => x.type).sort()).toEqual(['adjustment', 'adjustment', 'opening', 'purchaseReceipt', 'salesIssue', 'transferIn', 'transferOut'].sort());
    expect((await t.get(`${m.c}/stock/movements`, { token: m.token, query: { type: 'transferOut' } })).body.data).toHaveLength(1);
    expect((await t.get(`${m.c}/stock/movements`, { token: m.token, query: { referenceId: moved.body.data[0].referenceId } })).body.data).toHaveLength(2);
    expect((await t.get(`${m.c}/stock/movements`, { token: m.token, query: { branchId: blr } })).body.data).toHaveLength(1);
    expect((await t.get(`${m.c}/stock/movements`, { token: m.token, query: { from: '2026-09-15', to: '2026-09-15' } })).body.data).toHaveLength(2);
    const page = await t.get(`${m.c}/stock/movements`, { token: m.token, query: { limit: 4 } });
    const rest = await t.get(`${m.c}/stock/movements`, { token: m.token, query: { limit: 4, cursor: page.body.nextCursor } });
    expect([...page.body.data, ...rest.body.data].map((x: { id: string }) => x.id).sort()).toEqual(all.body.data.map((x: { id: string }) => x.id).sort());
    expect(rest.body.nextCursor).toBeNull();
  });

  it('refuses to take stock below zero, and bad items or branches', async () => {
    const m = await moneySetup(t);
    const rod = await m.item();
    const service = await m.item({ name: 'Installation', type: 'service', trackInventory: false });
    const blr = await secondBranch(m);
    await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, 3, { reason: 'found' }), { token: m.token });

    const over = await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, -4), { token: m.token });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('INSUFFICIENT_STOCK');
    // Two lines that together overdraw are refused as a whole.
    const split = await t.post(`${m.c}/stock/adjustments`, { ...adjust(m, rod, -2), lines: [{ itemId: rod, quantity: -2 }, { itemId: rod, quantity: -2 }] }, { token: m.token });
    expect(split.body.code).toBe('INSUFFICIENT_STOCK');

    const tooMuch = await t.post(`${m.c}/stock/transfers`, { itemId: rod, fromBranchId: m.branch.id, toBranchId: blr, quantity: 5, date: '2026-09-20' }, { token: m.token });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('INSUFFICIENT_STOCK');
    const same = await t.post(`${m.c}/stock/transfers`, { itemId: rod, fromBranchId: m.branch.id, toBranchId: m.branch.id, quantity: 1, date: '2026-09-20' }, { token: m.token });
    expect(same.status).toBe(422);

    const untracked = await t.post(`${m.c}/stock/adjustments`, adjust(m, service, 1), { token: m.token });
    expect(untracked.status).toBe(422);
    expect(untracked.body.issues[0].field).toBe('lines[0].itemId');
    const negativeOpening = await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, -1, { type: 'opening' }), { token: m.token });
    expect(negativeOpening.status).toBe(422);

    const other = await moneySetup(t);
    const foreign = await other.item();
    expect((await t.post(`${m.c}/stock/adjustments`, adjust(m, foreign, 1), { token: m.token })).status).toBe(422);
    expect((await t.post(`${m.c}/stock/adjustments`, adjust(m, rod, 1, { branchId: other.branch.id }), { token: m.token })).status).toBe(422);
    expect((await t.get(`${other.c}/stock/levels`, { token: other.token, query: { itemId: rod } })).body.data).toEqual([]);

    // Nothing was written by the refusals.
    const levels = await t.get(`${m.c}/stock/levels`, { token: m.token, query: { itemId: rod, branchId: m.branch.id } });
    expect(levels.body.data[0].onHand).toBe(3);
  });

  it('is gated by plan and role', async () => {
    const basic = await moneySetup(t, 'basic');
    const rod = await basic.item();
    const levels = await t.get(`${basic.c}/stock/levels`, { token: basic.token });
    expect(levels.status).toBe(403);
    expect(levels.body.code).toBe('PLAN_UPGRADE_REQUIRED');
    const transfer = await t.post(`${basic.c}/stock/transfers`, { itemId: rod, fromBranchId: basic.branch.id, toBranchId: basic.branch.id, quantity: 1, date: '2026-09-20' }, { token: basic.token });
    expect(transfer.status).toBe(403);

    const m = await moneySetup(t);
    const item = await m.item();
    const sales = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    expect((await t.post(`${m.c}/stock/adjustments`, adjust(m, item, 1), { token: sales.token })).status).toBe(403);
    expect((await t.get(`${m.c}/stock/levels`, { token: sales.token })).status).toBe(200);
  });
});
