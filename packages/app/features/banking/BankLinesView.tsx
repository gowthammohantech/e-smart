import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Cell, DataTable, type RowAction } from '@esmart/ui/components/DataTable';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { pagedTableProps } from '../../components/pagedTable';
import { includeBankLine, matchBankLine, unmatchBankLine } from '../../remote/banking';
import { useCanWrite } from '../../remote/connectivity';
import { useBankLines, type BankLine, type BankLineStatus } from '../../remote/queries';
import { useBaseCurrency, useHasModule } from '../../store/selectors';
import { ExcludeSheet, FindMatchSheet, RecordExpenseSheet, RecordPaymentSheet, RecordVoucherSheet } from './LineSheets';
import { MatchChip, SignedAmount, useBankAction, useRecordLabel, type RecordLike } from './parts';
import { ListSkeleton, MoreRowsSkeleton } from '../../components/ScreenSkeleton';

type Sheet = 'find' | 'payment' | 'expense' | 'voucher' | 'exclude';

/** Where a matched record opens. */
const routeOf = (r: { type: string; id: string }) => (r.type === 'payment' ? `/(app)/payments/${r.id}` : r.type === 'expense' ? `/(app)/expenses/${r.id}` : `/(app)/books/vouchers/${r.id}`);

/**
 * One tab of a bank account's statement lines: those still to explain (with
 * their suggested matches and what can be done with each), the matched ones
 * with their records, or the excluded ones with why. A table on a desktop,
 * cards on a phone.
 */
export function BankLinesView({ accountId, status, header }: { accountId: string; status: BankLineStatus; header?: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['banking', 'common']);
  const pages = useBankLines(accountId, status);
  const canWrite = useCanWrite();
  const expenses = useHasModule('expenses');
  const baseCurrency = useBaseCurrency();
  const paymentsMade = useHasModule('payables');
  const labelOf = useRecordLabel();
  const { run, busy } = useBankAction();
  const [sheet, setSheet] = useState<{ kind: Sheet; line: BankLine } | null>(null);
  // Unmatching undoes a reconciliation: it is asked first.
  const [askUnmatch, setAskUnmatch] = useState<BankLine | null>(null);
  const close = () => setSheet(null);
  const open = (kind: Sheet, line: BankLine) => setSheet({ kind, line });

  const match = (line: BankLine, r: RecordLike & { id: string }) => void run(`match:${line.id}`, () => matchBankLine(line, { type: r.type, id: r.id }), tr('banking:lines.matched'));
  const unmatch = (line: BankLine) => void run(`unmatch:${line.id}`, () => unmatchBankLine(line), tr('banking:lines.unmatchedToast'));
  const include = (line: BankLine) => void run(`include:${line.id}`, () => includeBankLine(line), tr('banking:lines.includedToast'));
  const into = (line: BankLine) => line.amount.minor > 0;
  // Money paid needs the payables module; an expense the expenses module and money going out.
  const canPay = (line: BankLine) => into(line) || paymentsMade;
  const canExpense = (line: BankLine) => !into(line) && expenses;
  // Vouchers are in the base currency: a foreign-currency account's lines are payments or expenses.
  const canVoucher = (line: BankLine) => line.amount.currency === baseCurrency;

  const actionsOf = (line: BankLine): RowAction[] => {
    if (!canWrite) return [];
    if (status === 'matched') {
      return [
        ...(line.match ? [{ key: 'open', label: tr('banking:lines.openRecord'), icon: 'eye-outline' as const, onPress: () => router.push(routeOf(line.match!) as never) }] : []),
        { key: 'unmatch', label: tr('banking:lines.unmatch'), icon: 'link-variant-off', destructive: true, onPress: () => setAskUnmatch(line) },
      ];
    }
    if (status === 'excluded') return [{ key: 'include', label: tr('banking:lines.include'), icon: 'eye-outline', onPress: () => include(line) }];
    return [
      ...(line.suggestions ?? []).map((s) => ({ key: `s:${s.type}:${s.id}`, label: tr('banking:lines.match', { record: labelOf(s) }), icon: 'link-variant' as const, onPress: () => match(line, s) })),
      { key: 'find', label: tr('banking:lines.find'), icon: 'magnify', onPress: () => open('find', line) },
      ...(canPay(line) ? [{ key: 'payment', label: tr('banking:lines.recordPayment'), icon: 'cash-plus' as const, onPress: () => open('payment', line) }] : []),
      ...(canExpense(line) ? [{ key: 'expense', label: tr('banking:lines.recordExpense'), icon: 'receipt-text-outline' as const, onPress: () => open('expense', line) }] : []),
      ...(canVoucher(line) ? [{ key: 'voucher', label: tr('banking:lines.recordVoucher'), icon: 'book-open-variant' as const, onPress: () => open('voucher', line) }] : []),
      { key: 'exclude', label: tr('banking:lines.exclude'), icon: 'eye-off-outline', destructive: true, onPress: () => open('exclude', line) },
    ];
  };

  const narration = (line: BankLine) => [line.description || '—', line.reference].filter(Boolean).join(' · ');
  const emptyTitle = tr(`banking:lines.empty.${status}`);
  const emptyBody = tr(`banking:lines.emptyBody.${status}`);

  const sheets = (
    <>
      {sheet?.kind === 'find' ? <FindMatchSheet key={sheet.line.id} line={sheet.line} onClose={close} /> : null}
      {sheet?.kind === 'payment' ? <RecordPaymentSheet key={sheet.line.id} line={sheet.line} onClose={close} /> : null}
      {sheet?.kind === 'expense' ? <RecordExpenseSheet key={sheet.line.id} line={sheet.line} onClose={close} /> : null}
      {sheet?.kind === 'voucher' ? <RecordVoucherSheet key={sheet.line.id} line={sheet.line} onClose={close} /> : null}
      {sheet?.kind === 'exclude' ? <ExcludeSheet key={sheet.line.id} line={sheet.line} onClose={close} /> : null}
      <ConfirmDialog
        visible={!!askUnmatch}
        icon="link-variant-off"
        title={tr('banking:lines.unmatchAskTitle')}
        message={tr('banking:lines.unmatchAskBody', { record: askUnmatch?.match ? labelOf(askUnmatch.match) : '' })}
        confirmLabel={tr('banking:lines.unmatch')}
        destructive
        onCancel={() => setAskUnmatch(null)}
        onConfirm={() => {
          const l = askUnmatch!;
          setAskUnmatch(null);
          unmatch(l);
        }}
      />
    </>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, gap: t.spacing.md }}>
        {header}
        <DataTable
          columns={[
            { key: 'date', header: tr('banking:col.date'), width: 110, render: (l: BankLine) => <Cell tone="muted">{formatDate(l.date, 'dd MMM yyyy')}</Cell> },
            { key: 'narration', header: tr('banking:col.narration'), flex: 2.4, render: (l) => <Cell>{narration(l)}</Cell> },
            { key: 'amount', header: tr('banking:col.amount'), width: 150, align: 'right', render: (l) => <SignedAmount minor={l.amount.minor} currency={l.amount.currency} /> },
            status === 'unmatched'
              ? {
                  key: 'suggestion',
                  header: tr('banking:col.suggestion'),
                  flex: 2,
                  render: (l) => {
                    const best = l.suggestions?.[0];
                    if (!best) return <Cell tone="muted">{tr('banking:lines.noSuggestion')}</Cell>;
                    return <MatchChip label={labelOf(best)} strong={best.referenceHit} onPress={() => match(l, best)} disabled={!canWrite || !!busy} />;
                  },
                }
              : status === 'matched'
                ? { key: 'record', header: tr('banking:col.record'), flex: 2, render: (l) => <Cell tone="primary">{l.match ? labelOf(l.match) : '—'}</Cell> }
                : { key: 'reason', header: tr('banking:col.reason'), flex: 2, render: (l) => <Cell tone="muted">{l.excludedReason || tr('banking:lines.noReason')}</Cell> },
            { key: 'balance', secondary: true, header: tr('banking:col.balance'), width: 140, align: 'right', render: (l) => <Cell tone="muted" mono>{l.balance ? formatMoney(money(l.balance.minor, l.balance.currency)) : '—'}</Cell> },
          ]}
          rows={pages.rows}
          rowKey={(l) => l.id}
          rowLabel={(l) => `${formatDate(l.date)}, ${narration(l)}`}
          rowActions={actionsOf}
          {...pagedTableProps(pages, tr('common:table.loadFailed'), `bank-lines-${status}`)}
          empty={<EmptyState icon="bank-check" title={emptyTitle} message={emptyBody} compact />}
        />
        {sheets}
      </View>
    );
  }

  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {header}
        {pages.isLoading ? (
          <ListSkeleton kind="list" />
        ) : pages.isError ? (
          <EmptyState icon="alert-circle-outline" title={tr('common:table.loadFailed')} actionLabel={tr('banking:lines.retry')} onAction={() => void pages.refetch()} compact />
        ) : !pages.rows.length ? (
          <EmptyState icon="bank-check" title={emptyTitle} message={emptyBody} compact />
        ) : (
          pages.rows.map((l) => (
            <Card key={l.id} style={{ gap: t.spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    {[formatDate(l.date, 'dd MMM yyyy'), l.reference].filter(Boolean).join(' · ')}
                  </Text>
                  <Text variant="small" weight="600" numberOfLines={3}>
                    {l.description || '—'}
                  </Text>
                </View>
                <SignedAmount minor={l.amount.minor} currency={l.amount.currency} />
              </View>

              {status === 'unmatched' ? (
                <>
                  {l.suggestions?.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                      {l.suggestions.map((s) => (
                        <MatchChip key={`${s.type}:${s.id}`} label={labelOf(s)} strong={s.referenceHit} onPress={() => match(l, s)} disabled={!canWrite || !!busy} />
                      ))}
                    </View>
                  ) : (
                    <Text variant="caption" tone="muted">
                      {tr('banking:lines.noSuggestion')}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                    <Button size="sm" variant="ghost" icon="magnify" title={tr('banking:lines.find')} onPress={() => open('find', l)} disabled={!canWrite} />
                    {canPay(l) ? <Button size="sm" variant="ghost" icon="cash-plus" title={tr('banking:lines.recordPayment')} onPress={() => open('payment', l)} disabled={!canWrite} /> : null}
                    {canExpense(l) ? <Button size="sm" variant="ghost" icon="receipt-text-outline" title={tr('banking:lines.recordExpense')} onPress={() => open('expense', l)} disabled={!canWrite} /> : null}
                    {canVoucher(l) ? <Button size="sm" variant="ghost" icon="book-open-variant" title={tr('banking:lines.recordVoucher')} onPress={() => open('voucher', l)} disabled={!canWrite} /> : null}
                    <Button size="sm" variant="ghost" icon="eye-off-outline" title={tr('banking:lines.exclude')} onPress={() => open('exclude', l)} disabled={!canWrite} />
                  </View>
                </>
              ) : status === 'matched' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                  <Badge label={tr('banking:lines.matchedBadge')} tone="success" size="sm" icon="link-variant" />
                  <Text variant="caption" tone="primary" style={{ flex: 1 }} onPress={l.match ? () => router.push(routeOf(l.match!) as never) : undefined} accessibilityRole={l.match ? 'link' : undefined}>
                    {l.match ? labelOf(l.match) : '—'}
                  </Text>
                  <Button size="sm" variant="ghost" icon="link-variant-off" title={tr('banking:lines.unmatch')} onPress={() => setAskUnmatch(l)} loading={busy === `unmatch:${l.id}`} disabled={!canWrite || !!busy} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                    {l.excludedReason ? tr('banking:lines.reason', { reason: l.excludedReason }) : tr('banking:lines.noReason')}
                  </Text>
                  <Button size="sm" variant="ghost" icon="eye-outline" title={tr('banking:lines.include')} onPress={() => include(l)} loading={busy === `include:${l.id}`} disabled={!canWrite || !!busy} />
                </View>
              )}
            </Card>
          ))
        )}
        {pages.hasNextPage ? (
          <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
            {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : <Button title={tr('banking:lines.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
          </View>
        ) : null}
      </ScrollView>
      {sheets}
    </View>
  );
}

