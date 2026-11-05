import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Segmented } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { guessOpeningColumns, openingRecords, type OpeningRecord } from '@esmart/core/domain/openingImport';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { ImportFlow, type ColumnMapping, type ImportColumn } from '../import/ImportFlow';
import { api } from '../../remote/api';
import { syncSoon } from '../../remote/sync';
import { useBaseCurrency } from '../../store/selectors';
import { useAppStore } from '../../store/appStore';

type Side = 'receivable' | 'payable';
const FIELDS = ['party', 'number', 'date', 'dueDate', 'amount'] as const;

/**
 * What was outstanding when the books started here (RULES 6.12), invoice by invoice: a list of unpaid
 * customer invoices or supplier bills, read on the device, checked by the server without saving, then
 * created as opening invoices or bills. Opened from Receivables or Payables, `side` preselected.
 */
export function ImportOpenings({ side: initialSide }: { side: Side }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books', 'common']);
  const router = useRouter();
  const toast = useToast();
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const [side, setSide] = useState<Side>(initialSide);
  const kind: 'openingInvoice' | 'openingBill' = side === 'receivable' ? 'openingInvoice' : 'openingBill';

  const fields = useMemo(
    () => FIELDS.map((key) => ({ key, label: tr(`books:openings.field.${key}`), required: key !== 'dueDate' })),
    [tr],
  );
  const detect = useCallback((rows: string[][]) => ({ headerRow: 0, mapping: guessOpeningColumns(rows[0] ?? []) }), []);
  const toRecords = useCallback(
    (rows: string[][], headerRow: number, mapping: ColumnMapping) =>
      openingRecords(rows, headerRow, mapping, currency, {
        noParty: tr('books:openings.noParty'),
        noNumber: tr('books:openings.noNumber'),
        badDate: (value) => tr('books:openings.badDate', { value }),
        badDueDate: (value) => tr('books:openings.badDueDate', { value }),
        badAmount: (value) => tr('books:openings.badAmount', { value }),
      }),
    [tr, currency],
  );
  const columns = useMemo<ImportColumn<OpeningRecord>[]>(
    () => [
      { key: 'date', label: tr('books:openings.col.date'), render: (r) => formatDate(r.date, 'dd MMM yyyy') },
      { key: 'party', label: tr('books:openings.col.party'), render: (r) => r.party },
      { key: 'number', label: tr('books:openings.col.number'), render: (r) => r.number },
      { key: 'due', label: tr('books:openings.col.due'), render: (r) => (r.dueDate ? formatDate(r.dueDate, 'dd MMM yyyy') : '') },
      { key: 'amount', label: tr('books:openings.col.amount'), align: 'right', render: (r) => formatMoney(r.amount) },
    ],
    [tr],
  );

  const send = async (records: OpeningRecord[], dryRun: boolean) => {
    const { data, error } = await api.POST('/companies/{companyId}/documents/openings/import', {
      params: { path: { companyId } },
      body: { rows: records.map((r) => ({ kind, party: r.party, number: r.number, date: r.date, ...(r.dueDate && { dueDate: r.dueDate }), amount: r.amount })), dryRun },
    });
    if (error || !data) throw error ?? new Error('No answer from the server');
    return data;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.xs }}>
        <Text variant="caption" tone="muted" weight="600">
          {tr('books:openings.side')}
        </Text>
        <Segmented
          options={[
            { value: 'receivable', label: tr('books:openings.receivable') },
            { value: 'payable', label: tr('books:openings.payable') },
          ]}
          value={side}
          onChange={(v) => setSide(v as Side)}
        />
      </View>
      <ImportFlow<OpeningRecord>
        // A new side starts the flow again, so nothing checked for one side is imported as the other.
        key={side}
        title={tr('books:openings.title')}
        hint={tr('books:openings.hint')}
        accept={['.csv']}
        fields={fields}
        detect={detect}
        toRecords={toRecords}
        columns={columns}
        maxRecords={1000}
        onDryRun={async (records) => {
          const res = await send(records, true);
          return {
            summary: tr('books:openings.dryRun', { created: res.created ?? 0, skipped: res.skipped ?? 0, invalid: res.invalid ?? 0 }),
            rowFlags: (res.results ?? []).map((r) =>
              r.status === 'duplicate' ? tr('books:openings.flag.duplicate') : r.status === 'invalid' ? (r.issues ?? []).map((i) => i.message).join(' · ') : undefined,
            ),
          };
        }}
        onConfirm={async (records) => {
          const res = await send(records, false);
          syncSoon();
          toast.show(tr('books:openings.done', { count: res.created ?? 0 }), 'success', { icon: 'book-check-outline' });
          router.replace(side === 'receivable' ? '/(app)/receivables' : '/(app)/payables');
        }}
        confirmLabel={(count) => tr('books:openings.confirm', { count })}
      />
    </View>
  );
}
