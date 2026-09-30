import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';
import { moneySetup } from './money-fixtures';

const t = setupApi();

let seq = 0;
async function rpc(companyId: string, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await t.app.inject({
    method: 'POST',
    url: `/v1/companies/${companyId}/mcp`,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

const callTool = async (companyId: string, token: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(companyId, token, 'tools/call', { name, arguments: args });
  expect(res.status).toBe(200);
  const result = res.body.result as { content: { text: string }[]; isError?: boolean };
  return { isError: !!result.isError, value: JSON.parse(result.content[0].text) };
};

describe('mcp', () => {
  it('initialises and lists the catalog with hints', async () => {
    const o = await ownerWithCompany(t);
    const init = await rpc(o.company.id!, o.token, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe('elixir-books-lixi');
    expect(init.body.result.instructions).toContain('Vertex Traders');

    const list = await rpc(o.company.id!, o.token, 'tools/list');
    const tools = list.body.result.tools as { name: string; annotations: Record<string, boolean>; inputSchema: { type: string } }[];
    const byName = new Map(tools.map((x) => [x.name, x]));
    expect(byName.get('get_dashboard')?.annotations.readOnlyHint).toBe(true);
    expect(byName.get('create_draft_document')?.annotations.readOnlyHint).toBe(false);
    expect(byName.get('confirm_action')?.annotations.destructiveHint).toBe(true);
    for (const x of tools) expect(x.inputSchema.type).toBe('object');
  });

  it('reads as the caller, and writes only through confirm_action', async () => {
    const m = await moneySetup(t);
    await m.item();

    const dashboard = await callTool(m.companyId, m.token, 'get_dashboard', { range: 'month' });
    expect(dashboard.isError).toBe(false);
    expect(dashboard.value.receivable).toEqual({ minor: 0, currency: 'INR' });

    const bad = await callTool(m.companyId, m.token, 'get_document', {});
    expect(bad).toMatchObject({ isError: true, value: { code: 'INVALID_TOOL_INPUT' } });

    const items = await callTool(m.companyId, m.token, 'list_items', { limit: 1 });
    const pending = await callTool(m.companyId, m.token, 'create_draft_document', {
      kind: 'quote',
      partyId: m.mumbai.id,
      lines: [{ itemId: items.value.data[0].id, quantity: 3 }],
    });
    expect(pending.value.summary).toContain('Draft quote for Sunrise Retail');
    const docs = () => t.deps.db.select().from(schema.documents).where(eq(schema.documents.companyId, m.companyId));
    expect(await docs()).toHaveLength(0);

    const done = await callTool(m.companyId, m.token, 'confirm_action', { token: pending.value.token });
    expect(done.value.result).toMatchObject({ entity: 'document', kind: 'quote' });
    expect(await docs()).toHaveLength(1);
  });

  it('reports plan gating as a tool error', async () => {
    const m = await moneySetup(t, 'basic');
    const res = await callTool(m.companyId, m.token, 'get_stock_levels');
    expect(res).toMatchObject({ isError: true, value: { status: 403, code: 'PLAN_UPGRADE_REQUIRED' } });
  });

  it('needs a signed-in user with access to the company', async () => {
    const o = await ownerWithCompany(t);
    const other = await ownerWithCompany(t);
    expect((await rpc(o.company.id!, null, 'tools/list')).status).toBe(401);
    const foreign = await rpc(other.company.id!, o.token, 'tools/list');
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('COMPANY_ACCESS_DENIED');

    const get = await t.app.inject({ method: 'GET', url: `/v1/companies/${o.company.id}/mcp`, headers: { authorization: `Bearer ${o.token}` } });
    expect(get.statusCode).toBe(405);
  });
});
