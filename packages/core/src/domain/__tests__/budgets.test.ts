import { budgetMonths, budgetVariance, budgetable, spreadEvenly, type Budget } from '../budgets';
import type { Book } from '../ledger/accounts';
import type { Posting } from '../ledger/postings';

const book: Book = { parties: [], paymentAccounts: [], expenseCategories: [{ id: 'rent', name: 'Rent' }], ledgerAccounts: [] };
const p = (date: string, account: string, debit: number, credit: number, extra: Partial<Posting> = {}): Posting => ({ date, account, debit, credit, source: { type: 'voucher', id: 'v', number: 'JV' }, ...extra });

describe('budgets', () => {
  it('spreads a year evenly to the paisa, and names the months of the year', () => {
    expect(spreadEvenly(1_000_00)).toEqual([8334, 8334, 8334, 8334, 8333, 8333, 8333, 8333, 8333, 8333, 8333, 8333]);
    expect(spreadEvenly(1_000_00).reduce((a, b) => a + b, 0)).toBe(1_000_00);
    expect(budgetMonths('2026-04-01')[0]).toBe('2026-04-01');
    expect(budgetMonths('2026-04-01')[11]).toBe('2027-03-01');
  });

  it('takes income and expense accounts only', () => {
    expect(budgetable('sys:sales', book)).toBe(true);
    expect(budgetable('exp:rent', book)).toBe(true);
    expect(budgetable('sys:capital', book)).toBe(false);
  });

  it('sets what was earned and spent against the plan, a part month in proportion', () => {
    const budget: Budget = { id: 'b', name: 'FY 26-27', yearFrom: '2026-04-01', lines: [{ account: 'sys:sales', months: Array(12).fill(1_000_000) }, { account: 'exp:rent', months: Array(12).fill(300_000) }] };
    const postings = [
      p('2026-04-10', 'sys:sales', 0, 1_200_000),
      p('2026-05-10', 'sys:sales', 0, 800_000),
      p('2026-05-15', 'sys:sales', 50_000, 0), // a credit note
      p('2026-04-01', 'exp:rent', 300_000, 0),
      p('2026-05-01', 'exp:rent', 350_000, 0),
      p('2026-06-01', 'exp:rent', 300_000, 0),
      p('2026-03-31', 'sys:sales', 0, 9_999_999), // before the year
    ];
    // April, May and half of June (15 of 30 days).
    const v = budgetVariance(budget, postings, book, { from: '2026-04-01', to: '2026-06-15' });
    const sales = v.rows.find((r) => r.account === 'sys:sales')!;
    expect(sales).toMatchObject({ nature: 'income', budget: 2_500_000, actual: 1_950_000, variance: -550_000, favourable: false });
    expect(sales.months.map((m) => m.month)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
    const rent = v.rows.find((r) => r.account === 'exp:rent')!;
    expect(rent).toMatchObject({ nature: 'expense', budget: 750_000, actual: 950_000, variance: 200_000, favourable: false });
    expect(v.profit).toEqual({ budget: 2_500_000 - 750_000, actual: 1_950_000 - 950_000 });
  });

  it('keeps to its branch or cost centre', () => {
    const budget: Budget = { id: 'b', name: 'Pune', yearFrom: '2026-04-01', branchId: 'pune', lines: [{ account: 'sys:sales', months: Array(12).fill(0) }] };
    const v = budgetVariance(budget, [p('2026-04-10', 'sys:sales', 0, 100, { branchId: 'pune' }), p('2026-04-10', 'sys:sales', 0, 900, { branchId: 'mumbai' })], book, { from: '2026-04-01', to: '2027-03-31' });
    expect(v.rows[0]).toMatchObject({ actual: 100, favourable: true });
  });
});
