import { cleanAmount, matchColumns } from '../lib/csv';
import { fromMajor, type Money } from '../lib/money';
import { parseStatementDate } from './bankStatement';

/**
 * Opening invoices and bills from a spreadsheet (RULES 6.12): the outstanding list a business keeps,
 * or exports from Tally ("Bills receivable", "Outstanding"), read into the rows `importOpeningDocuments`
 * takes. Pure, so the app previews what the server will be asked to create.
 */

export type OpeningField = 'party' | 'number' | 'date' | 'dueDate' | 'amount';

/** Header names each field goes by, squashed (lower case, no spaces or punctuation). */
export const OPENING_ALIASES: Record<OpeningField, string[]> = {
  party: ['party', 'partyname', 'customer', 'customername', 'supplier', 'suppliername', 'name', 'ledger', 'ledgername', 'gstin', 'account'],
  number: ['number', 'invoiceno', 'invoicenumber', 'invoice', 'billno', 'billnumber', 'bill', 'refno', 'reference', 'voucherno', 'docno', 'no'],
  date: ['date', 'invoicedate', 'billdate', 'voucherdate', 'docdate'],
  dueDate: ['duedate', 'due', 'dueon', 'paymentdue'],
  amount: ['outstanding', 'balance', 'pending', 'pendingamount', 'balancedue', 'amountdue', 'dueamount', 'amount', 'openingamount', 'closingbalance'],
};

/** Which column holds which field, by header. */
export function guessOpeningColumns(header: string[]): Partial<Record<OpeningField, number>> {
  return matchColumns(header, OPENING_ALIASES);
}

export type OpeningRecord = {
  /** The spreadsheet's own row number, as shown there (1-based). */
  row: number;
  party: string;
  number: string;
  date: string;
  dueDate?: string;
  amount: Money;
};

/**
 * The sheet's rows as opening records, `headerRow` being the header's index. Dates day first
 * (dd/mm/yyyy, 15-Mar-2026, …); amounts the Indian way, with "Dr"/"Cr" and brackets read as signs
 * and the sign dropped (the page says whether these are owed to us or by us). Each bad row is an
 * error with its spreadsheet row number, left out.
 */
export function openingRecords(
  rows: string[][],
  headerRow: number,
  mapping: Partial<Record<OpeningField, number | undefined>>,
  currency: string,
  text: { noParty: string; noNumber: string; badDate: (v: string) => string; badDueDate: (v: string) => string; badAmount: (v: string) => string },
): { records: OpeningRecord[]; errors: { row: number; message: string }[] } {
  const records: OpeningRecord[] = [];
  const errors: { row: number; message: string }[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (f: OpeningField) => (mapping[f] === undefined ? '' : String(cells[mapping[f]!] ?? '').trim());
    if (cells.every((c) => !String(c ?? '').trim())) continue;
    const row = i + 1;
    const party = get('party');
    const number = get('number');
    const dateRaw = get('date');
    const date = parseStatementDate(dateRaw);
    const dueRaw = get('dueDate');
    const dueDate = dueRaw ? parseStatementDate(dueRaw) : undefined;
    const amountRaw = get('amount').replace(/\s*(dr|cr)\.?$/i, '');
    const amount = cleanAmount(amountRaw);
    const problems = [
      !party && text.noParty,
      !number && text.noNumber,
      !date && text.badDate(dateRaw),
      dueRaw && !dueDate && text.badDueDate(dueRaw),
      (amount === null || amount === undefined || Number(amount) === 0) && text.badAmount(get('amount')),
    ].filter(Boolean) as string[];
    if (problems.length) {
      errors.push({ row, message: problems.join(' · ') });
      continue;
    }
    records.push({ row, party, number, date: date!, ...(dueDate && { dueDate }), amount: fromMajor(String(Math.abs(Number(amount))), currency) });
  }
  return { records, errors };
}
