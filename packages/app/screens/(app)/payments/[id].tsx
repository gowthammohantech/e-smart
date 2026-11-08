import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { useServerSave } from '../../../components/useServerSave';
import { useAppStore } from '../../../store/appStore';
import { useBaseCurrency, useDocuments, useParty, usePayment, usePaymentAccounts } from '../../../store/selectors';
import { adjustAdvancesFor, usePaymentRecord } from '../../../remote/queries';
import { describeError } from '../../../remote/errors';
import { LoadingView } from '../../../components/LoadingView';
import { detailRouteFor } from '../../../features/documents/DocumentEditor';
import { RefundAdvanceSheet } from '../../../features/payments/RefundAdvanceSheet';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { INDIAN_STATES } from '@esmart/core/data/masters';
import { formatDate, formatDateTime } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../../navigation/useGoBack';

export default function PaymentDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'sales', 'purchases']);
  const router = useRouter();
  const goBack = useGoBack();
  const toast = useToast();
  const { run: serverSave } = useServerSave();

  const { id } = useLocalSearchParams<{ id: string }>();
  const documents = useDocuments();
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

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: payment.number }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: isIn ? t.c.goodSoft : t.c.badSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={isIn ? 'arrow-down' : 'arrow-up'} size={27} color={isIn ? t.c.good : t.c.bad} />
          </View>
          <Text variant="h1" weight="700" tone={isIn ? 'good' : 'bad'}>
            {formatMoney(payment.amount)}
          </Text>
          <Text variant="small" tone="muted">
            {tr(isIn ? 'sales:payment.receivedFrom' : 'sales:payment.paidTo', { name: party?.name ?? tr('common:placeholder.unknown') })}
          </Text>
          <Badge label={payment.number} tone="neutral" />
        </Card>

        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          {[
            { label: tr('common:table.date'), value: formatDate(payment.date) },
            { label: tr('common:table.method'), value: paymentMethodLabel(tr, payment.method) },
            { label: isIn ? tr('sales:payment.depositedInto') : tr('purchases:form.paidFrom'), value: account?.name ?? '—' },
            ...(payment.reference ? [{ label: tr('common:table.reference'), value: payment.reference }] : []),
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
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
                {r.value}
              </Text>
            </View>
          ))}
        </Card>

        {party ? (
          <Card
            onPress={() =>
              router.push(party.kind !== 'supplier' ? `/(app)/contacts/customers/${party.id}` : `/(app)/contacts/suppliers/${party.id}`)
            }
            style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
          >
            <Avatar name={party.name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="600">
                {party.name}
              </Text>
              <Text variant="caption" tone="muted">
                {party.phone ?? party.email ?? party.code}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={t.c.muted} />
          </Card>
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('sales:payment.appliedTo')}</Text>
        <Card padded={false}>
          {payment.allocations.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title={payment.refundOf ? tr('sales:refund.emptyTitle') : tr('sales:payment.heldAsAdvance')}
              message={payment.refundOf ? tr('sales:refund.emptyBody') : tr('sales:payment.advanceBody')}
              compact
            />
          ) : (
            payment.allocations.map((a, i) => (
              <Pressable
                key={a.documentId}
                onPress={() => {
                  // A debit note opens as itself, not as an invoice or bill.
                  const kind = a.documentKind ?? documents.find((d) => d.id === a.documentId)?.kind;
                  router.push((kind ? detailRouteFor(kind, a.documentId) : isIn ? `/(app)/sales/invoices/${a.documentId}` : `/(app)/purchases/bills/${a.documentId}`) as never);
                }}
                accessibilityRole="button"
                accessibilityLabel={tr('sales:payment.openDocument', { number: a.documentNumber })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < payment.allocations.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                  backgroundColor: pressed ? t.c.card2 : 'transparent',
                })}
              >
                <Icon name="file-document-outline" size={20} color={t.c.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="600">
                    {a.documentNumber}
                  </Text>
                  {(['tdsDeducted', 'discount', 'writeOff'] as const)
                    .filter((k) => a[k]?.minor)
                    .map((k) => (
                      <Text key={k} variant="caption" tone="muted">
                        {`${tr(`sales:payment.adjustment.${k}`)}: ${formatMoney(a[k]!)}`}
                      </Text>
                    ))}
                </View>
                <Text variant="body" weight="700">
                  {formatMoney(a.amount)}
                </Text>
                <Icon name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))
          )}
        </Card>

        {payment.unallocated.minor > 0 ? (
          <Card variant="flat" style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <Icon name="wallet-outline" size={20} color={t.c.warn} />
            <Text variant="small" style={{ flex: 1 }}>
              {tr('sales:payment.unallocatedNote', { amount: formatMoney(payment.unallocated) })}
            </Text>
            {isIn ? <Button title={tr('sales:refund.action')} size="sm" variant="ghost" icon="cash-refund" onPress={() => setRefunding(true)} /> : null}
            <Button
              title={tr('sales:payment.adjustAdvance')}
              size="sm"
              variant="secondary"
              onPress={async () => {
                // On the server: notes too, and a service advance's GST.
                try {
                  const applied = await adjustAdvancesFor(payment.partyId, payment.direction, undefined);
                  toast.show(
                    applied.length
                      ? tr('sales:payment.advanceAdjusted', { amount: applied.map((m) => formatMoney(m)).join(', ') })
                      : tr('sales:payment.advanceNothingToAdjust'),
                    applied.length ? 'success' : 'info',
                  );
                } catch (err) {
                  toast.show(describeError(err, tr), 'error');
                }
              }}
            />
          </Card>
        ) : null}

        {payment.refundOf ? (
          <Card
            onPress={() => router.push(`/(app)/payments/${payment.refundOf}`)}
            style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
          >
            <Icon name="cash-refund" size={20} color={t.c.primary} />
            <Text variant="small" style={{ flex: 1 }}>
              {tr('sales:refund.of', { number: refundOf?.number ?? '…' })}
            </Text>
            <Icon name="chevron-right" size={18} color={t.c.muted} />
          </Card>
        ) : null}

        {payment.refunds?.length ? (
          <Card padded={false} style={{ marginTop: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ padding: t.spacing.lg, paddingBottom: t.spacing.sm }}>
              {tr('sales:refund.listTitle')}
            </Text>
            {payment.refunds.map((r) => (
              <Pressable
                key={r.paymentId}
                onPress={() => router.push(`/(app)/payments/${r.paymentId}`)}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, backgroundColor: pressed ? t.c.card2 : 'transparent' })}
              >
                <Text variant="small" weight="600" style={{ flex: 1 }}>
                  {`${r.number ?? ''} · ${formatDate(r.date)}`}
                </Text>
                <Text variant="small" weight="700" tone="bad">
                  {formatMoney(r.amount)}
                </Text>
                <Icon name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {payment.fxGainLoss && payment.fxGainLoss.minor !== 0 ? (
          <Card style={{ marginTop: t.spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small" tone="muted">
              {payment.fxGainLoss.minor >= 0 ? tr('sales:payment.fxGainSettlement') : tr('sales:payment.fxLossSettlement')}
            </Text>
            <Text variant="small" weight="700" tone={payment.fxGainLoss.minor >= 0 ? 'good' : 'bad'}>
              {formatMoney(payment.fxGainLoss, { signed: true })}
            </Text>
          </Card>
        ) : null}

        {payment.notes ? (
          <Card style={{ marginTop: t.spacing.md, gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">{tr('sales:payment.notes')}</Text>
            <Text variant="small" style={{ lineHeight: 20 }}>
              {payment.notes}
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button
          title={tr('sales:payment.deletePayment')}
          variant="danger"
          icon="trash-can-outline"
          onPress={() => setConfirmDelete(true)}
          fullWidth
        />
      </View>

      {isIn && refunding ? <RefundAdvanceSheet receipt={payment} visible onClose={() => setRefunding(false)} onSaved={(rid) => router.push(`/(app)/payments/${rid}`)} /> : null}

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('sales:payment.deleteTitle')}
        message={tr('sales:payment.deleteMessage')}
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
