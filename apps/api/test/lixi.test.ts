import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { toWire } from '../src/modules/lixi/handlers';
import { createCompany, setupApi } from './helpers';
import { moneySetup, type Money } from './money-fixtures';
import { joinTeam } from './team-helpers';

const t = setupApi();

const ask = (m: { c: string; token: string }, text: string, token = m.token) =>
  t.post(`${m.c}/lixi/messages`, { messages: [{ role: 'user', text }] }, { token });

const confirmAction = (c: string, token: string, actionToken: string) => t.post(`${c}/lixi/actions`, { token: actionToken }, { token });

const documents = (m: Money) => t.deps.db.select().from(schema.documents).where(eq(schema.documents.companyId, m.companyId));

describe('lixi chat', () => {
  it('answers from the books through the contract routes', async () => {
    const m = await moneySetup(t);
    const res = await ask(m, 'who owes me money?');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toContain('get_receivables');
    expect(res.body.pendingAction).toBeUndefined();
  });

  it('keeps to the plan: stock is an upsell on Basic', async () => {
    const basic = await moneySetup(t, 'basic');
    const res = await ask(basic, 'what is low on stock?');
    expect(res.status).toBe(200);
    expect(res.body.reply.text).toContain("isn't part of your plan");
    expect(res.body.reply.actions).toEqual([{ type: 'route', label: 'See plans', route: '/(app)/settings/plan' }]);

    const pro = await moneySetup(t, 'pro');
    const ok = await ask(pro, 'what is low on stock?');
    expect(ok.body.reply.text).toContain('get_stock_levels');
  });

  it('prepares a write without writing, and runs it once on confirmation', async () => {
    const m = await moneySetup(t);
    await m.item();
    t.setNow('2026-09-29T10:00:00Z');

    const res = await ask(m, 'make an invoice for sunrise retail');
    expect(res.status).toBe(200);
    const pending = res.body.pendingAction;
    expect(pending).toMatchObject({ tool: 'create_draft_document', expiresAt: '2026-09-29T10:05:00.000Z' });
    expect(pending.summary).toContain('Sunrise Retail');
    expect(pending.preview.grandTotal).toEqual({ minor: 118000, currency: 'INR' });
    expect(await documents(m)).toHaveLength(0);

    const done = await confirmAction(m.c, m.token, pending.token);
    expect(done.status).toBe(200);
    expect(done.body.result).toMatchObject({ entity: 'document', kind: 'invoice' });
    expect(done.body.reply.actions).toEqual([{ type: 'document', label: 'Open draft', id: done.body.result.id, kind: 'invoice' }]);
    const [doc] = await documents(m);
    expect(doc).toMatchObject({ id: done.body.result.id, status: 'draft', date: '2026-09-29' });

    // A double tap runs once.
    const again = await confirmAction(m.c, m.token, pending.token);
    expect(again.status).toBe(200);
    expect(again.body.result.id).toBe(done.body.result.id);
    expect(await documents(m)).toHaveLength(1);
  });

  it('binds the action to its user, company and a few minutes', async () => {
    const m = await moneySetup(t);
    await m.item();
    t.setNow('2026-09-29T10:00:00Z');
    const { body } = await ask(m, 'invoice for sunrise retail');
    const token: string = body.pendingAction.token;

    const colleague = await joinTeam(t, m.token, { role: 'owner', companyIds: [m.companyId] });
    const other = await confirmAction(m.c, colleague.token, token);
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('LIXI_ACTION_FORBIDDEN');

    const second = await createCompany(t, m.token, { name: 'Second Co' });
    const elsewhere = await confirmAction(`/companies/${second.id}`, m.token, token);
    expect(elsewhere.status).toBe(403);

    const [claims, sig] = token.split('.');
    const forged = JSON.parse(Buffer.from(claims, 'base64url').toString());
    forged.req.payload.lines[0].unitPrice.minor = 1;
    const tampered = await confirmAction(m.c, m.token, `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`);
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('LIXI_ACTION_INVALID');

    t.setNow('2026-09-29T10:05:01Z');
    const late = await confirmAction(m.c, m.token, token);
    expect(late.status).toBe(410);
    expect(late.body.code).toBe('LIXI_ACTION_EXPIRED');
    expect(await documents(m)).toHaveLength(0);
  });

  it('checks the role again at confirmation', async () => {
    const m = await moneySetup(t);
    await m.item();
    const viewer = await joinTeam(t, m.token, { role: 'viewer', companyIds: [m.companyId] });
    const { body } = await ask(m, 'invoice for sunrise retail', viewer.token);
    expect(body.pendingAction.tool).toBe('create_draft_document');

    const res = await confirmAction(m.c, viewer.token, body.pendingAction.token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
    expect(await documents(m)).toHaveLength(0);
  });

  it('needs the conversation to end with a question', async () => {
    const m = await moneySetup(t);
    const res = await t.post(`${m.c}/lixi/messages`, { messages: [{ role: 'assistant', text: 'Hello' }] }, { token: m.token });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LAST_MESSAGE_NOT_USER');
  });

  it('only passes on actions the app can follow and the plan can open', () => {
    const reply = toWire(
      {
        text: 'Hi',
        stats: [],
        actions: [
          { type: 'route', label: 'Evil', value: 'https://example.com', documentKind: '' },
          { type: 'route', label: 'Payables', value: '/(app)/payables', documentKind: '' },
          { type: 'route', label: 'Receivables', value: '/(app)/receivables', documentKind: '' },
          { type: 'document', label: 'INV-1', value: 'doc_1', documentKind: 'nope' },
          { type: 'ask', label: 'Top customers?', value: 'Who are my top customers?', documentKind: '' },
        ],
      },
      'basic',
    );
    expect(reply.actions).toEqual([
      { type: 'route', label: 'Receivables', route: '/(app)/receivables' },
      { type: 'ask', label: 'Top customers?', question: 'Who are my top customers?' },
    ]);
  });
});
