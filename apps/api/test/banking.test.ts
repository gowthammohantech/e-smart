import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { readStatement } from '@esmart/core/domain/bankStatement';
import { schema } from '@esmart/db';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();
beforeEach(() => t.setNow('2026-09-29T10:00:00Z'));

const inr = (minor: number) => ({ minor, currency: 'INR' });
const ln = (date: string, description: string, minor: number, over: Record<string, unknown> = {}) => ({ date, description, amount: inr(minor), ...over });

async function bank(m: Money, opening = 1_000_000, name = 'HDFC current') {
  const res = await t.post(`${m.c}/payment-accounts`, { name, type: 'bank', currency: 'INR', openingBalance: inr(opening) }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function pay(m: Money, accountId: string, minor: number, over: Record<string, unknown> = {}) {
  const res = await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.mumbai.id, date: '2026-09-28', amount: inr(minor), currency: 'INR', method: 'bank', accountId, ...over }, { token: m.token });
  expect(res.status).toBe(201);
  return res.body as { id: string; number: string };
}

async function importLines(m: Money, accountId: string, lines: unknown[], over: Record<string, unknown> = {}) {
  return t.post(`${m.c}/payment-accounts/${accountId}/bank-statements`, { fileName: 'statement.csv', lines, ...over }, { token: m.token });
}

async function lines(m: Money, accountId: string, query: Record<string, string> = {}) {
  const res = await t.get(`${m.c}/payment-accounts/${accountId}/bank-lines`, { token: m.token, query });
  expect(res.status).toBe(200);
  return res.body.data as any[];
}

const toBase64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

describe('banking: reading files', () => {
  it('reads the first sheet of an xlsx, dates as dd/mm/yyyy and numbers plain', async () => {
    const m = await moneySetup(t);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Statement');
    ws.addRow(['HDFC BANK Ltd.']);
    ws.addRow(['Account No', '50100012345678']);
    ws.addRow([]);
    ws.addRow(['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
    ws.addRow([new Date(Date.UTC(2026, 8, 1)), 'NEFT CR-SUNRISE RETAIL', 'N244260001', new Date(Date.UTC(2026, 8, 1)), null, 11800, 1011800]);
    ws.addRow([new Date(Date.UTC(2026, 8, 3)), 'CHQ PAID 000123', '000123', new Date(Date.UTC(2026, 8, 3)), 500.5, null, { formula: 'G5-E6', result: 1011299.5 }]);
    wb.addWorksheet('Other').addRow(['ignored']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await t.post(`${m.c}/bank-statements/parse`, { fileName: 'Acct_Statement.xlsx', contentBase64: buf.toString('base64') }, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toEqual(['HDFC BANK Ltd.']);
    expect(res.body.rows[4]).toEqual(['01/09/2026', 'NEFT CR-SUNRISE RETAIL', 'N244260001', '01/09/2026', '', '11800', '1011800']);
    expect(res.body.rows[5]).toEqual(['03/09/2026', 'CHQ PAID 000123', '000123', '03/09/2026', '500.5', '', '1011299.5']);
    const read = readStatement(res.body.rows);
    expect(read.headerRow).toBe(3);
    expect(read.lines.map((l) => [l.date, l.amountMinor, l.balanceMinor])).toEqual([
      ['2026-09-01', 1180000, 101180000],
      ['2026-09-03', -50050, 101129950],
    ]);
  });

  it('reads a CSV with a BOM, and refuses an old .xls', async () => {
    const m = await moneySetup(t);
    const csv = '﻿State Bank of India\r\nTxn Date,Description,Debit,Credit,Balance\r\n"01/09/2026","UPI/123, SUNRISE",,"1,180.00","1,01,180.00"\r\n';
    const res = await t.post(`${m.c}/bank-statements/parse`, { fileName: 'sbi.csv', contentBase64: toBase64(csv) }, { token: m.token });
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([['State Bank of India'], ['Txn Date', 'Description', 'Debit', 'Credit', 'Balance'], ['01/09/2026', 'UPI/123, SUNRISE', '', '1,180.00', '1,01,180.00']]);

    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)]);
    const xls = await t.post(`${m.c}/bank-statements/parse`, { fileName: 'statement.xls', contentBase64: ole.toString('base64') }, { token: m.token });
    expect(xls.status).toBe(422);
    expect(xls.body.code).toBe('UNSUPPORTED_FILE');
    expect(xls.body.detail).toMatch(/\.xlsx or \.csv/);
  });
});

describe('banking: import', () => {
  const csv = [
    'Vertex Traders',
    'Statement for 01/09/2026 to 30/09/2026',
    '',
    'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
    '10/09/2026,10/09/2026,NEFT SUNRISE RETAIL,,,"500.00","10,500.00"',
    '12/09/2026,12/09/2026,BANK CHARGES,,"59.00",,"10,441.00"',
    '13/09/2026,13/09/2026,INTEREST,,,"0.00","10,441.00"',
    ',,Total,,59.00,500.00,',
  ].join('\n');

  it('reads past the preamble, skips totals and zero rows, and dedupes a re-import', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const parsed = await t.post(`${m.c}/bank-statements/parse`, { fileName: 'sep.csv', contentBase64: toBase64(csv) }, { token: m.token });
    const read = readStatement(parsed.body.rows);
    expect(read.lines).toHaveLength(2);
    const body = read.lines.map((l) => ({ date: l.date, description: l.description, amount: inr(l.amountMinor), balance: inr(l.balanceMinor!) }));

    const dry = await importLines(m, acct, body, { dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ imported: 2, duplicates: 0, autoMatched: 0 });
    expect(dry.body.statement).toBeUndefined();
    expect(await t.deps.db.select().from(schema.bankStatementLines)).toHaveLength(0);

    const first = await importLines(m, acct, body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ imported: 2, duplicates: 0, statement: { from: '2026-09-10', to: '2026-09-12', openingBalance: inr(1_000_000), closingBalance: inr(1_044_100), lineCount: 2 } });

    const again = await importLines(m, acct, [...body, ln('2026-09-14', 'IMPS IN', 1000, { balance: inr(1_045_100) })]);
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ imported: 1, duplicates: 2 });
    expect(again.body.lines.map((l: { duplicate: boolean }) => l.duplicate)).toEqual([true, true, false]);
    expect(await lines(m, acct)).toHaveLength(3);

    const preview = await importLines(m, acct, body, { dryRun: true });
    expect(preview.body).toMatchObject({ imported: 0, duplicates: 2 });

    // Two identical lines with no balance are both real.
    const twins = await importLines(m, acct, [ln('2026-09-15', 'UPI TEA STALL', -2000), ln('2026-09-15', 'UPI TEA STALL', -2000)]);
    expect(twins.body).toMatchObject({ imported: 2, duplicates: 0 });
    const twinsAgain = await importLines(m, acct, [ln('2026-09-15', 'UPI TEA STALL', -2000), ln('2026-09-15', 'UPI TEA STALL', -2000)]);
    expect(twinsAgain.body).toMatchObject({ imported: 0, duplicates: 2 });

    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityType, 'bankStatement'));
    expect(audit.length).toBe(4);
  });

  it('refuses a cash account, another currency and a viewer', async () => {
    const m = await moneySetup(t);
    const cash = await importLines(m, m.cash.id, [ln('2026-09-10', 'x', 100)]);
    expect(cash.status).toBe(422);
    expect(cash.body.code).toBe('NOT_A_BANK_ACCOUNT');
    const acct = await bank(m);
    const usd = await importLines(m, acct, [{ date: '2026-09-10', description: 'x', amount: { minor: 100, currency: 'USD' } }]);
    expect(usd.status).toBe(422);
    expect(usd.body.code).toBe('CURRENCY_MISMATCH');
    const viewer = await joinTeam(t, m.token, { role: 'viewer', companyIds: [m.companyId] });
    const denied = await t.post(`${m.c}/payment-accounts/${acct}/bank-statements`, { fileName: 'x.csv', lines: [ln('2026-09-10', 'x', 100)] }, { token: viewer.token });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ROLE_FORBIDDEN');
    // A viewer can read.
    expect((await t.get(`${m.c}/payment-accounts/${acct}/bank-lines`, { token: viewer.token })).status).toBe(200);
  });
});

describe('banking: matching', () => {
  it('auto-matches by amount and date, and by UTR between two equal payments', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const solo = await pay(m, acct, 1_180_000, { date: '2026-09-27' });
    const utr = await pay(m, acct, 500_000, { reference: 'UTR998877665544' });
    const other = await pay(m, acct, 500_000);
    const res = await importLines(m, acct, [ln('2026-09-29', 'NEFT CR SUNRISE', 1_180_000), ln('2026-09-28', 'NEFT/UTR998877665544/SUNRISE RETAIL', 500_000)]);
    expect(res.body).toMatchObject({ imported: 2, autoMatched: 2 });
    const all = await lines(m, acct);
    expect(all.map((l) => [l.date, l.status, l.match?.id])).toEqual([
      ['2026-09-29', 'matched', solo.id],
      ['2026-09-28', 'matched', utr.id],
    ]);
    expect(all[0].match).toMatchObject({ type: 'payment', number: solo.number, amount: inr(1_180_000), partyName: 'Sunrise Retail' });
    // The other ₹5,000 is still free: a second line takes it.
    const next = await importLines(m, acct, [ln('2026-09-29', 'CASH DEP', 500_000)]);
    expect(next.body.autoMatched).toBe(1);
    expect((await lines(m, acct, { status: 'matched' })).map((l) => l.match.id)).toContain(other.id);
  });

  it('leaves equal lines unmatched, with suggestions; matches, unmatches, excludes and includes by hand', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const a = await pay(m, acct, 700_000);
    const b = await pay(m, acct, 700_000);
    const odd = await pay(m, acct, 123_400);
    await importLines(m, acct, [ln('2026-09-28', 'IMPS 1', 700_000), ln('2026-09-28', 'IMPS 2', 700_000)]);
    const waiting = await lines(m, acct, { status: 'unmatched' });
    expect(waiting).toHaveLength(2);
    for (const l of waiting) expect(l.suggestions.map((s: { id: string }) => s.id).sort()).toEqual([a.id, b.id].sort());
    const [l1, l2] = waiting;

    const wrong = await t.post(`${m.c}/bank-lines/${l1.id}/match`, { type: 'payment', id: odd.id }, { token: m.token });
    expect(wrong.status).toBe(422);
    expect(wrong.body.code).toBe('MATCH_AMOUNT_DIFFERS');

    const ok = await t.post(`${m.c}/bank-lines/${l1.id}/match`, { type: 'payment', id: a.id }, { token: m.token, headers: { 'if-match': `"v${l1.version}"` } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'matched', match: { id: a.id }, version: l1.version + 1 });
    const stale = await t.post(`${m.c}/bank-lines/${l1.id}/match`, { type: 'payment', id: a.id }, { token: m.token, headers: { 'if-match': `"v${l1.version}"` } });
    expect(stale.status).toBe(412);
    const taken = await t.post(`${m.c}/bank-lines/${l2.id}/match`, { type: 'payment', id: a.id }, { token: m.token });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('ALREADY_MATCHED');
    // The other line now suggests only what is left.
    const [left] = await lines(m, acct, { status: 'unmatched' });
    expect(left.suggestions.map((s: { id: string }) => s.id)).toEqual([b.id]);

    const undone = await t.del(`${m.c}/bank-lines/${l1.id}/match`, { token: m.token });
    expect(undone.status).toBe(200);
    expect(undone.body.status).toBe('unmatched');
    expect(undone.body.match).toBeUndefined();

    const out = await t.post(`${m.c}/bank-lines/${l2.id}/exclude`, { reason: 'Reversed next day' }, { token: m.token });
    expect(out.body).toMatchObject({ status: 'excluded', excludedReason: 'Reversed next day' });
    const summary = await t.get(`${m.c}/payment-accounts/${acct}/bank-lines/summary`, { token: m.token });
    expect(summary.body).toMatchObject({ unmatched: 1, matched: 0, excluded: 1, lastStatement: { fileName: 'statement.csv' } });
    const back = await t.post(`${m.c}/bank-lines/${l2.id}/include`, {}, { token: m.token });
    expect(back.body.status).toBe('unmatched');
    expect(back.body.excludedReason).toBeUndefined();

    const changes = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityType, 'bankStatementLine'));
    expect(changes.map((c) => c.action)).toEqual(['matched', 'unmatched', 'excluded', 'included']);
  });

  it('matches a contra voucher', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const v = await t.post(
      `${m.c}/vouchers`,
      { kind: 'contra', date: '2026-09-28', lines: [{ account: `pay:${m.cash.id}`, debit: inr(300_000), credit: inr(0) }, { account: `pay:${acct}`, debit: inr(0), credit: inr(300_000) }] },
      { token: m.token },
    );
    expect(v.status, v.raw).toBe(201);
    const res = await importLines(m, acct, [ln('2026-09-28', 'ATM WDL', -300_000)]);
    expect(res.body.autoMatched).toBe(1);
    expect((await lines(m, acct))[0].match).toMatchObject({ type: 'voucher', id: v.body.id, amount: inr(-300_000) });
  });

  it('records a payment from a credit and a debit line, and an expense from a debit line', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    await importLines(m, acct, [ln('2026-09-20', 'NEFT CR SUNRISE', 250_000, { reference: 'N123456' }), ln('2026-09-21', 'CHQ 000777 KONKAN STEEL', -80_000, { reference: '000777' }), ln('2026-09-22', 'ELECTRICITY BILL', -45_000)]);
    const [power, chq, credit] = await lines(m, acct);

    const received = await t.post(`${m.c}/bank-lines/${credit.id}/payment`, { partyId: m.mumbai.id }, { token: m.token });
    expect(received.status).toBe(201);
    expect(received.body.payment).toMatchObject({ direction: 'received', date: '2026-09-20', amount: inr(250_000), accountId: acct, method: 'bank', reference: 'N123456' });
    expect(received.body.line).toMatchObject({ status: 'matched', match: { type: 'payment', id: received.body.payment.id } });
    const again = await t.post(`${m.c}/bank-lines/${credit.id}/payment`, { partyId: m.mumbai.id }, { token: m.token });
    expect(again.status).toBe(409);

    const wrongKind = await t.post(`${m.c}/bank-lines/${chq.id}/payment`, { partyId: m.mumbai.id }, { token: m.token });
    expect(wrongKind.status).toBe(422);
    const paid = await t.post(`${m.c}/bank-lines/${chq.id}/payment`, { partyId: m.supplier!.id, method: 'cheque' }, { token: m.token });
    expect(paid.status).toBe(201);
    expect(paid.body.payment).toMatchObject({ direction: 'paid', amount: inr(80_000), partyId: m.supplier!.id, method: 'cheque', reference: '000777' });

    const [cat] = await t.deps.db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, m.companyId));
    const notOut = await t.post(`${m.c}/bank-lines/${credit.id}/expense`, { categoryId: cat.id }, { token: m.token });
    expect(notOut.status).toBe(422);
    expect(notOut.body.code).toBe('NOT_MONEY_OUT');
    const exp = await t.post(`${m.c}/bank-lines/${power.id}/expense`, { categoryId: cat.id, notes: 'September' }, { token: m.token });
    expect(exp.status).toBe(201);
    expect(exp.body.expense).toMatchObject({ date: '2026-09-22', amount: inr(45_000), accountId: acct, categoryId: cat.id, reference: 'ELECTRICITY BILL', notes: 'September' });
    expect(exp.body.line.match).toMatchObject({ type: 'expense', id: exp.body.expense.id, amount: inr(-45_000) });
    expect((await t.get(`${m.c}/payment-accounts/${acct}/bank-lines/summary`, { token: m.token })).body).toMatchObject({ matched: 3, unmatched: 0 });
  });

  it('records interest and drawings against a ledger account, as vouchers', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    await importLines(m, acct, [ln('2026-09-25', 'INTEREST CREDIT', 12_340), ln('2026-09-26', 'SELF TRANSFER TO OWNER', -50_000, { reference: 'IMPS88' })]);
    const [drawings, interest] = await lines(m, acct);
    const ledger = await t.post(`${m.c}/ledger-accounts`, { name: 'Interest received', group: 'indirectIncomes', openingBalance: inr(0) }, { token: m.token });
    expect(ledger.status).toBe(201);
    const key = `acc:${ledger.body.id}`;

    const rec = await t.post(`${m.c}/bank-lines/${interest.id}/voucher`, { account: key }, { token: m.token });
    expect(rec.status).toBe(201);
    expect(rec.body.voucher).toMatchObject({ kind: 'receipt', date: '2026-09-25', narration: 'INTEREST CREDIT', status: 'posted' });
    expect(rec.body.voucher.lines.map((l: any) => [l.account, l.debit.minor, l.credit.minor])).toEqual([[`pay:${acct}`, 12_340, 0], [key, 0, 12_340]]);
    expect(rec.body.line.match).toMatchObject({ type: 'voucher', id: rec.body.voucher.id, amount: inr(12_340) });
    expect((await t.post(`${m.c}/bank-lines/${interest.id}/voucher`, { account: key }, { token: m.token })).status).toBe(409);

    // Money out: a journal, the bank credited. A transfer to another bank account is a contra, not this.
    const contra = await t.post(`${m.c}/bank-lines/${drawings.id}/voucher`, { account: `pay:${m.cash.id}` }, { token: m.token });
    expect(contra.status).toBe(422);
    expect(contra.body.code).toBe('CONTRA_NOT_HERE');
    const unknown = await t.post(`${m.c}/bank-lines/${drawings.id}/voucher`, { account: 'acc:nope' }, { token: m.token });
    expect(unknown.status).toBe(422);
    const out = await t.post(`${m.c}/bank-lines/${drawings.id}/voucher`, { account: 'sys:capital', narration: 'Drawings' }, { token: m.token });
    expect(out.status).toBe(201);
    expect(out.body.voucher).toMatchObject({ kind: 'journal', narration: 'Drawings', reference: 'IMPS88' });
    expect(out.body.voucher.lines.map((l: any) => [l.account, l.debit.minor, l.credit.minor])).toEqual([[`pay:${acct}`, 0, 50_000], ['sys:capital', 50_000, 0]]);
    expect((await t.get(`${m.c}/payment-accounts/${acct}/bank-lines/summary`, { token: m.token })).body).toMatchObject({ matched: 2, unmatched: 0 });
  });

  it('finds payments, expenses and vouchers on the account, unmatched, the same amount first', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const other = await bank(m, 0, 'ICICI current');
    // More than the 3 days auto-matching allows before the lines, so all are left to Find.
    const near = await pay(m, acct, 70_000, { date: '2026-09-06', reference: 'UTR998877' });
    await pay(m, acct, 55_000, { date: '2026-09-07' });
    await pay(m, other, 70_000, { date: '2026-09-06' });
    const v = await t.post(`${m.c}/vouchers`, { kind: 'receipt', date: '2026-09-05', lines: [{ account: `pay:${acct}`, debit: inr(70_000), credit: inr(0) }, { account: 'sys:capital', debit: inr(0), credit: inr(70_000) }] }, { token: m.token });
    expect(v.status, v.raw).toBe(201);
    await importLines(m, acct, [ln('2026-09-22', 'NEFT CR', 70_000), ln('2026-09-23', 'NEFT CR', 70_000), ln('2026-09-29', 'NEFT CR', 90_000)]);
    const [, , first] = await lines(m, acct);
    const found = await t.get(`${m.c}/bank-lines/${first.id}/candidates`, { token: m.token });
    expect(found.status).toBe(200);
    // Both ₹700 records, nearest first, then the ₹550 one; nothing from the other account.
    expect(found.body.data.map((r: any) => [r.type, r.amount.minor])).toEqual([['payment', 70_000], ['voucher', 70_000], ['payment', 55_000]]);
    expect(found.body.data[0].id).toBe(near.id);
    const byRef = await t.get(`${m.c}/bank-lines/${first.id}/candidates`, { token: m.token, query: { q: 'utr998' } });
    expect(byRef.body.data.map((r: any) => r.id)).toEqual([near.id]);
    await t.post(`${m.c}/bank-lines/${first.id}/match`, { type: 'payment', id: near.id }, { token: m.token, headers: { 'if-match': `"v${first.version}"` } });
    const [, second] = await lines(m, acct, { status: 'unmatched' });
    const rest = await t.get(`${m.c}/bank-lines/${second.id}/candidates`, { token: m.token });
    expect(rest.body.data.some((r: any) => r.id === near.id)).toBe(false);
  });

  it('settles the customer’s invoices with a payment recorded from a line', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const inv = await issueInvoice(t, m, { partyId: m.mumbai.id });
    const due = inv.totals.grandTotal.minor;
    await importLines(m, acct, [ln('2026-09-29', 'NEFT CR MUMBAI', due + 10_000)]);
    const [line] = await lines(m, acct);
    const res = await t.post(`${m.c}/bank-lines/${line.id}/payment`, { partyId: m.mumbai.id, allocations: [{ documentId: inv.id, amount: inr(due) }] }, { token: m.token });
    expect(res.status, res.raw).toBe(201);
    expect(res.body.payment.allocations).toEqual([expect.objectContaining({ documentId: inv.id, amount: inr(due) })]);
    expect((await t.get(`${m.c}/documents/${inv.id}`, { token: m.token })).body.status).toBe('paid');
  });

  it('lists the imports with their counts, and undoes one, leaving the books as they were', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const p = await pay(m, acct, 99_900);
    await importLines(m, acct, [ln('2026-09-28', 'UPI IN', 99_900), ln('2026-09-28', 'CHARGES', -500)], { fileName: 'sept.csv' });
    await importLines(m, acct, [ln('2026-09-29', 'INTEREST', 1_200)], { fileName: 'late.csv' });
    const list = await t.get(`${m.c}/payment-accounts/${acct}/bank-statements`, { token: m.token });
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: any) => [s.fileName, s.lineCount, s.matched, s.unmatched])).toEqual([['late.csv', 1, 0, 1], ['sept.csv', 2, 1, 1]]);
    const sept = list.body.data[1];
    expect((await t.del(`${m.c}/bank-statements/${sept.id}`, { token: m.token })).status).toBe(204);
    expect((await lines(m, acct)).map((l) => l.description)).toEqual(['INTEREST']);
    expect((await t.get(`${m.c}/payments/${p.id}`, { token: m.token })).status).toBe(200);
    // Imported again, the payment is free to match once more.
    const again = await importLines(m, acct, [ln('2026-09-28', 'UPI IN', 99_900)], { fileName: 'sept.csv' });
    expect(again.body.autoMatched).toBe(1);
    expect((await t.del(`${m.c}/bank-statements/nope`, { token: m.token })).status).toBe(404);
  });

  it('puts a line back to unmatched when its payment is deleted', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m);
    const p = await pay(m, acct, 99_900);
    await importLines(m, acct, [ln('2026-09-28', 'UPI IN', 99_900)]);
    expect((await lines(m, acct))[0].status).toBe('matched');
    expect((await t.del(`${m.c}/payments/${p.id}`, { token: m.token })).status).toBe(204);
    const [line] = await lines(m, acct);
    expect(line.status).toBe('unmatched');
    expect(line.match).toBeUndefined();
    const [row] = await t.deps.db.select().from(schema.bankStatementLines);
    expect(row).toMatchObject({ status: 'unmatched', matchId: null });
  });
});

describe('banking: reconciliation', () => {
  it('ties the books to the statement when every difference is explained', async () => {
    const m = await moneySetup(t);
    const acct = await bank(m, 100_000);
    const cleared = await pay(m, acct, 50_000, { date: '2026-09-10' });
    const inTransit = await pay(m, acct, 20_000, { date: '2026-09-25' });
    const chequeOut = await pay(m, acct, 10_000, { date: '2026-09-26', direction: 'paid', partyId: m.supplier!.id, method: 'cheque', reference: '000555' });
    // A payment recorded after the day asked about, for a line the bank had before it.
    const late = await pay(m, acct, 3_000, { date: '2026-09-29' });
    await importLines(m, acct, [
      ln('2026-09-10', 'NEFT SUNRISE', 50_000, { balance: inr(150_000) }),
      ln('2026-09-20', 'BANK CHARGES', -500, { balance: inr(149_500) }),
      ln('2026-09-21', 'INTEREST', 1_200, { balance: inr(150_700) }),
      ln('2026-09-28', 'UPI SUNRISE', 3_000, { balance: inr(153_700) }),
    ]);
    const [lateLine] = await lines(m, acct, { from: '2026-09-28', to: '2026-09-28' });
    expect(lateLine.match?.id).toBe(late.id);

    const r = await t.get(`${m.c}/payment-accounts/${acct}/reconciliation`, { token: m.token, query: { asOf: '2026-09-28' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      asOf: '2026-09-28',
      since: '2026-09-10',
      bookBalance: inr(160_000),
      statementBalance: inr(153_700),
      statementBalanceDate: '2026-09-28',
      unclearedPayments: { depositsTotal: inr(20_000), paymentsTotal: inr(10_000) },
      unrecordedLines: { creditsTotal: inr(4_200), debitsTotal: inr(500) },
      adjustedBookBalance: inr(163_700),
      adjustedStatementBalance: inr(163_700),
      difference: inr(0),
    });
    expect(r.body.unclearedPayments.deposits.map((d: { id: string }) => d.id)).toEqual([inTransit.id]);
    expect(r.body.unclearedPayments.payments.map((d: { id: string; amount: unknown }) => [d.id, d.amount])).toEqual([[chequeOut.id, inr(-10_000)]]);
    expect(r.body.unrecordedLines.credits.map((l: { description: string }) => l.description)).toEqual(['INTEREST', 'UPI SUNRISE']);
    expect(r.body.unclearedPayments.deposits.map((d: { id: string }) => d.id)).not.toContain(cleared.id);

    // Today, the late payment is in the books too.
    const today = await t.get(`${m.c}/payment-accounts/${acct}/reconciliation`, { token: m.token });
    expect(today.body).toMatchObject({ asOf: '2026-09-29', bookBalance: inr(163_000), unrecordedLines: { creditsTotal: inr(1_200) }, difference: inr(0) });
  });
});
