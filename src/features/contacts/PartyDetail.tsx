import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { Segmented } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { DocumentRow } from '@/components/DocumentRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { StatRow, StatTile } from '@/components/StatTile';

import { Party } from '@/types';
import { buildOutstanding } from '@/domain/receivables';
import { formatMoney } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { money, sum, zero } from '@/lib/money';
import { paymentMethodLabel } from '@/i18n/labels';

import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, usePartyHistory, usePayments } from '@/store/selectors';
import { detailRouteFor } from '@/features/documents/DocumentEditor';

type Tab = 'activity' | 'documents' | 'payments' | 'details';

export function PartyDetail({ party }: { party: Party }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['contacts', 'domain']);
  const router = useRouter();
  const toast = useToast();

  const baseCurrency = useBaseCurrency();
  const history = usePartyHistory(party.id);
  const allPayments = usePayments();
  const removeParty = useAppStore((s) => s.removeParty);

  const [tab, setTab] = useState<Tab>('activity');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCustomer = party.kind === 'customer';

  const partyPayments = useMemo(
    () => allPayments.filter((p) => p.partyId === party.id),
    [allPayments, party.id],
  );

  const outstanding = useMemo(
    () => buildOutstanding(history.invoices, partyPayments),
    [history.invoices, partyPayments],
  );

  const totalOutstanding = useMemo(
    () =>
      outstanding.length
        ? sum(
            outstanding.map((o) => money(Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)), baseCurrency)),
            baseCurrency,
          )
        : zero(baseCurrency),
    [outstanding, baseCurrency],
  );

  const lifetimeValue = useMemo(
    () =>
      history.invoices.length
        ? sum(
            history.invoices
              .filter((d) => !['draft', 'cancelled'].includes(d.status))
              .map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
            baseCurrency,
          )
        : zero(baseCurrency),
    [history.invoices, baseCurrency],
  );

  const overdueCount = outstanding.filter((o) => o.daysOverdue > 0).length;

  const contactAction = (icon: keyof typeof MaterialCommunityIcons.glyphMap, label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: t.spacing.md,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: t.c.chip,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={icon} size={19} color={t.c.primary} />
      </View>
      <Text variant="micro" tone="muted">
        {label}
      </Text>
    </Pressable>
  );

  const renderDocuments = (docs: typeof history.all, emptyTitle: string) =>
    docs.length === 0 ? (
      <EmptyState icon="file-outline" title={emptyTitle} compact />
    ) : (
      docs.map((d, i) => (
        <DocumentRow
          key={d.id}
          document={d}
          partyName={party.name}
          divider={i < docs.length - 1}
          onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
        />
      ))
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <Avatar name={party.name} size={54} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="title" weight="700">
                {party.name}
              </Text>
              {party.displayName ? (
                <Text variant="caption" tone="muted">
                  {party.displayName}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                <Badge label={party.code} tone="neutral" size="sm" />
                {party.status === 'inactive' ? <Badge label={tr('contacts:detail.inactive')} tone="warning" size="sm" /> : null}
                {party.currency !== baseCurrency ? <Badge label={party.currency} tone="info" size="sm" /> : null}
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.c.line, paddingTop: t.spacing.sm }}>
            {contactAction('phone', 'Call', () => Linking.openURL(`tel:${party.phone}`), !party.phone)}
            {contactAction('whatsapp', 'WhatsApp', () => Linking.openURL(`https://wa.me/${(party.phone ?? '').replace(/[^0-9]/g, '')}`), !party.phone)}
            {contactAction('email-outline', 'Email', () => Linking.openURL(`mailto:${party.email}`), !party.email)}
            {contactAction(
              isCustomer ? 'file-document-edit-outline' : 'cart-outline',
              isCustomer ? 'Invoice' : 'Bill',
              () => router.push(isCustomer ? '/(app)/sales/invoices/new' : '/(app)/purchases/bills/new'),
            )}
          </View>
        </Card>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label={isCustomer ? 'Owes you' : 'You owe'}
            value={totalOutstanding}
            tone={totalOutstanding.minor > 0 ? (overdueCount > 0 ? 'bad' : 'warn') : 'good'}
            icon="clock-alert-outline"
            caption={`${outstanding.length} open${overdueCount ? ` · ${overdueCount} overdue` : ''}`}
          />
          <StatTile
            label={isCustomer ? 'Total invoiced' : 'Total purchased'}
            value={lifetimeValue}
            icon="chart-line"
            caption={`${history.invoices.length} documents`}
          />
        </StatRow>

        <View style={{ height: t.spacing.lg }} />

        <Segmented
          options={[
            { value: 'activity', label: 'Open' },
            { value: 'documents', label: 'Documents' },
            { value: 'payments', label: 'Payments' },
            { value: 'details', label: 'Details' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          size="sm"
        />

        <View style={{ height: t.spacing.md }} />

        {tab === 'activity' ? (
          <Card padded={false}>
            {outstanding.length === 0 ? (
              <EmptyState illustration="all-settled" icon="check-all" title={tr('contacts:detail.allSettled')} message={tr('contacts:detail.allSettledBody')} compact />
            ) : (
              outstanding.map((o, i) => (
                <DocumentRow
                  key={o.document.id}
                  document={o.document}
                  partyName={party.name}
                  outstandingLabel={
                    o.daysOverdue > 0 ? `${o.daysOverdue}d overdue · ${formatMoney(o.outstanding)} left` : `${formatMoney(o.outstanding)} left`
                  }
                  divider={i < outstanding.length - 1}
                  onPress={() => router.push(detailRouteFor(o.document.kind, o.document.id) as never)}
                />
              ))
            )}
          </Card>
        ) : null}

        {tab === 'documents' ? (
          <View style={{ gap: t.spacing.lg }}>
            {[
              { title: isCustomer ? 'Quotations' : 'Purchase orders', docs: isCustomer ? history.quotes : history.orders },
              { title: isCustomer ? 'Sales orders' : 'Goods receipts', docs: isCustomer ? history.orders : history.deliveries },
              { title: isCustomer ? 'Invoices' : 'Bills', docs: history.invoices },
              { title: 'Returns', docs: history.returns },
            ]
              .filter((g) => g.docs.length > 0)
              .map((g) => (
                <View key={g.title}>
                  <Text variant="caption" tone="muted" weight="600" style={{ marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {g.title}
                  </Text>
                  <Card padded={false}>{renderDocuments(g.docs, 'None yet')}</Card>
                </View>
              ))}
            {history.all.length === 0 ? (
              <Card padded={false}>
                <EmptyState illustration="no-documents" icon="file-outline" title={tr('contacts:detail.noDocuments')} compact />
              </Card>
            ) : null}
          </View>
        ) : null}

        {tab === 'payments' ? (
          <Card padded={false}>
            {partyPayments.length === 0 ? (
              <EmptyState illustration="no-payments" icon="cash-remove" title={tr('contacts:detail.noPayments')} compact />
            ) : (
              partyPayments.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/(app)/payments/${p.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={p.number}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < partyPayments.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <MaterialCommunityIcons
                    name={p.direction === 'received' ? 'arrow-down' : 'arrow-up'}
                    size={19}
                    color={p.direction === 'received' ? t.c.good : t.c.bad}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {p.number}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDate(p.date)} · {paymentMethodLabel(tr, p.method)}
                    </Text>
                  </View>
                  <Text variant="body" weight="700" tone={p.direction === 'received' ? 'good' : 'bad'}>
                    {formatMoney(p.amount)}
                  </Text>
                </Pressable>
              ))
            )}
          </Card>
        ) : null}

        {tab === 'details' ? (
          <Card style={{ gap: t.spacing.md }}>
            {[
              { label: 'GSTIN', value: party.taxId ?? 'Not registered' },
              { label: 'Phone', value: party.phone ?? '—' },
              { label: 'Email', value: party.email ?? '—' },
              { label: 'Currency', value: party.currency },
              { label: 'Payment terms', value: party.paymentTermsDays === 0 ? 'Due on receipt' : `${party.paymentTermsDays} days` },
              ...(party.creditLimit ? [{ label: 'Credit limit', value: formatMoney(party.creditLimit) }] : []),
              { label: 'Opening balance', value: formatMoney(party.openingBalance) },
              {
                label: 'Billing address',
                value: [party.billingAddress.line1, party.billingAddress.city, party.billingAddress.state, party.billingAddress.postalCode]
                  .filter(Boolean)
                  .join(', ') || '—',
              },
              { label: 'Added', value: formatDate(party.createdAt) },
              ...(party.notes ? [{ label: 'Notes', value: party.notes }] : []),
            ].map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.lg }}>
                <Text variant="small" tone="muted">
                  {r.label}
                </Text>
                <Text variant="small" weight="600" style={{ flex: 1, textAlign: 'right' }}>
                  {r.value}
                </Text>
              </View>
            ))}
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
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          flexDirection: 'row',
          gap: t.spacing.md,
        }}
      >
        <Button
          title={isCustomer ? 'Receive payment' : 'Pay'}
          icon={isCustomer ? 'cash-plus' : 'cash-minus'}
          onPress={() => router.push(`/(app)/payments/new?direction=${isCustomer ? 'received' : 'paid'}&partyId=${party.id}`)}
          style={{ flex: 1 }}
        />
        <Button title={tr('contacts:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} style={{ flex: 1 }} />
      </View>

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={party.name}>
        {[
          { label: 'Edit contact', icon: 'pencil-outline' as const, onPress: () => router.push(isCustomer ? `/(app)/contacts/customers/${party.id}/edit` : `/(app)/contacts/suppliers/${party.id}/edit`) },
          ...(isCustomer
            ? [
                { label: 'New invoice', icon: 'file-document-edit-outline' as const, onPress: () => router.push('/(app)/sales/invoices/new') },
                { label: 'New quotation', icon: 'file-percent-outline' as const, onPress: () => router.push('/(app)/sales/quotes/new') },
                { label: 'Send payment reminder', icon: 'bell-ring-outline' as const, onPress: () => { setActionsOpen(false); toast.show(tr('contacts:detail.reminderQueued'), 'success'); } },
              ]
            : [{ label: 'New purchase bill', icon: 'cart-outline' as const, onPress: () => router.push('/(app)/purchases/bills/new') }]),
          { label: 'Delete contact', icon: 'trash-can-outline' as const, onPress: () => { setActionsOpen(false); setConfirmDelete(true); } },
        ].map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <MaterialCommunityIcons name={a.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${party.name}?`}
        message={tr('contacts:detail.deleteMessage')}
        confirmLabel={tr('contacts:detail.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeParty(party.id);
          setConfirmDelete(false);
          toast.show(tr('contacts:detail.deleted'), 'success');
          router.back();
        }}
      />
    </View>
  );
}
