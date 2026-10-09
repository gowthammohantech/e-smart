import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBaseCurrency, useParty, usePayment, usePaymentAccounts } from '@esmart/app/store/selectors';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { formatDate, formatDateTime } from '@esmart/core/lib/date';

type Allocation = { documentId: string; documentNumber: string; amount: ReturnType<typeof money> };

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
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'sales']);
  const router = useRouter();
  const toast = useToast();

  const { id } = useLocalSearchParams<{ id: string }>();
  const payment = usePayment(id);
  const party = useParty(payment?.partyId);
  const accounts = usePaymentAccounts();
  const baseCurrency = useBaseCurrency();
  const removePayment = useAppStore((s) => s.removePayment);
  const applyAdvances = useAppStore((s) => s.applyAdvances);

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!payment) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.payment') }} />
        <EmptyState illustration="not-found" icon="cash-remove" title={tr('common:notFound.title')} message={tr('common:notFound.payment')} />
      </View>
    );
  }

  const isIn = payment.direction === 'received';
  const account = accounts.find((a) => a.id === payment.accountId);
  const tone = isIn ? t.c.good : t.c.bad;
  const allocated = money(payment.amount.minor - payment.unallocated.minor, payment.amount.currency);

  const details = [
    { label: 'Date', value: formatDate(payment.date) },
    { label: 'Method', value: paymentMethodLabel(tr, payment.method) },
    { label: isIn ? 'Deposited into' : 'Paid from', value: account?.name ?? '—' },
    ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : []),
    ...(payment.currency !== baseCurrency
      ? [{ label: 'Exchange rate', value: `1 ${payment.currency} = ${payment.exchangeRate.toFixed(4)} ${baseCurrency}` }]
      : []),
    { label: 'Recorded', value: formatDateTime(payment.createdAt) },
  ];

  const openDocument = (a: Allocation) =>
    router.push(isIn ? `/(app)/sales/invoices/${a.documentId}` : `/(app)/purchases/bills/${a.documentId}`);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: payment.number }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }}>
        {/* The headline: amount, who, and the facts that identify it */}
        <Card style={{ padding: t.spacing.xxl, gap: t.spacing.xl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xl }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: isIn ? t.c.goodSoft : t.c.badSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={isIn ? 'arrow-down' : 'arrow-up'} size={30} color={tone} />
            </View>

            <View style={{ flexGrow: 1, flexBasis: 280, gap: 4 }}>
              <SectionTitle>{isIn ? 'Payment received' : 'Payment made'}</SectionTitle>
              <Text variant="display" weight="700" style={{ color: tone }}>
                {formatMoney(payment.amount)}
              </Text>
              <Text tone="muted">
                {isIn ? 'Received from' : 'Paid to'}{' '}
                <Text weight="600">{party?.name ?? 'Unknown'}</Text>
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', gap: t.spacing.md }}>
              <Badge label={payment.number} tone="neutral" />
              <Button
                title={tr('sales:payment.deletePayment')}
                variant="danger"
                size="sm"
                icon="trash-can-outline"
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: t.c.line }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xl }}>
            <Fact label="Date" value={formatDate(payment.date)} />
            <Fact label="Method" value={paymentMethodLabel(tr, payment.method)} />
            <Fact label={isIn ? 'Deposited into' : 'Paid from'} value={account?.name ?? '—'} />
            <Fact label="Reference" value={payment.reference || '—'} />
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
                  title={tr('sales:payment.heldAsAdvance')}
                  message={tr('sales:payment.advanceBody')}
                  compact
                />
              </Card>
            ) : (
              <DataTable<Allocation>
                scroll={false}
                columns={[
                  {
                    key: 'document',
                    header: isIn ? 'Invoice' : 'Bill',
                    flex: 2,
                    render: (a) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                        <MaterialCommunityIcons name="file-document-outline" size={18} color={t.c.primary} />
                        <Cell weight="600">{a.documentNumber}</Cell>
                      </View>
                    ),
                  },
                  {
                    key: 'amount',
                    header: 'Applied',
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
                rowLabel={(a) => `Open ${a.documentNumber}`}
                footer={{
                  document: <Cell weight="700">Total applied</Cell>,
                  amount: (
                    <Cell weight="700" mono>
                      {formatMoney(allocated)}
                    </Cell>
                  ),
                }}
              />
            )}

            {payment.unallocated.minor > 0 ? (
              <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <MaterialCommunityIcons name="wallet-outline" size={20} color={t.c.warn} />
                <Text variant="small" style={{ flex: 1 }}>
                  {formatMoney(payment.unallocated)} is unallocated and available as an advance.
                </Text>
                <Button
                  title={tr('sales:payment.adjustAdvance')}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    const applied = applyAdvances(payment.partyId, payment.direction);
                    toast.show(
                      applied.length
                        ? tr('sales:payment.advanceAdjusted', { amount: applied.map((m) => formatMoney(m)).join(', ') })
                        : tr('sales:payment.advanceNothingToAdjust'),
                      applied.length ? 'success' : 'info',
                    );
                  }}
                />
              </Card>
            ) : null}

            {payment.fxGainLoss && payment.fxGainLoss.minor !== 0 ? (
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small" tone="muted">
                  FX {payment.fxGainLoss.minor >= 0 ? 'gain' : 'loss'} on settlement
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
              <SectionTitle>Details</SectionTitle>
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
                <SectionTitle>{party.kind === 'customer' ? 'Customer' : 'Supplier'}</SectionTitle>
                <Pressable
                  onPress={() =>
                    router.push(party.kind === 'customer' ? `/(app)/contacts/customers/${party.id}` : `/(app)/contacts/suppliers/${party.id}`)
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
                  <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
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

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('sales:payment.deleteTitle')}
        message={tr('sales:payment.deleteMessage')}
        confirmLabel={tr('sales:payment.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removePayment(payment.id);
          setConfirmDelete(false);
          toast.show(tr('sales:payment.deleted'), 'success');
          router.back();
        }}
      />
    </View>
  );
}
