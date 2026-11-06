import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { schema } from '@esmart/db';
import { MUMBAI, ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';
import { line, moneySetup } from './money-fixtures';

const t = setupApi();

/** Reads an export back through its signed URL, as a client would. */
async function download(url: string): Promise<Buffer> {
  const u = new URL(url);
  const res = await t.app.inject({ method: 'GET', url: `${u.pathname}${u.search}` });
  expect(res.statusCode).toBe(200);
  return res.rawPayload;
}

/** An owner with a customer and one finalised invoice (written directly: 1,000 + 18% GST). */
/** Asks for an export, runs the background job that builds it, and returns the finished job. */
async function exported(c: string, token: string, body: Record<string, unknown>) {
  const res = await t.post(`${c}/exports`, body, { token });
  expect(res.status).toBe(202);
  expect(res.body.status).toBe('queued');
  await t.runJobs();
  return (await t.get(`${c}/exports/${res.body.id}`, { token })).body;
}

async function withInvoice() {
  const o = await ownerWithCompany(t);
  const party = await t.post(`${o.c}/parties`, { kind: 'customer', name: 'Sunrise & Co', currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 0 }, { token: o.token });
  const db = t.deps.db;
  const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.companyId, o.company.id!));
  const [tax] = (await db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, o.company.id!))).filter((x) => Number(x.rate) === 18);
  const doc = { companyId: o.company.id!, branchId: branch.id, kind: 'invoice' as const, partyId: party.body.id, currency: 'INR', createdBy: o.user.id!, taxableAmountMinor: 100000, totalTaxMinor: 18000, grandTotalMinor: 118000, subtotalMinor: 100000 };
  await db.insert(schema.documents).values([
    { ...doc, id: 'doc_1', number: 'INV/26-27/0001', status: 'issued', date: '2026-09-01' },
    { ...doc, id: 'doc_draft', number: 'INV-DRAFT', status: 'draft', date: '2026-09-02' },
  ]);
  await db.insert(schema.documentLines).values({ id: 'dl_1', documentId: 'doc_1', position: 1, name: 'Steel rod', quantity: '10', unit: 'NOS', unitPriceMinor: 10000, taxCategoryId: tax.id, taxRate: '18', lineTotalMinor: 100000 });
  await db.insert(schema.documentTaxLines).values({ id: 'dtl_1', documentId: 'doc_1', taxCategoryId: tax.id, categoryName: 'GST 18%', rate: '18', taxableAmountMinor: 100000, totalTaxMinor: 18000 });
  await db.insert(schema.documentTaxComponents).values([
    { id: 'dtc_1', taxLineId: 'dtl_1', type: 'CGST', label: 'CGST 9%', rate: '9', amountMinor: 9000 },
    { id: 'dtc_2', taxLineId: 'dtl_1', type: 'SGST', label: 'SGST 9%', rate: '9', amountMinor: 9000 },
  ]);
  return o;
}

describe('exports', () => {
  it('builds a JSON backup of every company table, and records the backup time', async () => {
    const { token, c, company } = await withInvoice();
    t.setNow('2026-09-20T08:00:00Z');
    const job = await exported(c, token, { format: 'json-backup' });
    expect(job).toMatchObject({ format: 'json-backup', status: 'completed' });
    const backup = JSON.parse((await download(job.downloadUrl)).toString('utf8'));
    expect(backup.company.id).toBe(company.id);
    expect(backup.tables.parties).toHaveLength(1);
    expect(backup.tables.documents.map((d: { id: string }) => d.id).sort()).toEqual(['doc_1', 'doc_draft']);
    // Child tables come along through their parents; secrets and other tenants don't.
    expect(backup.tables.document_lines).toHaveLength(1);
    expect(backup.tables.document_tax_components).toHaveLength(2);
    expect(backup.tables.compliance_credentials).toBeUndefined();
    expect(backup.tables.users).toBeUndefined();

    expect((await t.get(`${c}/exports`, { token })).body.data).toHaveLength(1);
    // When the backup was made, which is when the job ran.
    expect(new Date((await t.get(`${c}/backup-settings`, { token })).body.lastBackupAt).getTime()).toBeGreaterThan(new Date('2026-09-20T08:00:00Z').getTime());
  });

  it('zips one CSV per main table', async () => {
    const { token, c } = await withInvoice();
    const job = await exported(c, token, { format: 'csv-zip', from: '2026-09-01', to: '2026-09-01' });
    const files = unzipSync(new Uint8Array(await download(job.downloadUrl)));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['parties.csv', 'documents.csv', 'document_lines.csv', 'payments.csv']));
    const docs = strFromU8(files['documents.csv']).trim().split('\r\n');
    // Header plus the one document dated in range.
    expect(docs).toHaveLength(2);
    expect(strFromU8(files['parties.csv'])).toContain('Sunrise & Co');
  });

  it('writes Tally vouchers for finalised invoices only, balanced', async () => {
    const { token, c } = await withInvoice();
    const job = await exported(c, token, { format: 'tally-xml' });
    const xml = (await download(job.downloadUrl)).toString('utf8');
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create" REMOTEID="doc_1">');
    expect(xml).not.toContain('INV-DRAFT');
    expect(xml).toContain('<PARTYLEDGERNAME>Sunrise &amp; Co</PARTYLEDGERNAME>');
    expect(xml).toContain('<DATE>20260901</DATE>');
    const amounts = [...xml.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
    expect(amounts).toEqual([-1180, 1000, 90, 90]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });

  it('writes the whole book for Tally: ledgers under Tally\'s groups, and every voucher balanced', async () => {
    const m = await moneySetup(t);
    const inr = (minor: number) => ({ minor, currency: 'INR' });
    await t.deps.db.update(schema.parties).set({ openingBalanceMinor: 50_000 }).where(eq(schema.parties.id, m.mumbai.id));
    const inv = await t.post(`${m.c}/documents`, { kind: 'invoice', partyId: m.bengaluru.id, date: '2026-09-29', currency: 'INR', lines: [line(m.gst(18))], status: 'issued' }, { token: m.token });
    await t.post(`${m.c}/payments`, { direction: 'received', partyId: m.bengaluru.id, date: '2026-09-29', amount: inr(100_000), currency: 'INR', method: 'cash', accountId: m.cash.id, allocations: [{ documentId: inv.body.id, amount: inr(100_000) }] }, { token: m.token });
    await t.post(`${m.c}/vouchers`, { kind: 'journal', date: '2026-09-29', lines: [{ account: 'sys:roundOff', debit: inr(500), credit: inr(0) }, { account: 'sys:capital', debit: inr(0), credit: inr(500) }] }, { token: m.token });
    const job = await exported(m.c, m.token, { format: 'tally-xml' });
    const xml = (await download(job.downloadUrl)).toString('utf8');

    expect(xml).toContain('<LEDGER NAME="Anand Enterprises" ACTION="Create"><NAME.LIST><NAME>Anand Enterprises</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT><PARTYGSTIN>29AABCG4321K1ZM</PARTYGSTIN>');
    expect(xml).toMatch(/<LEDGER NAME="Output IGST"[^]*?<PARENT>Duties &amp; Taxes<\/PARENT>/);
    // Sunrise Retail owed ₹500 when the books began: a debit opening, negative in Tally.
    expect(xml).toMatch(/<LEDGER NAME="Sunrise Retail"[^]*?<OPENINGBALANCE>-500.00<\/OPENINGBALANCE>/);
    const vouchers = [...xml.matchAll(/<VOUCHER VCHTYPE="([^"]+)"[^]*?<\/VOUCHER>/g)];
    expect(vouchers.map((v) => v[1]).sort()).toEqual(['Journal', 'Receipt', 'Sales']);
    for (const [v] of vouchers) {
      const amounts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((x) => Number(x[1]));
      expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
    }
  });

  it('marks the export failed once its last try fails, so the app stops waiting', async () => {
    const { token, c } = await withInvoice();
    const put = vi.spyOn(t.deps.providers.storage, 'put').mockRejectedValue(new Error('storage down'));
    const res = await t.post(`${c}/exports`, { format: 'csv-zip' }, { token });
    for (let i = 0; i < 3; i++) {
      await t.runJobs();
      // The retry waits a while: move the clock past it.
      t.setNow(new Date(t.deps.now().getTime() + 2 * 3_600_000));
    }
    put.mockRestore();
    expect((await t.get(`${c}/exports/${res.body.id}`, { token })).body.status).toBe('failed');
  });

  it('keeps other companies out and needs owner or admin to export', async () => {
    const { token, c, company } = await withInvoice();
    const res = await t.post(`${c}/exports`, { format: 'json-backup' }, { token });
    const other = await ownerWithCompany(t);
    expect((await t.get(`${other.c}/exports/${res.body.id}`, { token: other.token })).status).toBe(404);
    const acct = await joinTeam(t, token, { role: 'accountant', companyIds: [company.id!] });
    expect((await t.post(`${c}/exports`, { format: 'csv-zip' }, { token: acct.token })).status).toBe(403);
  });

  it('saves backup settings, and Drive needs the integration', async () => {
    const { token, c } = await ownerWithCompany(t, { plan: 'business' });
    const initial = await t.get(`${c}/backup-settings`, { token });
    expect(initial.body).toEqual({ automatic: false, frequency: 'daily', destination: 'elixir-cloud' });
    const saved = await t.put(`${c}/backup-settings`, { automatic: true, frequency: 'weekly' }, { token });
    expect(saved.body).toMatchObject({ automatic: true, frequency: 'weekly', destination: 'elixir-cloud' });

    const drive = await t.put(`${c}/backup-settings`, { destination: 'google-drive' }, { token });
    expect(drive.status).toBe(422);
    expect(drive.body.code).toBe('INTEGRATION_NOT_CONNECTED');
    await t.post(`${c}/integrations/int_drive/connect`, { config: { refreshToken: 'rt_x' } }, { token });
    expect((await t.put(`${c}/backup-settings`, { destination: 'google-drive' }, { token })).body.destination).toBe('google-drive');
  });
});
