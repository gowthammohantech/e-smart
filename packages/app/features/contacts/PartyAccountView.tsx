import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Cell, DataTable, TABLE_PAGE_SIZE, TABLE_PAGE_SIZES } from '@esmart/ui/components/DataTable';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { documentKindLabel, paymentMethodLabel } from '@esmart/core/labels';
import { financialYearOf, formatDate, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import type { Money } from '@esmart/core/lib/money';
import type { DocumentKind, Party, PaymentMethod } from '@esmart/core/types';
import { usePartyStatement } from '../../remote/parties';
import { describeError } from '../../remote/errors';
import { useActiveCompany } from '../../store/selectors';
import { ReportSkeleton } from '../../components/ScreenSkeleton';

type Entry = NonNullable<ReturnType<typeof usePartyStatement>['data']>['entries'] extends (infer E)[] | undefined ? E : never;
type Group = 'billed' | 'debit' | 'credit' | 'payments' | 'other';

/** Which part of the summary each line counts in. */
const GROUP_OF: Record<string, Group> = {
  invoice: 'billed',
  openingInvoice: 'billed',
  purchaseBill: 'billed',
  openingBill: 'billed',
  debitNote: 'debit',
  supplierDebitNote: 'debit',
  creditNote: 'credit',
  salesReturn: 'credit',
  supplierCreditNote: 'credit',
  purchaseReturn: 'credit',
  receipt: 'payments',
  advanceReceipt: 'payments',
  payment: 'payments',
  refund: 'payments',
};
const OWN_KINDS = ['tds', 'receipt', 'advanceReceipt', 'payment', 'refund', 'journal'];

/**
 * A party's account on their page, as a statement of account reads: the opening balance, then what
 * was invoiced, the debit notes, the credit notes and returns, and what was received, adding up to the
 * balance; under it each line with its type, particulars (taxable value and GST, or how it was paid),
 * debit, credit and the balance after it. The figures are the server's statement's.
 */
export function PartyAccountView({ party, advance }: { party: Party; advance?: Money }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const { t: tr } = useTranslation(['contacts', 'common', 'books']);
  const company = useActiveCompany();
  const [from, setFrom] = useState(() => financialYearOf(today(), company.fiscalYearStartMonth).start);
  const [to, setTo] = useState(today());
  const range = { from, to: to < from ? from : to };
  const statement = usePartyStatement(party.id, range);
  // A supplier's account reads the other way: positive is what we owe them, a credit balance.
  const supplier = party.kind === 'supplier';

  /** A balance with its side, as a ledger writes it: ₹3,73,737.20 Dr. */
  const sided = (m?: Money) => {
    if (!m) return '—';
    if (m.minor === 0) return formatMoney(m);
    const dr = supplier ? m.minor < 0 : m.minor > 0;
    return `${formatMoney({ ...m, minor: Math.abs(m.minor) })} ${tr(dr ? 'contacts:statement.dr' : 'contacts:statement.cr')}`;
  };
  const typeOf = (e: Entry) =>
    e.entityType === 'opening'
      ? tr('contacts:statement.openingEntry')
      : e.kind && OWN_KINDS.includes(e.kind)
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
    if (!e.entityId || e.entityType === 'opening') return;
    if (e.entityType === 'document') router.push(`/(app)/documents/${e.entityId}` as never);
    else if (e.entityType === 'payment') router.push(`/(app)/payments/${e.entityId}` as never);
    else if (e.entityType === 'voucher') router.push(`/(app)/books/vouchers/${e.entityId}` as never);
  };

  const data = statement.data;
  const entries = data?.entries ?? [];
  const lines = entries.filter((e) => e.entityType !== 'opening');
  const currency = data?.closingBalance?.currency ?? party.currency;
  // What each line does to the balance: up for what they owe us more (a customer's debit, a supplier's credit).
  const effect = (e: Entry) => (supplier ? (e.credit?.minor ?? 0) - (e.debit?.minor ?? 0) : (e.debit?.minor ?? 0) - (e.credit?.minor ?? 0));
  const groupTotal = (g: Group) => lines.filter((e) => (GROUP_OF[e.kind ?? ''] ?? 'other') === g).reduce((a, e) => a + effect(e), 0);
  const totalDebit = lines.reduce((a, e) => a + (e.debit?.minor ?? 0), 0);
  const totalCredit = lines.reduce((a, e) => a + (e.credit?.minor ?? 0), 0);

  // The summary as a sum, left to right: Opening + Invoiced + Debit notes − Credit notes − Received = Balance.
  const steps = [
    { key: 'opening', label: tr('contacts:account.opening'), minor: data?.openingBalance?.minor ?? 0, color: t.c.muted, opening: true },
    { key: 'billed', label: tr(supplier ? 'contacts:account.billed' : 'contacts:account.invoiced'), minor: groupTotal('billed'), color: seriesColor(t.scheme, 2) },
    { key: 'debit', label: tr('contacts:account.debitNotes'), minor: groupTotal('debit'), color: seriesColor(t.scheme, 4) },
    { key: 'credit', label: tr('contacts:account.creditNotes'), minor: groupTotal('credit'), color: seriesColor(t.scheme, 0) },
    { key: 'payments', label: tr(supplier ? 'contacts:account.paid' : 'contacts:account.received'), minor: groupTotal('payments'), color: t.c.good },
    { key: 'other', label: tr('contacts:account.other'), minor: groupTotal('other'), color: seriesColor(t.scheme, 3) },
  ].filter((s) => s.opening || s.minor !== 0 || ['billed', 'payments'].includes(s.key));
  const closing = data?.closingBalance;
  const owing = (closing?.minor ?? 0) > 0;

  const tile = (s: { key: string; label: string; amount: string; color: string; strong?: boolean }) => (
    <View
      key={s.key}
      style={{
        minWidth: desktop ? 130 : 140,
        flexGrow: 1,
        flexBasis: desktop ? 0 : 140,
        gap: 4,
        padding: t.spacing.md,
        borderRadius: t.radius.md,
        backgroundColor: s.strong ? t.c.chip : t.c.card2,
        borderTopWidth: 3,
        borderTopColor: s.color,
      }}
    >
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {s.label}
      </Text>
      <Text variant={s.strong ? 'title' : 'body'} weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontVariant: ['tabular-nums'] }}>
        {s.amount}
      </Text>
    </View>
  );
  const operator = (sign: string, key: string) => (
    <Text key={key} variant="title" tone="muted" weight="600" style={{ alignSelf: 'center', width: 14, textAlign: 'center' }}>
      {sign}
    </Text>
  );

  const summary = (
    <Card style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
        <Text variant="body" weight="700">
          {tr('contacts:account.summary')}
        </Text>
        <Text variant="caption" tone="muted">
          {`${formatDate(range.from)} – ${formatDate(range.to)}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, alignItems: 'stretch' }}>
        {steps.flatMap((s, i) => [
          ...(i === 0 ? [] : [operator(s.minor < 0 ? '−' : '+', `op-${s.key}`)]),
          tile({ key: s.key, label: s.label, amount: s.opening ? sided({ minor: s.minor, currency }) : formatMoney({ minor: Math.abs(s.minor), currency }), color: s.color }),
        ])}
        {operator('=', 'op-balance')}
        {tile({ key: 'balance', label: tr('contacts:account.balance'), amount: sided(closing), color: owing ? t.c.warn : t.c.good, strong: true })}
      </View>
      {/* Money held ahead of any invoice: part of the balance above, said in words so it isn't mistaken. */}
      {advance && advance.minor > 0 ? (
        <Text variant="caption" tone="muted">
          {tr(supplier ? 'contacts:account.advancePaid' : 'contacts:account.advanceHeld', { amount: formatMoney(advance) })}
        </Text>
      ) : null}
    </Card>
  );

  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <View style={{ flex: 1, maxWidth: desktop ? 220 : undefined }}>
          <DateField label={tr('contacts:statement.from')} value={from} onChange={setFrom} maximumDate={new Date()} />
        </View>
        <View style={{ flex: 1, maxWidth: desktop ? 220 : undefined }}>
          <DateField label={tr('contacts:statement.to')} value={to} onChange={setTo} maximumDate={new Date()} />
        </View>
      </View>

      {/* A new range still loading: the old range's figures would sit under the new dates. */}
      {statement.isLoading || statement.isPlaceholderData ? (
        <ReportSkeleton />
      ) : statement.isError ? (
        <EmptyState icon="alert-circle-outline" title={tr('contacts:statement.loadFailed')} message={describeError(statement.error, tr)} actionLabel={tr('common:action.retry')} onAction={() => void statement.refetch()} />
      ) : (
        <>
          {summary}
          {!lines.length ? (
            <EmptyState icon="book-open-outline" title={tr('contacts:statement.empty')} message={tr('contacts:statement.emptyBody')} compact />
          ) : desktop ? (
            // As the statement of account: each line with its type and particulars, debit, credit and the balance after it.
            <DataTable
              scroll={false}
              pageSize={TABLE_PAGE_SIZE}
              pageSizeOptions={TABLE_PAGE_SIZES}
              tableKey="party-account"
              rows={entries}
              rowKey={(e) => `${e.entityType}-${e.entityId}-${entries.indexOf(e)}`}
              rowLabel={(e) => e.number ?? tr('contacts:statement.openingEntry')}
              canPress={(e) => e.entityType !== 'opening'}
              onRowPress={open}
              columns={[
                { key: 'date', header: tr('common:table.date'), width: 120, render: (e) => <Cell tone="muted">{e.date ? formatDate(e.date) : ''}</Cell> },
                { key: 'type', header: tr('common:table.type'), width: 150, render: (e) => <Cell weight={e.entityType === 'opening' ? '600' : '400'}>{typeOf(e)}</Cell> },
                { key: 'number', header: tr('common:table.number'), width: 160, render: (e) => <Cell weight="600">{e.entityType === 'opening' ? '' : (e.number ?? '')}</Cell> },
                { key: 'particulars', header: tr('contacts:account.particulars'), flex: 1, render: (e) => <Cell tone="muted">{particulars(e)}</Cell> },
                { key: 'debit', header: tr('books:accounts.debitSide'), width: 140, align: 'right', render: (e) => <Cell mono>{e.debit?.minor ? formatMoney(e.debit) : ''}</Cell> },
                { key: 'credit', header: tr('books:accounts.creditSide'), width: 140, align: 'right', render: (e) => <Cell mono>{e.credit?.minor ? formatMoney(e.credit) : ''}</Cell> },
                { key: 'balance', header: tr('books:accounts.balance'), width: 170, align: 'right', render: (e) => <Cell weight="600" mono>{sided(e.balance)}</Cell> },
              ]}
              footer={{
                particulars: <Cell weight="700">{tr('contacts:account.total')}</Cell>,
                debit: <Cell weight="700" mono>{formatMoney({ minor: totalDebit, currency })}</Cell>,
                credit: <Cell weight="700" mono>{formatMoney({ minor: totalCredit, currency })}</Cell>,
                balance: <Cell weight="700" mono>{sided(closing)}</Cell>,
              }}
            />
          ) : (
            <Card padded={false}>
              {entries.map((e, i) => (
                <ListRow
                  key={`${e.entityType}-${e.entityId}-${i}`}
                  title={e.entityType === 'opening' ? tr('contacts:statement.openingEntry') : `${typeOf(e)} · ${e.number ?? ''}`}
                  subtitle={[e.date ? formatDate(e.date) : '', particulars(e)].filter(Boolean).join(' · ')}
                  right={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                        {e.debit?.minor ? `${formatMoney(e.debit)} ${tr('contacts:statement.dr')}` : e.credit?.minor ? `${formatMoney(e.credit)} ${tr('contacts:statement.cr')}` : ''}
                      </Text>
                      <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                        {sided(e.balance)}
                      </Text>
                    </View>
                  }
                  chevron={e.entityType !== 'opening'}
                  divider={i < entries.length - 1}
                  onPress={e.entityType === 'opening' ? undefined : () => open(e)}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </View>
  );
}
