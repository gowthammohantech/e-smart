import {
  PRIMARY_COMPANY_ID,
  seedBranches,
  seedCompanies,
  seedComplianceSettings,
  seedItems,
  seedNumberingSeries,
  seedParties,
  seedTaxCategories,
} from '@/data/seed';
import { seedCompliance, seedDocuments, seedExpenses, seedPayments } from '@/data/seedTransactions';
import { buildOutstanding, summarizeAging } from '@/domain/receivables';
import { zero } from '@/lib/money';
import { answer, greet, LixiContext, TAB_QUESTIONS } from '../brain';

/** Lixi answers from the books, so run it against the demo book, built the way the store builds it. */
function contextFor(): LixiContext {
  const companies = seedCompanies();
  const parties = seedParties();
  const items = seedItems();
  const series = seedNumberingSeries();
  const { documents: allDocs } = seedCompliance(
    seedDocuments({ items, parties, taxCategories: seedTaxCategories(), series }),
    companies,
    parties,
    seedBranches(),
    seedComplianceSettings(),
  );
  const allPayments = seedPayments(allDocs, series);

  const currency = companies.find((c) => c.id === PRIMARY_COMPANY_ID)!.baseCurrency;
  const mine = <T extends { companyId: string }>(rows: T[]) => rows.filter((r) => r.companyId === PRIMARY_COMPANY_ID);
  const documents = mine(allDocs);
  const payments = mine(allPayments);
  const book = (kind: 'invoice' | 'purchaseBill', direction: 'received' | 'paid') => {
    const outstanding = buildOutstanding(
      documents.filter((d) => d.kind === kind),
      payments.filter((p) => p.direction === direction),
    );
    return { outstanding, summary: summarizeAging(outstanding, currency) };
  };
  const status = (s: string) => documents.filter((d) => d.compliance?.eInvoiceStatus === s).length;

  return {
    currency,
    documents,
    payments,
    expenses: mine(seedExpenses(series)),
    parties: mine(parties),
    receivables: book('invoice', 'received'),
    payables: book('purchaseBill', 'paid'),
    lowStock: [{ name: 'A4 paper ream', onHand: 2, unit: 'box' }],
    compliance: {
      failed: status('failed'),
      generated: status('generated'),
      pending: status('pending'),
      ewbActive: 0,
      ewbExpiringSoon: 0,
      ewbExpired: 0,
      ewbMissing: 0,
    },
    monthTax: zero(currency),
    userName: 'Asha Rao',
  };
}

describe('Lixi', () => {
  const ctx = contextFor();

  it('greets by first name and flags low stock', () => {
    const text = greet(ctx).text;
    expect(text).toMatch(/^Hi Asha, I'm Lixi\./);
    expect(text).toContain('1 item low on stock');
  });

  it('opens a document named by its number', () => {
    const doc = ctx.documents.find((d) => d.kind === 'invoice' && d.number)!;
    const reply = answer(`show me ${doc.number}`, ctx);
    expect(reply.actions).toEqual([{ type: 'document', label: `Open ${doc.number}`, kind: 'invoice', id: doc.id }]);
  });

  it('routes create requests to the right form, and asks first', () => {
    expect(answer('Draft a new invoice', ctx).actions?.[0]).toMatchObject({ route: '/(app)/sales/invoices/new', confirm: expect.any(String) });
    expect(answer('create a quote', ctx).actions?.[0]).toMatchObject({ route: '/(app)/sales/quotes/new' });
    expect(answer('record an expense', ctx).actions?.[0]).toMatchObject({ route: '/(app)/expenses/new' });
    expect(answer('new purchase bill', ctx).actions?.[0]).toMatchObject({ route: '/(app)/purchases/bills/new' });
    expect(answer('add supplier', ctx).actions?.[0]).toMatchObject({ route: '/(app)/contacts/suppliers/new' });
  });

  it('tells what customers owe apart from what I owe suppliers', () => {
    const mine = answer('Who owes me money?', ctx);
    expect(mine.actions?.[0]).toMatchObject({ route: '/(app)/receivables' });
    const theirs = answer('What do I owe suppliers?', ctx);
    expect(theirs.actions?.[0]).toMatchObject({ route: '/(app)/payables' });
  });

  it('reports rejected e-invoices from the compliance counts', () => {
    const reply = answer('Anything wrong with GST?', ctx);
    expect(reply.stats?.find((s) => s.label === 'Rejected')?.value).toBe(String(ctx.compliance.failed));
  });

  it('knows customers and suppliers by name', () => {
    const customer = ctx.parties.find((p) => p.kind === 'customer')!;
    expect(answer(`how is ${customer.name} doing`, ctx).actions?.[0]).toMatchObject({
      route: `/(app)/contacts/customers/${customer.id}`,
    });
    const supplier = ctx.parties.find((p) => p.kind === 'supplier')!;
    expect(answer(`what about ${supplier.name}`, ctx).actions?.[0]).toMatchObject({
      route: `/(app)/contacts/suppliers/${supplier.id}`,
    });
  });

  it('answers stock and spending', () => {
    expect(answer('What is low on stock?', ctx).stats?.[0]).toMatchObject({ label: 'A4 paper ream', value: '2 box' });
    expect(answer('What did I spend last month?', ctx).actions?.[0]).toMatchObject({ route: '/(app)/reports/expense-summary' });
  });

  it('ranks top customers and says so when it cannot help', () => {
    expect(answer('Top customers', ctx).stats?.length).toBeGreaterThan(0);
    expect(answer('what is the weather', ctx).text).toMatch(/didn't catch/);
  });

  it('has a real answer for every tab you can hold', () => {
    Object.entries(TAB_QUESTIONS).forEach(([tab, question]) => {
      expect({ tab, text: answer(question, ctx).text }).not.toMatchObject({ text: expect.stringMatching(/didn't catch/) });
    });
  });
});
