import { accumulatedDepreciation, assetEntries, assetSchedule, bookValue, depreciationEntries, type FixedAsset } from '../fixedAssets';
import { allPostings } from '../ledger/postings';
import { balanceSheet, profitAndLoss, trialBalance } from '../ledger/reports';
import type { Book } from '../ledger/accounts';
import type { Voucher } from '../../types';

const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'fa1',
  name: 'CNC lathe',
  category: 'Plant and machinery',
  account: 'sys:fixedAssets',
  acquiredOn: '2026-04-01',
  inUseFrom: '2026-04-01',
  costMinor: 12_000_000,
  residualMinor: 0,
  method: 'slm',
  lifeMonths: 60,
  openingDepreciationMinor: 0,
  ...over,
});
const total = (es: { amountMinor: number }[]) => es.reduce((a, e) => a + e.amountMinor, 0);
const fy = { from: '2026-04-01', to: '2027-03-31' };

describe('depreciation', () => {
  it('writes a straight-line asset off evenly by the day, at each month’s end, never past its life', () => {
    const a = asset();
    const year = depreciationEntries(a, '2027-03-31');
    expect(year).toHaveLength(12);
    expect(year[0]).toEqual({ date: '2026-04-30', amountMinor: Math.round((12_000_000 * 30) / 1826) });
    // 1 Apr 2026 to 1 Apr 2031 is 1,826 days; the year is 365 of them.
    expect(total(year)).toBe(Math.round((12_000_000 * 365) / 1826));
    expect(total(depreciationEntries(a, '2035-03-31'))).toBe(12_000_000);
    expect(depreciationEntries(a, '2035-03-31').at(-1)!.date).toBe('2031-03-31');
    expect(bookValue(a, '2031-12-31')).toBe(0);
  });

  it('keeps a residual value', () => {
    const a = asset({ residualMinor: 600_000 });
    expect(accumulatedDepreciation(a, '2040-01-01')).toBe(11_400_000);
    expect(bookValue(a, '2040-01-01')).toBe(600_000);
  });

  it('writes down value at a rate on what is left each year, from the day it was put to use', () => {
    const a = asset({ method: 'wdv', rate: 15, lifeMonths: undefined, costMinor: 10_000_000, acquiredOn: '2026-09-20', inUseFrom: '2026-10-01' });
    const first = depreciationEntries(a, '2027-03-31');
    expect(first[0].date).toBe('2026-10-31');
    // 182 of 365 days in FY 26-27 at 15%.
    expect(total(first)).toBe(747_945);
    const second = depreciationEntries(a, '2028-03-31').filter((e) => e.date > '2027-03-31');
    expect(total(second)).toBe(Math.round((10_000_000 - 747_945) * 0.15));
    expect(bookValue(a, '2028-03-31')).toBe(10_000_000 - 747_945 - total(second));
    // Never below the residual value.
    expect(bookValue({ ...a, residualMinor: 5_000_000 }, '2050-03-31')).toBe(5_000_000);
  });

  it('carries on from what was written off before the books began', () => {
    // Put to use 1 Apr 2024, two years (₹48,000) written off by 31 Mar 2026; three years left.
    const a = asset({ acquiredOn: '2024-04-01', inUseFrom: '2024-04-01', openingDepreciationMinor: 4_800_000, openingAsOf: '2026-03-31' });
    expect(accumulatedDepreciation(a, '2026-03-31')).toBe(4_800_000);
    expect(depreciationEntries(a, '2026-04-30')[0].date).toBe('2026-04-30');
    expect(accumulatedDepreciation(a, '2029-03-31')).toBe(12_000_000);
    expect(assetEntries(a, '2026-03-31')).toEqual([{ date: '2026-03-31', kind: 'opening', entries: [['sys:openingDifference', 4_800_000], ['sys:accumulatedDepreciation', -4_800_000]] }]);
  });

  it('stops on the day it is disposed of, and takes its cost and depreciation out of the books', () => {
    const a = asset({ disposedOn: '2027-09-15' });
    const es = depreciationEntries(a, '2030-03-31');
    expect(es.at(-1)).toMatchObject({ date: '2027-09-15' });
    const written = accumulatedDepreciation(a, '2027-09-15');
    const disposal = assetEntries(a, '2030-03-31').find((e) => e.kind === 'disposal')!;
    expect(disposal.entries).toEqual([['sys:accumulatedDepreciation', written], ['sys:fixedAssets', -12_000_000], ['sys:assetDisposal', 12_000_000 - written]]);
    expect(disposal.entries.reduce((s, [, v]) => s + v, 0)).toBe(0);
    expect(bookValue(a, '2027-09-15')).toBe(0);
  });
});

describe('fixed assets in the books', () => {
  const book: Book = { parties: [], paymentAccounts: [], expenseCategories: [], ledgerAccounts: [] };
  const stock = { items: [], movements: [], baseCurrency: 'INR' };
  // Bought for ₹1,20,000 with capital brought in.
  const bought: Voucher = {
    id: 'v1', companyId: 'c', branchId: 'b', kind: 'journal', number: 'JV/1', date: '2026-04-01', createdBy: 'u', createdAt: '',
    lines: [
      { account: 'sys:fixedAssets', debit: { minor: 12_000_000, currency: 'INR' }, credit: { minor: 0, currency: 'INR' } },
      { account: 'sys:capital', debit: { minor: 0, currency: 'INR' }, credit: { minor: 12_000_000, currency: 'INR' } },
    ],
  };
  const books = (list: FixedAsset[], until: string) =>
    allPostings({ baseCurrency: 'INR', branches: [], taxCategories: [], documents: [], payments: [], expenses: [], vouchers: [bought], parties: [], paymentAccounts: [], ledgerAccounts: [], openingStockMinor: 0, assets: { list, until } });

  it('charges depreciation to profit and nets it off fixed assets on the balance sheet', () => {
    const a = asset();
    const ps = books([a], '2027-03-31');
    const year = Math.round((12_000_000 * 365) / 1826);
    const pl = profitAndLoss(ps, book, fy, stock);
    expect(pl.indirect.expense.find((l) => l.account.key === 'sys:depreciation')?.amount).toBe(year);
    const bs = balanceSheet(ps, book, '2027-03-31', stock);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    const lines = bs.assets.flatMap((s) => s.lines);
    expect(lines.find((l) => l.account.key === 'sys:accumulatedDepreciation')?.amount).toBe(-year);
    const tb = trialBalance(ps, book, fy);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
  });

  it('balances after a disposal, with what it stood at as the loss on sale', () => {
    const a = asset({ disposedOn: '2027-09-15' });
    const ps = books([a], '2028-03-31');
    const bs = balanceSheet(ps, book, '2028-03-31', stock);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    const lines = bs.assets.flatMap((s) => s.lines);
    expect(lines.find((l) => l.account.key === 'sys:fixedAssets')?.amount ?? 0).toBe(0);
    expect(lines.find((l) => l.account.key === 'sys:accumulatedDepreciation')?.amount ?? 0).toBe(0);
    const pl = profitAndLoss(ps, book, { from: '2027-04-01', to: '2028-03-31' }, stock);
    expect(pl.indirect.income.find((l) => l.account.key === 'sys:assetDisposal')?.amount).toBe(-(12_000_000 - accumulatedDepreciation(a, '2027-09-15')));
  });

  it('schedules cost and depreciation for the period, asset by asset', () => {
    const lathe = asset();
    const laptop = asset({ id: 'fa2', name: 'Laptop', category: 'Computers', costMinor: 9_000_000, acquiredOn: '2026-10-01', inUseFrom: '2026-10-01', method: 'wdv', rate: 40, lifeMonths: undefined });
    const [laptopRow, latheRow] = assetSchedule([lathe, laptop], { from: '2027-04-01', to: '2028-03-31' });
    expect(latheRow).toMatchObject({ openingCost: 12_000_000, additions: 0, disposals: 0, closingCost: 12_000_000 });
    expect(latheRow.openingDepreciation).toBe(accumulatedDepreciation(lathe, '2027-03-31'));
    expect(latheRow.closingValue).toBe(bookValue(lathe, '2028-03-31'));
    expect(laptopRow.openingValue + laptopRow.additions - laptopRow.depreciation).toBe(laptopRow.closingValue);
    const added = assetSchedule([laptop], fy)[0];
    expect(added).toMatchObject({ openingCost: 0, additions: 9_000_000, openingDepreciation: 0 });
    expect(added.closingValue).toBe(bookValue(laptop, '2027-03-31'));
  });
});
