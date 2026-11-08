import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Cell, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { useServerSave } from '@esmart/app/components/useServerSave';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBaseCurrency, useCurrentUser, useDocuments, useParty, usePayment, usePaymentAccounts } from '@esmart/app/store/selectors';
import { usePaymentRecord } from '@esmart/app/remote/queries';
import { LoadingView } from '@esmart/app/components/LoadingView';
import { RefundAdvanceSheet } from '@esmart/app/features/payments/RefundAdvanceSheet';
import { usePaymentActions } from '@esmart/app/features/payments/paymentActions';
import { detailRouteFor } from '@esmart/app/features/documents/DocumentEditor';
import type { DocumentKind } from '@esmart/core/types';
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { formatDate, formatDateTime } from '@esmart/core/lib/date';
import { useGoBack } from '@esmart/app/navigation/useGoBack';

type Allocation = { documentId: string; documentNumber: string; documentKind?: DocumentKind; amount: ReturnType<typeof money> };

/** A small label over a value, for the facts along the top. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 4 }}>
      <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text weight="600" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

/**
 * One payment, laid out for a wide window: the amount and who it is with on
 * top, then what it was applied to beside the details, the party and the
 * notes. Same data and actions as the phone screen
 * (`@esmart/app/screens/(app)/payments/[id]`).
 */
export function PaymentDetailDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'sales', 'purchases']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave } = useServerSave();
  const documents = useDocuments();
  // The server lets these roles change a payment, and only an owner or admin delete one.
  const role = useCurrentUser()?.role ?? '';
  const canEdit = ['owner', 'admin', 'accountant'].includes(role);
  const canDelete = ['owner', 'admin'].includes(role);

  const { id } = useLocalSearchParams<{ id: string }>();
  const payment = usePayment(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = usePaymentRecord(id);
  const party = useParty(payment?.partyId);
  const accounts = usePaymentAccounts();
  const baseCurrency = useBaseCurrency();
  const removePayment = useAppStore((s) => s.removePayment);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refunding, setRefunding] = useState(false);
  // A refund names the receipt it paid back; fetched so its number shows.
  const refundOf = usePaymentRecord(payment?.refundOf).data;
  const { sharePdf, adjustAdvance, pdfBusy, adjusting } = usePaymentActions(payment);

  if (!payment && remote.isLoading) return <LoadingView />;
  if (!payment) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.payment') }} />
        <EmptyState illustration="not-found" icon="cash-remove" title={tr('common:notFound.title')} message={tr('common:notFound.payment')} />
      </View>
    );
  }

  const isIn = payment.direction === 'received';
  const account = accounts.find((a) => a.id === payment.accountId);
  // Money paid out is the business doing what it meant to, not an error: neutral, not red.
  const tone = isIn ? t.c.good : t.c.text;
  const allocated = money(payment.amount.minor - payment.unallocated.minor, payment.amount.currency);

  // Date, method, account and reference are along the top already; this card has the rest.
  const details = [
    ...(payment.advanceTax
      ? [
          {
            label: tr('sales:payment.serviceAdvance'),
            value: `GST ${payment.advanceTax.rate}% · ${INDIAN_STATES.find((st) => st.code === payment.advanceTax!.placeOfSupplyStateCode)?.name ?? payment.advanceTax.placeOfSupplyStateCode}`,
          },
        ]
      : []),
    ...(payment.currency !== baseCurrency
      ? [{ label: tr('common:totals.exchangeRate'), value: `1 ${payment.currency} = ${payment.exchangeRate.toFixed(4)} ${baseCurrency}` }]
      : []),
    { label: tr('sales:payment.recordedAt'), value: formatDateTime(payment.createdAt) },
  ];

  // A debit note or an opening balance opens as itself, not as an invoice or bill.
  const openDocument = (a: Allocation) => {
    const kind = a.documentKind ?? documents.find((d) => d.id === a.documentId)?.kind;
    router.push((kind ? detailRouteFor(kind, a.documentId) : isIn ? `/(app)/sales/invoices/${a.documentId}` : `/(app)/purchases/bills/${a.documentId}`) as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: payment.number,
          // The page actions together, top right, as on an expense or a document.
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {canDelete ? <Button title={tr('sales:payment.delete')} variant="danger" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} /> : null}
              <Button title={tr('sales:payment.downloadPdf')} variant="secondary" icon="file-pdf-box" onPress={() => void sharePdf()} loading={pdfBusy} disabled={pdfBusy} />
              {canEdit ? <Button title={tr('common:action.edit')} icon="pencil-outline" onPress={() => router.push(`/(app)/payments/edit/${payment.id}` as never)} /> : null}
            </View>
          ),
        }}
      />

      {/* The same side gutter as every other page. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 48, gap: t.spacing.lg }}>
        {/* The headline: amount, who, and the facts that identify it */}
        <Card style={{ padding: t.spacing.xxl, gap: t.spacing.xl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xl }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: isIn ? t.c.goodSoft : t.c.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={isIn ? 'arrow-down' : 'arrow-up'} size={30} color={isIn ? t.c.good : t.c.primary} />
            </View>

            <View style={{ flexGrow: 1, flexBasis: 280, gap: 4 }}>
              <SectionTitle>{isIn ? tr('sales:payment.received') : tr('sales:payment.made')}</SectionTitle>
              <Text variant="display" weight="700" style={{ color: tone }}>
                {formatMoney(payment.amount)}
              </Text>
              <Text tone="muted">
                {tr(isIn ? 'sales:payment.receivedFrom' : 'sales:payment.paidTo', { name: party?.name ?? tr('common:placeholder.unknown') })}
              </Text>
            </View>

          </View>

          <View style={{ height: 1, backgroundColor: t.c.line }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xl }}>
            <Fact label={tr('common:table.date')} value={formatDate(payment.date)} />
            <Fact label={tr('common:table.method')} value={paymentMethodLabel(tr, payment.method)} />
            <Fact label={isIn ? tr('sales:payment.depositedInto') : tr('purchases:form.paidFrom')} value={account?.name ?? '—'} />
            <Fact label={tr('common:table.reference')} value={payment.reference || '—'} />
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'flex-start' }}>
          {/* What it settled */}
          <View style={{ flexGrow: 3, flexBasis: 420, gap: t.spacing.md, minWidth: 0 }}>
            <SectionTitle>{tr('sales:payment.appliedTo')}</SectionTitle>
            {payment.allocations.length === 0 ? (
              <Card padded={false}>
                <EmptyState
                  icon="wallet-outline"
                  title={payment.refundOf ? tr('sales:refund.emptyTitle') : tr('sales:payment.heldAsAdvance')}
                  message={payment.refundOf ? tr('sales:refund.emptyBody') : tr('sales:payment.advanceBody')}
                  compact
                />
              </Card>
            ) : (
              <DataTable<Allocation>
                pageSize={TABLE_PAGE_SIZE}
                scroll={false}
                columns={[
                  {
                    key: 'document',
                    header: tr('common:table.number'),
                    flex: 2,
                    render: (a) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                        <Icon name="file-document-outline" size={18} color={t.c.primary} />
                        <Cell weight="600">{a.documentNumber}</Cell>
                      </View>
                    ),
                  },
                  {
                    key: 'amount',
                    header: tr('common:table.applied'),
                    flex: 1,
                    align: 'right',
                    render: (a) => (
                      <Cell weight="700" mono>
                        {formatMoney(a.amount)}
                      </Cell>
                    ),
                  },
                ]}
                rows={payment.allocations}
                rowKey={(a) => a.documentId}
                onRowPress={openDocument}
                rowLabel={(a) => tr('sales:payment.openDocument', { number: a.documentNumber })}
                footer={{
                  document: <Cell weight="700">{tr('sales:payment.totalApplied')}</Cell>,
                  amount: (
                    <Cell weight="700" mono>
                      {formatMoney(allocated)}
                    </Cell>
                  ),
                }}
              />
            )}

            {payment.unallocated.minor > 0 ? (
              <Card variant="flat" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 260 }}>
                  <Icon name="wallet-outline" size={20} color={t.c.warn} />
                  <Text variant="small" style={{ flex: 1 }}>
                    {tr('sales:payment.unallocatedNote', { amount: formatMoney(payment.unallocated) })}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginLeft: 'auto' }}>
                  {isIn ? <Button title={tr('sales:refund.action')} size="sm" variant="ghost" icon="cash-refund" onPress={() => setRefunding(true)} /> : null}
                  <Button title={tr('sales:payment.adjustAdvance')} size="sm" variant="secondary" loading={adjusting} disabled={adjusting} onPress={() => void adjustAdvance()} />
                </View>
              </Card>
            ) : null}

            {payment.refundOf ? (
              <Card onPress={() => router.push(`/(app)/payments/${payment.refundOf}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <Icon name="cash-refund" size={20} color={t.c.primary} />
                <Text variant="small" style={{ flex: 1 }}>
                  {tr('sales:refund.of', { number: refundOf?.number ?? '…' })}
                </Text>
                <Icon name="chevron-right" size={18} color={t.c.muted} />
              </Card>
            ) : null}

            {payment.refunds?.length ? (
              <Card padded={false}>
                <Text variant="caption" tone="muted" weight="600" style={{ padding: t.spacing.lg, paddingBottom: t.spacing.sm }}>
                  {tr('sales:refund.listTitle')}
                </Text>
                {payment.refunds.map((r) => (
                  <Pressable
                    key={r.paymentId}
                    onPress={() => router.push(`/(app)/payments/${r.paymentId}`)}
                    accessibilityRole="button"
                    style={(state) => {
                      const { hovered, focused } = state as WebPressState;
                      return [{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, backgroundColor: hovered ? t.c.card2 : 'transparent' }, focusRing(t, focused)];
                    }}
                  >
                    <Text variant="small" weight="600" style={{ flex: 1 }}>
                      {`${r.number ?? ''} · ${formatDate(r.date)}`}
                    </Text>
                    <Text variant="small" weight="700">
                      {formatMoney(r.amount)}
                    </Text>
                    <Icon name="chevron-right" size={18} color={t.c.muted} />
                  </Pressable>
                ))}
              </Card>
            ) : null}

            {payment.fxGainLoss && payment.fxGainLoss.minor !== 0 ? (
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small" tone="muted">
                  {payment.fxGainLoss.minor >= 0 ? tr('sales:payment.fxGainSettlement') : tr('sales:payment.fxLossSettlement')}
                </Text>
                <Text variant="small" weight="700" tone={payment.fxGainLoss.minor >= 0 ? 'good' : 'bad'}>
                  {formatMoney(payment.fxGainLoss, { signed: true })}
                </Text>
              </Card>
            ) : null}
          </View>

          {/* The record, the party and the notes */}
          <View style={{ flexGrow: 2, flexBasis: 320, gap: t.spacing.lg, minWidth: 0 }}>
            <View style={{ gap: t.spacing.md }}>
              <SectionTitle>{tr('sales:detail.tabDetails')}</SectionTitle>
              <Card style={{ gap: t.spacing.md }}>
                {details.map((r, i) => (
                  <View
                    key={r.label}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: t.spacing.md,
                      paddingBottom: i < details.length - 1 ? t.spacing.md : 0,
                      borderBottomWidth: i < details.length - 1 ? 1 : 0,
                      borderBottomColor: t.c.line,
                    }}
                  >
                    <Text variant="small" tone="muted">
                      {r.label}
                    </Text>
                    <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
                      {r.value}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>

            {party ? (
              <View style={{ gap: t.spacing.md }}>
                <SectionTitle>{party.kind !== 'supplier' ? tr('common:table.customer') : tr('common:table.supplier')}</SectionTitle>
                <Pressable
                  onPress={() =>
                    router.push(party.kind !== 'supplier' ? `/(app)/contacts/customers/${party.id}` : `/(app)/contacts/suppliers/${party.id}`)
                  }
                  accessibilityRole="link"
                  accessibilityLabel={party.name}
                  style={(state) => {
                    const { hovered, focused } = state as WebPressState;
                    return [
                      {
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        padding: t.spacing.lg,
                        borderRadius: t.radius.lg,
                        backgroundColor: hovered ? t.c.card2 : t.c.card,
                        borderWidth: t.scheme === 'dark' ? 1 : 0,
                        borderColor: t.c.line,
                      },
                      focusRing(t, focused),
                    ];
                  }}
                >
                  <Avatar name={party.name} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="600" numberOfLines={1}>
                      {party.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {party.phone ?? party.email ?? party.code}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={t.c.muted} />
                </Pressable>
              </View>
            ) : null}

            {payment.notes ? (
              <View style={{ gap: t.spacing.md }}>
                <SectionTitle>{tr('sales:payment.notes')}</SectionTitle>
                <Card>
                  <Text variant="small" style={{ lineHeight: 20 }}>
                    {payment.notes}
                  </Text>
                </Card>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {isIn && refunding ? <RefundAdvanceSheet receipt={payment} visible onClose={() => setRefunding(false)} onSaved={(rid) => router.push(`/(app)/payments/${rid}`)} /> : null}

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('sales:payment.deleteTitle')}
        message={tr(isIn ? 'sales:payment.deleteMessage' : 'sales:payment.deleteMessagePaid')}
        confirmLabel={tr('sales:payment.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void serverSave(() => removePayment(payment.id), tr('sales:payment.deleted'), { icon: 'cash-remove' }).then((res) => {
            if (res) goBack(payment.direction === 'received' ? '/(app)/payments/received' : '/(app)/payments/made');
          });
        }}
      />
    </View>
  );
}
