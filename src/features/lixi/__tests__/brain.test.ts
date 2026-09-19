import { buildSeedData } from '@/data/buildSeedData';
import { buildOutstanding } from '@/domain/receivables';
import { zero } from '@/lib/money';
import { answer, greet, LixiContext } from '../brain';

/** Lixi answers from the books, so run it against the demo book. */
function contextFor(): LixiContext {
  const data = buildSeedData();
  const companyId = data.companies[0].id;
  const currency = data.companies[0].baseCurrency;
  const documents = data.documents.filter((d) => d.companyId === companyId);
  const payments = data.payments.filter((p) => p.companyId === companyId);
  const status = (s: string) => documents.filter((d) => d.compliance?.eInvoice?.status === s).length;
  return {
    currency,
    documents,
    payments,
    parties: data.parties.filter((p) => p.companyId === companyId),
    outstanding: buildOutstanding(documents.filter((d) => d.kind === 'invoice'), payments),
    compliance: { failed: status('failed'), registered: status('generated'), ewbExpiringToday: 0, ewbExpired: 0, ewbActive: 0 },
    monthTax: zero(currency),
    userName: 'Asha Rao',
  };
}

describe('Lixi', () => {
  const ctx = contextFor();

  it('greets by first name', () => {
    expect(greet(ctx).text).toMatch(/^Hi Asha, I'm Lixi\./);
  });

  it('opens a document named by its number', () => {
    const doc = ctx.documents.find((d) => d.kind === 'invoice')!;
    const reply = answer(`show me ${doc.number}`, ctx);
    expect(reply.actions).toEqual([{ type: 'document', label: `Open ${doc.number}`, kind: 'invoice', id: doc.id }]);
  });

  it('routes create requests to the right form', () => {
    expect(answer('Draft a new invoice', ctx).actions?.[0]).toMatchObject({ route: '/(app)/sales/invoices/new' });
    expect(answer('create a quote', ctx).actions?.[0]).toMatchObject({ route: '/(app)/sales/quotes/new' });
    expect(answer('add customer', ctx).actions?.[0]).toMatchObject({ route: '/(app)/contacts/customers/new' });
  });

  it('answers receivables with the numbers the receivables engine gives', () => {
    const reply = answer('Who owes me money?', ctx);
    const open = ctx.outstanding.filter((o) => o.outstanding.minor > 0).length;
    expect(reply.stats?.find((s) => s.label === 'Invoices')?.value).toBe(String(open));
  });

  it('reports rejected e-invoices when the IRP has refused one', () => {
    const reply = answer('Anything wrong with GST?', ctx);
    expect(reply.stats?.find((s) => s.label === 'Rejected')?.value).toBe(String(ctx.compliance.failed));
    if (ctx.compliance.failed) expect(reply.actions?.[0]).toMatchObject({ route: '/(app)/gst/e-invoices' });
  });

  it('knows a customer by name', () => {
    const party = ctx.parties[0];
    expect(answer(`how is ${party.name} doing`, ctx).actions?.[0]).toMatchObject({
      route: `/(app)/contacts/customers/${party.id}`,
    });
  });

  it('ranks top customers and says so when it cannot help', () => {
    expect(answer('Top customers', ctx).stats?.length).toBeGreaterThan(0);
    expect(answer('what is the weather', ctx).text).toMatch(/didn't catch/);
  });
});
