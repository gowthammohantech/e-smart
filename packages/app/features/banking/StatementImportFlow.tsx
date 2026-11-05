import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import type { StatementLine } from '@esmart/core/domain/bankStatement';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { importBankStatement, parseBankStatement, type StatementImport as ImportBody } from '../../remote/banking';
import { ImportFlow, type ColumnMapping, type ImportColumn } from '../import/ImportFlow';
import { amountProblem, detectStatement, statementFields, toStatementLines } from './statementImport';
import { signedMoney } from './parts';

const ACCEPT = ['.csv', '.xlsx'];

/**
 * A bank statement into one bank account: the file read on the device (CSV)
 * or by the server (Excel), its columns matched, a dry run that says what's
 * new, already imported and matched on its own, then the import. `onDone`
 * runs once it is in.
 */
export function StatementImport({ account, onDone }: { account: { id: string; name: string; currency: string }; onDone: () => void }) {
  const { t: tr } = useTranslation(['banking']);
  const toast = useToast();
  const currency = account.currency;

  const fields = useMemo(() => statementFields((f) => tr(`banking:field.${f}`)), [tr]);
  const toRecords = useCallback(
    (rows: string[][], headerRow: number, mapping: ColumnMapping) =>
      toStatementLines(rows, headerRow, mapping, { badAmount: (value) => tr('banking:import.badAmount', { value }), noColumns: tr('banking:import.noColumns') }),
    [tr],
  );
  const validateMapping = useCallback((mapping: ColumnMapping) => (amountProblem(mapping) ? tr('banking:import.noAmount') : undefined), [tr]);
  const columns = useMemo<ImportColumn<StatementLine>[]>(
    () => [
      { key: 'date', label: tr('banking:col.date'), render: (l) => formatDate(l.date, 'dd MMM yyyy') },
      { key: 'narration', label: tr('banking:col.narration'), render: (l) => l.description || '—' },
      { key: 'reference', label: tr('banking:col.reference'), render: (l) => l.reference ?? '' },
      { key: 'balance', label: tr('banking:col.balance'), align: 'right', render: (l) => (l.balanceMinor !== undefined ? formatMoney(money(l.balanceMinor, currency)) : '') },
      { key: 'amount', label: tr('banking:col.amount'), align: 'right', render: (l) => signedMoney(l.amountMinor, currency), tone: (l) => (l.amountMinor > 0 ? 'good' : 'bad') },
    ],
    [tr, currency],
  );

  const body = (lines: StatementLine[], fileName: string, dryRun: boolean): ImportBody => ({
    fileName: fileName.slice(0, 200),
    dryRun,
    lines: lines.map((l) => ({
      date: l.date,
      description: l.description.slice(0, 1000),
      ...(l.reference && { reference: l.reference }),
      amount: { minor: l.amountMinor, currency },
      ...(l.balanceMinor !== undefined && { balance: { minor: l.balanceMinor, currency } }),
    })),
  });

  return (
    <ImportFlow<StatementLine>
      title={tr('banking:import.title', { account: account.name })}
      hint={tr('banking:import.hint')}
      accept={ACCEPT}
      parseRemote={parseBankStatement}
      fields={fields}
      detect={detectStatement}
      validateMapping={validateMapping}
      toRecords={toRecords}
      columns={columns}
      onDryRun={async (lines, fileName) => {
        const res = await importBankStatement(account.id, body(lines, fileName, true));
        return {
          summary: tr('banking:import.dryRun', { imported: res.imported, duplicates: res.duplicates, autoMatched: res.autoMatched }),
          rowFlags: res.lines.map((l) => (l.duplicate ? tr('banking:import.duplicate') : undefined)),
        };
      }}
      onConfirm={async (lines, fileName) => {
        const res = await importBankStatement(account.id, body(lines, fileName, false));
        toast.show(tr('banking:import.done', { count: res.imported }), 'success', { icon: 'bank-check', detail: tr('banking:import.doneDetail', { duplicates: res.duplicates, autoMatched: res.autoMatched }) });
        onDone();
      }}
      confirmLabel={(count) => tr('banking:import.confirm', { count })}
    />
  );
}
