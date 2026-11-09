import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { financialYearOf, formatDate, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import type { Money } from '@esmart/core/lib/money';
import type { Party } from '@esmart/core/types';
import { partyStatementPdf, usePartyStatement } from '../../remote/parties';
import { describeError } from '../../remote/errors';
import { deliverFile } from '../reports/exportFiles';
import { useActiveCompany } from '../../store/selectors';
import { ReportSkeleton } from '../../components/ScreenSkeleton';

type Entry = NonNullable<ReturnType<typeof usePartyStatement>['data']>['entries'] extends (infer E)[] | undefined ? E : never;

/**
 * A party's statement of account, as sent to them: the opening balance at the start of the range,
 * each invoice, bill, note, payment and voucher with the balance after it, and the closing balance.
 * The figures and the PDF both come from the server, so the screen and the printout agree.
 */
export function PartyStatementView({ party }: { party: Party }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['contacts', 'common', 'books']);
  const company = useActiveCompany();
  const [from, setFrom] = useState(() => financialYearOf(today(), company.fiscalYearStartMonth).start);
  const [to, setTo] = useState(today());
  const range = { from, to: to < from ? from : to };
  const statement = usePartyStatement(party.id, range);
  const [busy, setBusy] = useState(false);

  // Positive is what the party owes us for a customer and what we owe them for a supplier, as on the party record.
  const balance = (m?: Money) => (m ? `${formatMoney({ ...m, minor: Math.abs(m.minor) })} ${m.minor < 0 ? tr('contacts:statement.advance') : ''}`.trim() : '—');

  const open = (e: Entry) => {
    if (!e.entityId) return;
    if (e.entityType === 'document') router.push(`/(app)/documents/${e.entityId}` as never);
    else if (e.entityType === 'payment') router.push(`/(app)/payments/${e.entityId}` as never);
    else if (e.entityType === 'voucher') router.push(`/(app)/books/vouchers/${e.entityId}` as never);
  };

  const download = async () => {
    setBusy(true);
    const fileName = `Statement-${party.name.replace(/[^\w-]+/g, '_')}-${range.from}-${range.to}.pdf`;
    try {
      await toast.promise(
        (async () => deliverFile(fileName, await partyStatementPdf(company.id, party.id, range), 'application/pdf'))(),
        {
          loading: tr('contacts:statement.preparing'),
          success: { text: tr(Platform.OS === 'web' ? 'contacts:statement.downloaded' : 'contacts:statement.ready'), detail: fileName },
          error: (err) => `${tr('contacts:statement.failed')} ${describeError(err, tr)}`,
          icon: 'file-pdf-box',
        },
      );
    } catch {
      // The toast has said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const data = statement.data;
  const entries = data?.entries ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: t.spacing.xxxl }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
      {/* A desktop keeps the dates at a date's width, with the download at the right of the same row. */}
      <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: desktop ? 'flex-end' : undefined }}>
        <View style={desktop ? { width: 200 } : { flex: 1 }}>
          <DateField label={tr('contacts:statement.from')} value={from} onChange={setFrom} maximumDate={new Date()} />
        </View>
        <View style={desktop ? { width: 200 } : { flex: 1 }}>
          <DateField label={tr('contacts:statement.to')} value={to} onChange={setTo} maximumDate={new Date()} />
        </View>
        {desktop ? (
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Button title={tr('contacts:statement.download')} icon="file-pdf-box" variant="secondary" onPress={() => void download()} loading={busy} disabled={busy || !data} />
          </View>
        ) : null}
      </View>

      {/* A new range still loading: the old range's figures would sit under the new dates. */}
      {statement.isLoading || statement.isPlaceholderData ? (
        <ReportSkeleton />
      ) : statement.isError ? (
        <EmptyState icon="alert-circle-outline" title={tr('contacts:statement.loadFailed')} message={describeError(statement.error, tr)} actionLabel={tr('common:action.retry')} onAction={() => void statement.refetch()} />
      ) : (
        <>
          <Card style={[{ flexDirection: 'row', justifyContent: 'space-between' }, desktop ? { maxWidth: 560 } : null]}>
            <View>
              <Text variant="caption" tone="muted">
                {tr('contacts:statement.opening', { date: formatDate(range.from) })}
              </Text>
              <Text variant="body" weight="600">
                {balance(data?.openingBalance)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" tone="muted">
                {tr('contacts:statement.closing', { date: formatDate(range.to) })}
              </Text>
              <Text variant="title" weight="700">
                {balance(data?.closingBalance)}
              </Text>
            </View>
          </Card>

          {entries.length && desktop ? (
            // A desktop reads the statement as a ledger: debit, credit and the balance after each line in columns.
            <DataTable
              scroll={false}
              rows={entries}
              rowKey={(e) => `${e.entityType}-${e.entityId}-${entries.indexOf(e)}`}
              rowLabel={(e) => e.number ?? tr('contacts:statement.openingEntry')}
              onRowPress={(e) => (e.entityType === 'opening' ? undefined : open(e))}
              columns={[
                { key: 'date', header: tr('common:table.date'), width: 130, render: (e) => <Cell tone="muted">{e.date ? formatDate(e.date) : ''}</Cell> },
                { key: 'type', header: tr('common:table.type'), width: 150, render: (e) => <Cell tone="muted">{tr(`contacts:statement.type.${e.entityType ?? 'document'}`)}</Cell> },
                {
                  key: 'number',
                  header: tr('common:table.number'),
                  flex: 1,
                  render: (e) => <Cell weight="600">{e.entityType === 'opening' ? tr('contacts:statement.openingEntry') : (e.number ?? '')}</Cell>,
                },
                { key: 'debit', header: tr('books:accounts.debitSide'), width: 150, align: 'right', render: (e) => <Cell mono>{e.debit?.minor ? formatMoney(e.debit) : ''}</Cell> },
                { key: 'credit', header: tr('books:accounts.creditSide'), width: 150, align: 'right', render: (e) => <Cell mono>{e.credit?.minor ? formatMoney(e.credit) : ''}</Cell> },
                { key: 'balance', header: tr('books:accounts.balance'), width: 170, align: 'right', render: (e) => <Cell weight="600" mono>{balance(e.balance)}</Cell> },
              ]}
            />
          ) : entries.length ? (
            <Card padded={false}>
              {entries.map((e, i) => (
                <ListRow
                  key={`${e.entityType}-${e.entityId}-${i}`}
                  title={e.entityType === 'opening' ? tr('contacts:statement.openingEntry') : (e.number ?? '')}
                  subtitle={`${e.date ? formatDate(e.date) : ''} · ${tr(`contacts:statement.type.${e.entityType ?? 'document'}`)}`}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                        {e.debit?.minor ? `${formatMoney(e.debit)} ${tr('contacts:statement.dr')}` : e.credit?.minor ? `${formatMoney(e.credit)} ${tr('contacts:statement.cr')}` : formatMoney({ minor: 0, currency: party.currency })}
                      </Text>
                      <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {balance(e.balance)}
                      </Text>
                    </View>
                  }
                  chevron={e.entityType !== 'opening'}
                  divider={i < entries.length - 1}
                  onPress={e.entityType === 'opening' ? undefined : () => open(e)}
                />
              ))}
            </Card>
          ) : (
            <EmptyState icon="book-open-outline" title={tr('contacts:statement.empty')} message={tr('contacts:statement.emptyBody')} />
          )}

          {desktop ? null : <Button title={tr('contacts:statement.download')} icon="file-pdf-box" onPress={() => void download()} loading={busy} disabled={busy} fullWidth />}
        </>
      )}
    </ScrollView>
  );
}
