import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();

describe('approvals', () => {
  it('holds an invoice over the limit for an owner or admin, who approves it into an issued invoice', async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    // Invoices over ₹1,000 wait.
    const rules = await t.put(`${m.c}`, { ...company.body, approvalRules: [{ kind: 'invoice', overMinor: 100_000 }] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
    expect(rules.body.approvalRules).toEqual([{ kind: 'invoice', overMinor: 100_000 }]);
    const clerk = await joinTeam(t, m.token, { role: 'accountant', companyIds: [m.companyId] });

    // Under the limit: issued at once.
    const small = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued', lines: [{ name: 'Pen', quantity: 1, unit: 'NOS', unitPrice: { minor: 50_000, currency: 'INR' }, taxCategoryId: m.gst(18) }] }), { token: clerk.token });
    expect(small.body.status).toBe('issued');

    // Over it: kept as a draft, waiting.
    const big = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued' }), { token: clerk.token });
    expect(big.status).toBe(201);
    expect(big.body.status).toBe('draft');
    expect(big.body.approval).toMatchObject({ status: 'pending', requestedBy: clerk.user.id });
    const queue = await t.get(`${m.c}/approvals`, { token: m.token });
    expect(queue.body.data.map((d: { id: string }) => d.id)).toEqual([big.body.id]);

    // The clerk can't approve their own; the owner can, and that issues it.
    expect((await t.post(`${m.c}/documents/${big.body.id}/approve`, {}, { token: clerk.token })).status).toBe(403);
    const approved = await t.post(`${m.c}/documents/${big.body.id}/approve`, {}, { token: m.token });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('issued');
    expect(approved.body.number).toMatch(/^INV\//);
    expect(approved.body.approval).toMatchObject({ status: 'approved', decidedBy: m.user.id });
    expect((await t.get(`${m.c}/approvals`, { token: m.token })).body.data).toEqual([]);
    expect((await t.post(`${m.c}/documents/${big.body.id}/approve`, {}, { token: m.token })).body.code).toBe('NOT_AWAITING_APPROVAL');
  });

  it('sends a rejected one back as a draft, and waits again when it is issued again', async () => {
    const m = await moneySetup(t);
    const company = await t.get(`${m.c}`, { token: m.token });
    await t.put(`${m.c}`, { ...company.body, approvalRules: [{ kind: 'invoice', overMinor: 0 }] }, { token: m.token, headers: { 'if-match': `"v${company.body.version}"` } });
    const clerk = await joinTeam(t, m.token, { role: 'sales', companyIds: [m.companyId] });
    const doc = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued' }), { token: clerk.token });
    const rejected = await t.post(`${m.c}/documents/${doc.body.id}/reject`, { note: 'Wrong rate' }, { token: m.token });
    expect(rejected.body).toMatchObject({ status: 'draft', approval: { status: 'rejected', note: 'Wrong rate' } });
    const again = await t.post(`${m.c}/documents/${doc.body.id}/finalize`, {}, { token: clerk.token });
    expect(again.body.document).toMatchObject({ status: 'draft', approval: { status: 'pending' } });
    // An owner issuing it never waits.
    const own = await t.post(`${m.c}/documents`, invoiceBody(m, { status: 'issued' }), { token: m.token });
    expect(own.body.status).toBe('issued');
  });

  it('lets only an owner set the rules', async () => {
    const m = await moneySetup(t);
    const admin = await joinTeam(t, m.token, { role: 'admin', companyIds: [m.companyId] });
    const company = await t.get(`${m.c}`, { token: admin.token });
    const res = await t.put(`${m.c}`, { ...company.body, approvalRules: [{ kind: 'invoice', overMinor: 1 }] }, { token: admin.token, headers: { 'if-match': `"v${company.body.version}"` } });
    expect(res.body.code).toBe('OWNER_ONLY');
  });
});
