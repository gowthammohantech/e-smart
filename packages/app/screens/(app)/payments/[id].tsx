import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../../store/appStore';
import { useBaseCurrency, useParty, usePayment, usePaymentAccounts } from '../../../store/selectors';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate, formatDateTime } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { FormSection, SplitPane } from '@esmart/ui/components/Layout';

export default function PaymentDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'sales']);
  const router = useRouter();
  const toast = useToast();
  // Always false in the native apps, so the desktop layout only ever reaches a browser.
  const desktop = useIsDesktop();

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

  const deleteButton = (fullWidth?: boolean) => (
    <Button
      title={tr('sales:payment.deletePayment')}
      variant="danger"
      icon="trash-can-outline"
      onPress={() => setConfirmDelete(true)}
      fullWidth={fullWidth}
    />
  );

  // Every block is built once and placed twice: stacked in one column on a
  // phone, in a main column and a side column on a desktop browser. On a phone
  // each card carries its own top margin; a desktop column spaces them instead.
  const hero = (
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
      {desktop ? (
        // The badge sizes to its text from the left; centre it under the amount.
        <View style={{ alignSelf: 'center' }}>
          <Badge label={payment.number} tone="neutral" />
        </View>
      ) : (
        <Badge label={payment.number} tone="neutral" />
      )}
    </Card>
  );

  const partyCard = (spaced: boolean) =>
    party ? (
      <Card
        onPress={() =>
          router.push(party.kind === 'customer' ? `/(app)/contacts/customers/${party.id}` : `/(app)/contacts/suppliers/${party.id}`)
        }
        style={
          spaced
            ? { marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
            : { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
        }
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
    ) : null;

  const allocationRows =
    payment.allocations.length === 0 ? (
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
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressState;
            return {
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              padding: t.spacing.lg,
              borderBottomWidth: i < payment.allocations.length - 1 ? 0.5 : 0,
              borderBottomColor: t.c.line,
              backgroundColor: pressed || (desktop && hovered) ? t.c.card2 : 'transparent',
              ...(desktop ? focusRing(t, focused) : {}),
            };
          }}
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
    );

  const advanceCard = (spaced: boolean) =>
    payment.unallocated.minor > 0 ? (
      <Card
        variant="flat"
        style={
          spaced
            ? { marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
            : { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }
        }
      >
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
    ) : null;

  const fxCard = (spaced: boolean) =>
    payment.fxGainLoss && payment.fxGainLoss.minor !== 0 ? (
      <Card
        style={
          spaced
            ? { marginTop: t.spacing.md, flexDirection: 'row', justifyContent: 'space-between' }
            : { flexDirection: 'row', justifyContent: 'space-between' }
        }
      >
        <Text variant="small" tone="muted">
          FX {payment.fxGainLoss.minor >= 0 ? 'gain' : 'loss'} on settlement
        </Text>
        <Text variant="small" weight="700" tone={payment.fxGainLoss.minor >= 0 ? 'good' : 'bad'}>
          {formatMoney(payment.fxGainLoss, { signed: true })}
        </Text>
      </Card>
    ) : null;

  const notesCard = (spaced: boolean) =>
    payment.notes ? (
      <Card style={spaced ? { marginTop: t.spacing.md, gap: 4 } : { gap: 4 }}>
        <Text variant="caption" tone="muted" weight="600">{tr('sales:payment.notes')}</Text>
        <Text variant="small" style={{ lineHeight: 20 }}>
          {payment.notes}
        </Text>
      </Card>
    ) : null;

  const phoneLayout = (
    <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
      {hero}

      <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
        {details.map((r) => (
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

      {partyCard(true)}

      <Text variant="caption" tone="muted" weight="600" style={{ marginTop: t.spacing.xl, marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tr('sales:payment.appliedTo')}</Text>
      <Card padded={false}>{allocationRows}</Card>

      {advanceCard(true)}

      {fxCard(true)}

      {notesCard(true)}
    </ScrollView>
  );

  const desktopLayout = (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      <SplitPane
        sideWidth={360}
        main={
          <View style={{ gap: t.spacing.lg }}>
            <FormSection title={tr('sales:payment.details')}>
              {/* Two columns of label-over-value, so the details read across the width. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.lg }}>
                {details.map((r) => (
                  <View key={r.label} style={{ width: '50%', gap: 4, paddingRight: t.spacing.lg }}>
                    <Text variant="caption" tone="muted">
                      {r.label}
                    </Text>
                    <Text variant="body" weight="600">
                      {r.value}
                    </Text>
                  </View>
                ))}
              </View>
            </FormSection>
            <FormSection title={tr('sales:payment.appliedTo')}>
              <View style={{ borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.md, overflow: 'hidden' }}>{allocationRows}</View>
            </FormSection>
            {advanceCard(false)}
            {fxCard(false)}
            {notesCard(false)}
          </View>
        }
        side={
          <>
            {hero}
            {partyCard(false)}
          </>
        }
      />
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen
        options={
          desktop
            ? // A desktop keeps the page action top right instead of a bar at the bottom.
              { title: payment.number, headerRight: () => deleteButton() }
            : { title: payment.number }
        }
      />

      {desktop ? desktopLayout : phoneLayout}

      {desktop ? null : (
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
          {deleteButton(true)}
        </View>
      )}

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
