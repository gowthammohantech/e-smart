import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Schema } from '@esmart/api-client';
import { addDaysISO } from '@esmart/core/lib/date';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { bankingKeys, hubKeys, queryClient, type BankLine } from './queries';
import { syncSoon } from './sync';

/**
 * Bank statement writes: importing, matching lines to the books, setting them
 * aside, and recording the payment or expense a line is. Server only (there
 * is no offline bank line), so each is a plain call that throws an ApiError
 * the screen toasts (`describeError`), then marks what it changed stale.
 */

const companyId = () => useAppStore.getState().activeCompanyId;
/** The line as last read, so a change someone made since is refused (412) rather than overwritten. */
const ifMatch = (line: Pick<BankLine, 'version'>) => ({ 'If-Match': `"v${line.version}"` });

/**
 * Refetches the account's lines, counts and reconciliation; with `books`, also
 * the payment and expense lists, the books and hubs a new record shows in,
 * and pulls the record into the store.
 */
function changed(accountId: string, books = false) {
  const c = companyId();
  void queryClient.invalidateQueries({ queryKey: bankingKeys.account(c, accountId) });
  if (!books) return;
  for (const key of [['payments', c], ['expenses', c], ['books', c], ['reports', c], hubKeys.all(c)]) void queryClient.invalidateQueries({ queryKey: key });
  syncSoon();
}

export type BankRecordRef = { type: Schema<'BankMatchType'>; id: string };

export async function matchBankLine(line: BankLine, record: BankRecordRef): Promise<BankLine> {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/match', { params: { path: { companyId: companyId(), id: line.id }, header: ifMatch(line) }, body: record });
  changed(line.accountId);
  return data!;
}

export async function unmatchBankLine(line: BankLine): Promise<BankLine> {
  const { data } = await api.DELETE('/companies/{companyId}/bank-lines/{id}/match', { params: { path: { companyId: companyId(), id: line.id }, header: ifMatch(line) } });
  changed(line.accountId);
  return data!;
}

export async function excludeBankLine(line: BankLine, reason?: string): Promise<BankLine> {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/exclude', {
    params: { path: { companyId: companyId(), id: line.id }, header: ifMatch(line) },
    body: reason?.trim() ? { reason: reason.trim() } : {},
  });
  changed(line.accountId);
  return data!;
}

export async function includeBankLine(line: BankLine): Promise<BankLine> {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/include', { params: { path: { companyId: companyId(), id: line.id }, header: ifMatch(line) } });
  changed(line.accountId);
  return data!;
}

export type PaymentFromLine = { partyId: string; method?: Schema<'PaymentMethod'>; notes?: string; allocations?: { documentId: string; amountMinor: number }[] };

/** Money in becomes a payment received, money out a payment made, matched to the line. */
export async function createPaymentFromBankLine(line: BankLine, body: PaymentFromLine) {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/payment', {
    params: { path: { companyId: companyId(), id: line.id } },
    body: {
      partyId: body.partyId,
      method: body.method,
      notes: body.notes?.trim() || undefined,
      allocations: body.allocations?.filter((a) => a.amountMinor > 0).map((a) => ({ documentId: a.documentId, amount: { minor: a.amountMinor, currency: line.amount.currency } })),
    },
  });
  changed(line.accountId, true);
  return data!;
}

export type ExpenseFromLine = { categoryId: string; supplierId?: string; notes?: string };

/** A debit line recorded as an expense, matched to it. */
export async function createExpenseFromBankLine(line: BankLine, body: ExpenseFromLine) {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/expense', {
    params: { path: { companyId: companyId(), id: line.id } },
    body: { categoryId: body.categoryId, supplierId: body.supplierId || undefined, notes: body.notes?.trim() || undefined },
  });
  changed(line.accountId, true);
  return data!;
}

/**
 * A line that is neither a party's payment nor an expense (interest, a loan, capital, drawings)
 * recorded against a ledger account: a receipt voucher for money in, a journal for money out.
 */
export async function createVoucherFromBankLine(line: BankLine, body: { account: string; narration?: string }) {
  const { data } = await api.POST('/companies/{companyId}/bank-lines/{id}/voucher', {
    params: { path: { companyId: companyId(), id: line.id } },
    body: { account: body.account, narration: body.narration?.trim() || undefined },
  });
  changed(line.accountId, true);
  return data!;
}

/** The statements imported into a bank account, newest first, with their lines' counts. */
export function useBankStatements(accountId: string) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...bankingKeys.account(c, accountId), 'statements'],
    enabled: !!c,
    queryFn: async () => (await api.GET('/companies/{companyId}/payment-accounts/{id}/bank-statements', { params: { path: { companyId: c, id: accountId } } })).data!.data,
  });
}

/** Undoes an import: its lines go, and what they were matched to is free to match again. */
export async function removeBankStatement(accountId: string, statementId: string) {
  await api.DELETE('/companies/{companyId}/bank-statements/{id}', { params: { path: { companyId: companyId(), id: statementId } } });
  changed(accountId);
}

/** An Excel (.xlsx) or CSV statement as rows of text, read by the server. */
export async function parseBankStatement(fileName: string, contentBase64: string): Promise<string[][]> {
  const { data } = await api.POST('/companies/{companyId}/bank-statements/parse', { params: { path: { companyId: companyId() } }, body: { fileName, contentBase64 } });
  return data!.rows;
}

export type StatementImport = Schema<'BankStatementImport'>;

/** Imports a statement's lines into a bank account; `dryRun` only says what it would do. */
export async function importBankStatement(accountId: string, body: StatementImport): Promise<Schema<'BankStatementImportResult'>> {
  const { data } = await api.POST('/companies/{companyId}/payment-accounts/{id}/bank-statements', { params: { path: { companyId: companyId(), id: accountId } }, body });
  if (!body.dryRun) changed(accountId, true);
  return data!;
}

/** A payment or expense on the account that a line could be, signed as the bank sees it. */
export type MatchCandidate = BankRecordRef & { number?: string; date: string; amountMinor: number; partyName?: string; reference?: string };


/**
 * What in the books a line could be: the payments, expenses and vouchers on its account dated within a
 * month of it that no other line is matched to, matching what's typed (a number, a reference, a name),
 * the same amount first, then the nearest date.
 */
export function useBankMatchSearch(line: BankLine | null, q: string) {
  const c = useAppStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: [...bankingKeys.account(c, line?.accountId ?? ''), 'find', line?.id ?? '', q.trim()],
    enabled: !!c && !!line,
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<MatchCandidate[]> => {
      const { data } = await api.GET('/companies/{companyId}/bank-lines/{id}/candidates', { params: { path: { companyId: c, id: line!.id }, query: { q: q.trim() || undefined } }, signal });
      return (data?.data ?? []).map((r) => ({ type: r.type, id: r.id, number: r.number, date: r.date, amountMinor: r.amount.minor, partyName: r.partyName, reference: r.reference }));
    },
  });
}
