import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { schema } from '@esmart/db';
import type { TestContext } from './helpers';
import { invoiceBody, issueInvoice, line, type Money } from './money-fixtures';

export const INR = (minor: number) => ({ minor, currency: 'INR' });

/**
 * A known month of books:
 * - invoice A (Mumbai, intra-state) 10 Sep: 2 rods × 1,000 + 18% = 2,360
 * - invoice B (Bengaluru, IGST) 15 Aug, due 14 Sep: 1 rod = 1,180
 * - a draft invoice, which no report counts
 * - purchase bill 5 Sep: 5 rods × 550 + 18% = 3,245
 * - expense 12 Sep: 118 including 18% tax
 * - 1,000 received against invoice A, in cash
 * The rod costs 600 (its purchase price).
 */
export async function books(t: TestContext, m: Money) {
  t.setNow('2026-09-29T10:00:00Z');
  // Invoice B sells a rod before the bill that brings any in.
  await m.allowNegativeStock();
  const rod = await m.item();
  const a = await issueInvoice(t, m, { date: '2026-09-10', lines: [line(m.gst(18), { itemId: rod })] });
  const b = await issueInvoice(t, m, { partyId: m.bengaluru.id, date: '2026-08-15', lines: [line(m.gst(18), { itemId: rod, quantity: 1 })] });
  const draft = await t.post(`${m.c}/documents`, invoiceBody(m, { date: '2026-09-11', lines: [line(m.gst(18), { itemId: rod, quantity: 50 })] }), { token: m.token });
  const bill = await t.post(
    `${m.c}/documents`,
    invoiceBody(m, { kind: 'purchaseBill', partyId: m.supplier!.id, supplierDocNumber: 'KS-9', status: 'issued', date: '2026-09-05', lines: [line(m.gst(18), { itemId: rod, quantity: 5, unitPrice: INR(55000) })] }),
    { token: m.token },
  );
  expect(bill.status).toBe(201);
  const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
  const exp = await t.post(`${m.c}/expenses`, { categoryId: cat.id, date: '2026-09-12', amount: INR(11800), currency: 'INR', taxCategoryId: m.gst(18), accountId: m.cash.id, method: 'cash' }, { token: m.token });
  expect(exp.status).toBe(201);
  const pay = await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-20', amount: INR(100000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: a.id, amount: INR(100000) }] }, { token: m.token });
  expect(pay.status).toBe(201);
  return { rod, a, b, draft: draft.body as { id: string }, bill: bill.body, category: cat, expense: exp.body, payment: pay.body };
}

