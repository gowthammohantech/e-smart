import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useParty, usePayment, usePaymentAccounts } from '@/store/selectors';
import { paymentMethodLabel } from '@/i18n/labels';
import { formatMoney } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/date';

export default function PaymentDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: payment.number }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
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
            <MaterialCommunityIcons name={isIn ? 'arrow-down' : 'arrow-up'} size={27} color={isIn ? t.c.good : t.c.bad} />
          </View>
          <Text variant="h1" weight="700" tone={isIn ? 'good' : 'bad'}>
            {formatMoney(payment.amount)}
          </Text>
          <Text variant="small" tone="muted">
            {isIn ? 'Received from' : 'Paid to'} {party?.name ?? 'Unknown'}
          </Text>
          <Badge label={payment.number} tone="neutral" />
        </Card>

        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          {[
            { label: 'Date', value: formatDate(payment.date) },
            { label: 'Method', value: paymentMethodLabel(tr, payment.method) },
            { label: isIn ? 'Deposited into' : 'Paid from', value: account?.name ?? '—' },
            ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : []),
            ...(payment.currency !== baseCurrency
              ? [{ label: 'Exchange rate', value: `1 ${payment.currency} = ${payment.exchangeRate.toFixed(4)} ${baseCurrency}` }]
              : []),
            { label: 'Recorded', value: formatDateTime(payment.createdAt) },
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
              router.push(party.kind === 'customer' ? `/(app)/contacts/customers/${party.id}` : `/(app)/contacts/suppliers/${party.id}`)
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
            <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
          </Card>
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('sales:payment.appliedTo')}</Text>
        <Card padded={false}>
          {payment.allocations.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title={tr('sales:payment.heldAsAdvance')}
              message={tr('sales:payment.advanceBody')}
              compact
            />
          ) : (
            payment.allocations.map((a, i) => (
              <Pressable
                key={a.documentId}
                onPress={() =>
                  router.push(
                    isIn ? `/(app)/sales/invoices/${a.documentId}` : `/(app)/purchases/bills/${a.documentId}`,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`Open ${a.documentNumber}`}
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
                <MaterialCommunityIcons name="file-document-outline" size={20} color={t.c.primary} />
                <Text variant="body" weight="600" style={{ flex: 1 }}>
                  {a.documentNumber}
                </Text>
                <Text variant="body" weight="700">
                  {formatMoney(a.amount)}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))
          )}
        </Card>

        {payment.unallocated.minor > 0 ? (
          <Card variant="flat" style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
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
          <Card style={{ marginTop: t.spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small" tone="muted">
              FX {payment.fxGainLoss.minor >= 0 ? 'gain' : 'loss'} on settlement
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
