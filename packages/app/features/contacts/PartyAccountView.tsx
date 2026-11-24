import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { Cell, DataTable, TABLE_PAGE_SIZE, TABLE_PAGE_SIZES } from '@esmart/ui/components/DataTable';
import { Segmented } from '@esmart/ui/components/Field';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { documentKindLabel, paymentMethodLabel } from '@esmart/core/labels';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import type { Money } from '@esmart/core/lib/money';
import type { DocumentKind, Party, PaymentMethod } from '@esmart/core/types';
import { usePartyStatement } from '../../remote/parties';
import { describeError } from '../../remote/errors';
import { ReportSkeleton } from '../../components/ScreenSkeleton';

type Entry = NonNullable<ReturnType<typeof usePartyStatement>['data']>['entries'] extends (infer E)[] | undefined ? E : never;
type Group = 'billed' | 'debit' | 'credit' | 'returns' | 'payments' | 'other';

/** Which table each line goes in. */
const GROUP_OF: Record<string, Group> = {
  invoice: 'billed',
  openingInvoice: 'billed',
  purchaseBill: 'billed',
  openingBill: 'billed',
  debitNote: 'debit',
  supplierDebitNote: 'debit',
  creditNote: 'credit',
  supplierCreditNote: 'credit',
  salesReturn: 'returns',
  purchaseReturn: 'returns',
  receipt: 'payments',
  advanceReceipt: 'payments',
  payment: 'payments',
  refund: 'payments',
};
const GROUPS: Group[] = ['billed', 'debit', 'credit', 'returns', 'payments', 'other'];
const OWN_KINDS = ['tds', 'receipt', 'advanceReceipt', 'payment', 'refund', 'journal'];
/** Every date: the account from its first line, the opening balance at its start. */
const ALL_TIME = { from: '2000-01-01' };

/**
 * A party's whole account on their page: the opening balance, what was invoiced, the debit notes, the
 * credit notes, the returns, and what was received, adding up to the balance; then a tab for each of
 * those, its table line by line with its particulars (taxable value and GST, or how it was paid). The
 * figures are the server's statement's.
 */
export function PartyAccountView({ party, advance }: { party: Party; advance?: Money }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const { t: tr } = useTranslation(['contacts', 'common', 'books']);
  const statement = usePartyStatement(party.id, ALL_TIME);
  const [picked, setPicked] = useState<Group | undefined>();
  // A supplier's account reads the other way: positive is what we owe them.
  const supplier = party.kind === 'supplier';

  const data = statement.data;
  const lines = (data?.entries ?? []).filter((e) => e.entityType !== 'opening');
  const currency = data?.closingBalance?.currency ?? party.currency;
  const groupOf = (e: Entry): Group => GROUP_OF[e.kind ?? ''] ?? 'other';
  // What a line does to the balance: up for what they owe us more (a customer's debit, a supplier's credit).
  const effect = (e: Entry) => (supplier ? (e.credit?.minor ?? 0) - (e.debit?.minor ?? 0) : (e.debit?.minor ?? 0) - (e.credit?.minor ?? 0));
  const rowsOf = (g: Group) => lines.filter((e) => groupOf(e) === g);
  const totalOf = (g: Group) => rowsOf(g).reduce((a, e) => a + effect(e), 0);
  const amountOf = (e: Entry) => (e.debit?.minor ? e.debit : e.credit) ?? { minor: 0, currency };

  const typeOf = (e: Entry) =>
    e.kind && OWN_KINDS.includes(e.kind)
      ? tr(`contacts:account.kind.${e.kind}` as 'contacts:account.kind.receipt')
      : e.kind
        ? documentKindLabel(tr, e.kind as DocumentKind, 1)
        : tr(`contacts:statement.type.${e.entityType ?? 'document'}`);
  const particulars = (e: Entry) =>
    e.taxable
      ? tr('contacts:account.taxableGst', { taxable: formatMoney(e.taxable), tax: formatMoney(e.tax ?? { ...e.taxable, minor: 0 }) })
      : e.method
        ? [paymentMethodLabel(tr, e.method as PaymentMethod), e.reference].filter(Boolean).join(' · ')
        : '';
  const open = (e: Entry) => {
    if (!e.entityId) return;
    if (e.entityType === 'document') router.push(`/(app)/documents/${e.entityId}` as never);
    else if (e.entityType === 'payment') router.push(`/(app)/payments/${e.entityId}` as never);
    else if (e.entityType === 'voucher') router.push(`/(app)/books/vouchers/${e.entityId}` as never);
  };

  const groupInfo: Record<Group, { title: string; label: string; color: string }> = {
    billed: { title: tr(supplier ? 'contacts:account.sections.bills' : 'contacts:account.sections.invoices'), label: tr(supplier ? 'contacts:account.billed' : 'contacts:account.invoiced'), color: seriesColor(t.scheme, 2) },
    debit: { title: tr('contacts:account.debitNotes'), label: tr('contacts:account.debitNotes'), color: seriesColor(t.scheme, 4) },
    credit: { title: tr('contacts:account.creditNotes'), label: tr('contacts:account.creditNotes'), color: seriesColor(t.scheme, 0) },
    // Goods sent back, apart from credit notes (a price cut, no goods).
    returns: { title: tr(supplier ? 'contacts:account.purchaseReturns' : 'contacts:account.salesReturns'), label: tr(supplier ? 'contacts:account.purchaseReturns' : 'contacts:account.salesReturns'), color: seriesColor(t.scheme, 1) },
    payments: { title: tr(supplier ? 'contacts:account.sections.payments' : 'contacts:account.sections.receipts'), label: tr(supplier ? 'contacts:account.paid' : 'contacts:account.received'), color: t.c.good },
    other: { title: tr('contacts:account.other'), label: tr('contacts:account.other'), color: seriesColor(t.scheme, 3) },
  };

  const opening = data?.openingBalance ?? { minor: 0, currency };
  const closing = data?.closingBalance ?? { minor: 0, currency };
  /** A balance with its side, as a ledger writes it: ₹3,73,737.20 Dr. */
  const sided = (m: Money) => {
    if (m.minor === 0) return formatMoney(m);
    const dr = supplier ? m.minor < 0 : m.minor > 0;
    return `${formatMoney({ ...m, minor: Math.abs(m.minor) })} ${tr(dr ? 'contacts:statement.dr' : 'contacts:statement.cr')}`;
  };
  // The balance in words, so Dr and Cr needn't be known: who owes whom.
  const balanceWords =
    closing.minor === 0
      ? tr('contacts:account.words.settled')
      : closing.minor > 0
        ? tr(supplier ? 'contacts:account.words.youOwe' : 'contacts:account.words.theyOwe')
        : tr(supplier ? 'contacts:account.words.paidAheadToThem' : 'contacts:account.words.paidAheadByThem');
  const balanceTone = closing.minor > 0 ? (supplier ? 'bad' : 'warn') : 'good';

  const breakdownRow = (key: string, color: string, label: string, sign: string, value: Money, count?: number) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {count}
        </Text>
      ) : null}
      <Text variant="small" weight="600" style={{ minWidth: 130, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
        {sign ? `${sign} ` : ''}
        {formatMoney(value)}
      </Text>
    </View>
  );

  // Opening, then each kind that has lines (Invoiced and Received always), signed as they move the balance.
  const shownGroups = GROUPS.filter((g) => rowsOf(g).length || g === 'billed' || g === 'payments');
  const summary = (
    <Card style={{ gap: t.spacing.lg }}>
      <Text variant="body" weight="700">
        {tr('contacts:account.summary')}
      </Text>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? t.spacing.xl : t.spacing.lg }}>
        <View style={{ flex: 1 }}>
          {opening.minor !== 0 || desktop ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: t.c.muted }} />
              <Text variant="small" style={{ flex: 1 }}>
                {tr('contacts:account.opening')}
              </Text>
              <Text variant="small" weight="600" style={{ minWidth: 130, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {sided(opening)}
              </Text>
            </View>
          ) : null}
          {shownGroups.map((g) => {
            const total = totalOf(g);
            return breakdownRow(g, groupInfo[g].color, groupInfo[g].label, total < 0 ? '−' : '+', { minor: Math.abs(total), currency }, rowsOf(g).length);
          })}
          <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: t.spacing.xs }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
            <Text variant="small" weight="700" style={{ flex: 1 }}>
              {tr('contacts:account.balance')}
            </Text>
            <Text variant="small" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {sided(closing)}
            </Text>
          </View>
        </View>
        {/* The answer, large: how much, and who owes whom. */}
        <View
          style={{
            width: desktop ? 280 : undefined,
            justifyContent: 'center',
            gap: 6,
            padding: t.spacing.lg,
            borderRadius: t.radius.md,
            backgroundColor: t.c.card2,
          }}
        >
          <Text variant="caption" tone="muted">
            {tr('contacts:account.balance')}
          </Text>
          <Text variant="h2" weight="700" tone={balanceTone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney({ ...closing, minor: Math.abs(closing.minor) })}
          </Text>
          <Text variant="small" weight="600">
            {balanceWords}
          </Text>
          {/* Money held ahead of any invoice, said in words so the balance isn't misread. */}
          {advance && advance.minor > 0 ? (
            <Text variant="caption" tone="muted">
              {tr(supplier ? 'contacts:account.advancePaid' : 'contacts:account.advanceHeld', { amount: formatMoney(advance) })}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );

  const table = (g: Group) => {
    const rows = rowsOf(g);
    const total = totalOf(g);
    return (
      <View key={g} style={{ gap: t.spacing.sm }}>
        {/* What the tab's lines come to, beside its colour in the summary. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: groupInfo[g].color }} />
          <Text variant="small" tone="muted">
            {tr('contacts:account.tabTotal')}
          </Text>
          <Text variant="small" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney({ minor: Math.abs(total), currency })}
          </Text>
        </View>
        {desktop ? (
          <DataTable
            scroll={false}
            pageSize={TABLE_PAGE_SIZE}
            pageSizeOptions={TABLE_PAGE_SIZES}
            tableKey={`party-account-${g}`}
            rows={rows}
            rowKey={(e) => `${e.entityType}-${e.entityId}-${e.number}`}
            rowLabel={(e) => e.number ?? ''}
            onRowPress={open}
            columns={[
              { key: 'date', header: tr('common:table.date'), width: 120, render: (e) => <Cell tone="muted">{e.date ? formatDate(e.date) : ''}</Cell> },
              { key: 'number', header: tr('common:table.number'), width: 170, render: (e) => <Cell weight="600">{e.number ?? ''}</Cell> },
              { key: 'type', header: tr('common:table.type'), width: 150, render: (e) => <Cell tone="muted">{typeOf(e)}</Cell> },
              { key: 'particulars', header: tr('contacts:account.particulars'), flex: 1, render: (e) => <Cell tone="muted">{particulars(e)}</Cell> },
              { key: 'amount', header: tr('common:table.amount'), width: 150, align: 'right', render: (e) => <Cell weight="700" mono>{formatMoney(amountOf(e))}</Cell> },
            ]}
          />
        ) : (
          <Card padded={false}>
            {rows.map((e, i) => (
              <ListRow
                key={`${e.entityType}-${e.entityId}-${e.number}`}
                title={e.number ?? ''}
                subtitle={[e.date ? formatDate(e.date) : '', typeOf(e), particulars(e)].filter(Boolean).join(' · ')}
                right={
                  <Text variant="small" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(amountOf(e))}
                  </Text>
                }
                chevron
                divider={i < rows.length - 1}
                onPress={() => open(e)}
              />
            ))}
          </Card>
        )}
      </View>
    );
  };

  if (statement.isLoading || statement.isPlaceholderData) return <ReportSkeleton />;
  if (statement.isError) {
    return <EmptyState icon="alert-circle-outline" title={tr('contacts:statement.loadFailed')} message={describeError(statement.error, tr)} actionLabel={tr('common:action.retry')} onAction={() => void statement.refetch()} />;
  }
  // A tab for each kind that has lines, with how many; the first until one is picked.
  const tabs = GROUPS.filter((g) => rowsOf(g).length);
  const tab = picked && tabs.includes(picked) ? picked : tabs[0];
  return (
    <View style={{ gap: t.spacing.xl }}>
      {summary}
      {tab ? (
        <View style={{ gap: t.spacing.md }}>
          <View style={{ alignSelf: desktop ? 'flex-start' : 'stretch', maxWidth: '100%' }}>
            <Segmented
              size="sm"
              options={tabs.map((g) => ({ value: g, label: `${groupInfo[g].title} (${rowsOf(g).length})` }))}
              value={tab}
              onChange={(v) => setPicked(v as Group)}
            />
          </View>
          {table(tab)}
        </View>
      ) : (
        <EmptyState icon="book-open-outline" title={tr('contacts:account.empty')} compact />
      )}
    </View>
  );
}
