import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefreshOnFocus } from '../../remote/useRefreshOnFocus';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useServerSave } from '../../components/useServerSave';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';

import type { BusinessDocument, DocStatus, DocumentKind, Party, Payment } from '@esmart/core/types';
import type { OutstandingDoc } from '@esmart/core/domain/receivables';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { money, type Money } from '@esmart/core/lib/money';
import { paymentMethodLabel } from '@esmart/core/labels';

import { useAppStore } from '../../store/appStore';
import { useBaseCurrency, usePartyOutstanding } from '../../store/selectors';
import { useDocumentPages, useDocumentSummary, usePartyAging, usePaymentPages, usePartyRecord, type DocumentSummary } from '../../remote/queries';
import { detailRouteFor } from '../documents/DocumentEditor';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { SplitPane } from '@esmart/ui/components/Layout';
import { useGoBack } from '../../navigation/useGoBack';
import { PaymentReminderSheet } from '../ledger/PaymentReminderSheet';

type Tab = 'activity' | 'documents' | 'payments' | 'details';

export function PartyDetail({ party }: { party: Party }) {
  useRefreshOnFocus();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['contacts', 'domain', 'common', 'nav', 'purchases', 'reports']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave } = useServerSave();

  const baseCurrency = useBaseCurrency();
  const removeParty = useAppStore((s) => s.removeParty);

  const [tab, setTab] = useState<Tab>('activity');
  const desktop = useIsDesktop();
  // Details sit in the side column on a desktop, so that tab falls back.
  const shownTab: Tab = desktop && tab === 'details' ? 'activity' : tab;
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  // A party that is both reads like a customer, with what we owe them beside; a general contact has no account.
  const isCustomer = party.kind !== 'supplier';
  const isBoth = party.kind === 'both';
  const canTransact = party.kind !== 'general';

  // Everything below comes from the server, so the party's whole history needn't be on the device.
  const record = usePartyRecord(party.id).data;
  const aging = usePartyAging(party.id, isCustomer ? 'customer' : 'supplier').data;
  const outstanding = useMemo(
    () =>
      (aging?.documents ?? []).map((o) => ({
        document: { ...o.document, totals: { grandTotal: o.document?.grandTotal } } as unknown as BusinessDocument,
        allocated: o.allocated as Money,
        outstanding: o.outstanding as Money,
        daysOverdue: o.daysOverdue ?? 0,
        bucket: o.bucket,
      })) as OutstandingDoc[],
    [aging],
  );

  // Open documents plus what is left of the opening balance: the server's figure, the device's until it answers.
  const deviceOutstanding = usePartyOutstanding(party.id);
  const totalOutstanding = (record?.outstanding as Money | undefined) ?? deviceOutstanding;

  const billKind: DocumentKind = isCustomer ? 'invoice' : 'purchaseBill';
  const billed = useDocumentSummary({ kinds: [billKind], partyId: party.id }).data;
  // Drafts and cancelled documents don't count towards what was billed.
  const lifetimeValue = money(
    (billed?.byStatus ?? []).filter((b) => !['draft', 'cancelled', 'rejected'].includes(b.status)).reduce((a, b) => a + (b.total?.minor ?? 0), 0),
    baseCurrency,
  );
  const billCount = billed?.count ?? 0;

  const overdueCount = outstanding.filter((o) => o.daysOverdue > 0).length;

  // The first page of each kind; "See all" opens the list filtered to this party.
  const pagesOf = (kinds: DocumentKind[]) => ({ kinds, partyId: party.id });
  const quotes = useDocumentPages(pagesOf([isCustomer ? 'quote' : 'purchaseOrder']));
  const orders = useDocumentPages(pagesOf([isCustomer ? 'salesOrder' : 'goodsReceipt']));
  const bills = useDocumentPages(pagesOf([billKind]));
  const returns = useDocumentPages(pagesOf([isCustomer ? 'salesReturn' : 'purchaseReturn']));
  const payments = usePaymentPages({ direction: isCustomer ? 'received' : 'paid', partyId: party.id });
  const partyPayments = payments.rows as unknown as Payment[];

  const contactAction = (icon: IconName, label: string, onPress: () => void, disabled?: boolean) => (
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
        <Icon name={icon} size={19} color={t.c.primary} />
      </View>
      <Text variant="micro" tone="muted">
        {label}
      </Text>
    </Pressable>
  );

  const renderDocuments = (docs: DocumentSummary[], emptyTitle: string) =>
    docs.length === 0 ? (
      <EmptyState icon="file-outline" title={emptyTitle} compact />
    ) : (
      docs.map((d, i) => (
        <DocumentRow
          key={d.id}
          document={{ number: d.number ?? '', date: d.date!, status: d.status as DocStatus, totals: { grandTotal: d.grandTotal as Money } }}
          partyName={party.name}
          divider={i < docs.length - 1}
          onPress={() => router.push(detailRouteFor(d.kind as DocumentKind, d.id!) as never)}
        />
      ))
    );
  const listRoute: Partial<Record<DocumentKind, string>> = {
    quote: '/(app)/sales/quotes',
    salesOrder: '/(app)/sales/orders',
    invoice: '/(app)/sales/invoices',
    salesReturn: '/(app)/sales/returns',
    purchaseOrder: '/(app)/purchases/orders',
    goodsReceipt: '/(app)/purchases/receipts',
    purchaseBill: '/(app)/purchases/bills',
    purchaseReturn: '/(app)/purchases/returns',
  };

  const headerCard = (
    <>
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
        {contactAction('phone', tr('contacts:detail.call'), () => Linking.openURL(`tel:${party.phone}`), !party.phone)}
        {contactAction('whatsapp', 'WhatsApp', () => Linking.openURL(`https://wa.me/${(party.phone ?? '').replace(/[^0-9]/g, '')}`), !party.phone)}
        {contactAction('email-outline', tr('contacts:form.email'), () => Linking.openURL(`mailto:${party.email}`), !party.email)}
        {canTransact && contactAction(
          isCustomer ? 'file-document-edit-outline' : 'cart-outline',
          isCustomer ? tr('nav:title.invoice') : tr('purchases:hub.bill'),
          () => router.push(`${isCustomer ? '/(app)/sales/invoices/new' : '/(app)/purchases/bills/new'}?partyId=${party.id}`),
        )}
      </View>
    </Card>
    </>
  );
  const statTiles = (
    <>
    <StatRow>
      <StatTile
        label={isCustomer ? tr('contacts:detail.owesYou') : tr('reports:home.youOwe')}
        value={totalOutstanding}
        tone={totalOutstanding.minor > 0 ? (overdueCount > 0 ? 'bad' : 'warn') : 'good'}
        icon="clock-alert-outline"
        caption={
          overdueCount
            ? `${tr('contacts:detail.openCount', { count: outstanding.length })} · ${tr('contacts:detail.overdueCount', { count: overdueCount })}`
            : tr('contacts:detail.openCount', { count: outstanding.length })
        }
      />
      {isBoth ? (
        <StatTile
          label={tr('contacts:detail.payable')}
          value={((record as { payable?: Money } | undefined)?.payable) ?? { minor: 0, currency: party.currency }}
          icon="cash-minus"
        />
      ) : null}
      <StatTile
        label={isCustomer ? tr('contacts:detail.totalInvoiced') : tr('contacts:detail.totalPurchased')}
        value={lifetimeValue}
        icon="chart-line"
        caption={tr('contacts:detail.documentCount', { count: billCount })}
      />
    </StatRow>
    </>
  );
  const tabPanels = (
    <>
    {shownTab === 'activity' ? (
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
                o.daysOverdue > 0
                  ? tr('contacts:detail.overdueLeft', { days: o.daysOverdue, amount: formatMoney(o.outstanding) })
                  : tr('contacts:detail.amountLeft', { amount: formatMoney(o.outstanding) })
              }
              divider={i < outstanding.length - 1}
              onPress={() => router.push(detailRouteFor(o.document.kind, o.document.id) as never)}
            />
          ))
        )}
      </Card>
    ) : null}

    {shownTab === 'documents' ? (
      <View style={{ gap: t.spacing.lg }}>
        {[
          { title: isCustomer ? tr('nav:title.quotations') : tr('nav:title.purchaseOrders'), pages: quotes, kind: (isCustomer ? 'quote' : 'purchaseOrder') as DocumentKind },
          { title: isCustomer ? tr('nav:title.salesOrders') : tr('nav:title.goodsReceipts'), pages: orders, kind: (isCustomer ? 'salesOrder' : 'goodsReceipt') as DocumentKind },
          { title: isCustomer ? tr('nav:title.invoices') : tr('contacts:detail.bills'), pages: bills, kind: billKind },
          { title: tr('contacts:detail.returns'), pages: returns, kind: (isCustomer ? 'salesReturn' : 'purchaseReturn') as DocumentKind },
        ]
          .filter((g) => g.pages.rows.length > 0)
          .map((g) => (
            <View key={g.title}>
              <Text variant="caption" tone="muted" weight="600" style={{ marginBottom: t.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {g.title}
              </Text>
              <Card padded={false}>{renderDocuments(g.pages.rows, tr('contacts:detail.noneYet'))}</Card>
              {g.pages.hasNextPage && listRoute[g.kind] ? (
                <Button title={tr('common:action.seeAll')} variant="ghost" size="sm" onPress={() => router.push(`${listRoute[g.kind]}?party=${party.id}` as never)} />
              ) : null}
            </View>
          ))}
        {[quotes, orders, bills, returns].every((g) => !g.isLoading && g.rows.length === 0) ? (
          <Card padded={false}>
            <EmptyState illustration="no-documents" icon="file-outline" title={tr('contacts:detail.noDocuments')} compact />
          </Card>
        ) : null}
      </View>
    ) : null}

    {shownTab === 'payments' ? (
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
              <Icon
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
    </>
  );
  const detailsCard = (
    <>
    <Card style={{ gap: t.spacing.md }}>
      {[
        { label: 'GSTIN', value: party.taxId ?? tr('contacts:detail.notRegistered') },
        { label: tr('contacts:form.phone'), value: party.phone ?? '—' },
        { label: tr('contacts:form.email'), value: party.email ?? '—' },
        { label: tr('contacts:form.currency'), value: party.currency },
        {
          label: tr('contacts:form.paymentTerms'),
          value: party.paymentTermsDays === 0 ? tr('contacts:form.dueOnReceipt') : tr('contacts:form.termsDays', { count: party.paymentTermsDays }),
        },
        ...(party.creditLimit ? [{ label: tr('contacts:form.creditLimit'), value: formatMoney(party.creditLimit) }] : []),
        { label: tr('contacts:form.openingBalance'), value: formatMoney(party.openingBalance) },
        {
          label: tr('contacts:form.billingAddress'),
          value: [party.billingAddress?.line1, party.billingAddress?.city, party.billingAddress?.state, party.billingAddress?.postalCode]
            .filter(Boolean)
            .join(', ') || '—',
        },
        { label: tr('contacts:detail.added'), value: formatDate(party.createdAt) },
        ...(party.notes ? [{ label: tr('contacts:form.notes'), value: party.notes }] : []),
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
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      {desktop ? (
        <Stack.Screen
          options={{
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Button title={tr('contacts:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} />
                {canTransact ? (
                  <Button
                    title={isCustomer ? tr('common:quickAction.receivePayment') : tr('contacts:detail.pay')}
                    icon={isCustomer ? 'cash-plus' : 'cash-minus'}
                    onPress={() => router.push(`/(app)/payments/new?direction=${isCustomer ? 'received' : 'paid'}&partyId=${party.id}`)}
                  />
                ) : null}
              </View>
            ),
          }}
        />
      ) : null}
      <ScrollView
        contentContainerStyle={desktop ? { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl } : { padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {desktop ? (
          <SplitPane
            sideWidth={340}
            side={
              <>
                {headerCard}
                {statTiles}
                {detailsCard}
              </>
            }
            main={
              <View style={{ gap: t.spacing.md }}>
                <Segmented
                  options={[
                    { value: 'activity', label: tr('contacts:detail.tabOpen') },
                    { value: 'documents', label: tr('contacts:detail.tabDocuments') },
                    { value: 'payments', label: tr('contacts:detail.tabPayments') },
                  ]}
                  value={tab}
                  onChange={(v) => setTab(v as Tab)}
                  size="sm"
                />
                {tabPanels}
              </View>
            }
          />
        ) : (
          <>
            {headerCard}
            <View style={{ height: t.spacing.md }} />
            {statTiles}
            <View style={{ height: t.spacing.lg }} />
            <Segmented
              options={[
                { value: 'activity', label: tr('contacts:detail.tabOpen') },
                { value: 'documents', label: tr('contacts:detail.tabDocuments') },
                { value: 'payments', label: tr('contacts:detail.tabPayments') },
                { value: 'details', label: tr('contacts:detail.tabDetails') },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              size="sm"
            />
            <View style={{ height: t.spacing.md }} />
            {tabPanels}
            {tab === 'details' ? detailsCard : null}
          </>
        )}
      </ScrollView>

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
            flexDirection: 'row',
            gap: t.spacing.md,
          }}
        >
          {canTransact ? (
            <Button
              title={isCustomer ? tr('common:quickAction.receivePayment') : tr('contacts:detail.pay')}
              icon={isCustomer ? 'cash-plus' : 'cash-minus'}
              onPress={() => router.push(`/(app)/payments/new?direction=${isCustomer ? 'received' : 'paid'}&partyId=${party.id}`)}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button title={tr('contacts:detail.actions')} variant="ghost" icon="dots-horizontal" onPress={() => setActionsOpen(true)} style={{ flex: 1 }} />
        </View>
      )}

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={party.name}>
        {[
          { label: tr('contacts:detail.editContact'), icon: 'pencil-outline' as const, onPress: () => router.push(isCustomer ? `/(app)/contacts/customers/${party.id}/edit` : `/(app)/contacts/suppliers/${party.id}/edit`) },
          { label: tr('contacts:detail.statement'), icon: 'book-open-outline' as const, onPress: () => router.push(`/(app)/contacts/${isCustomer ? 'customers' : 'suppliers'}/${party.id}/statement` as never) },
          ...(!canTransact
            ? []
            : isCustomer
            ? [
                { label: tr('common:quickAction.newInvoice'), icon: 'file-document-edit-outline' as const, onPress: () => router.push(`/(app)/sales/invoices/new?partyId=${party.id}`) },
                { label: tr('nav:title.newQuotation'), icon: 'file-percent-outline' as const, onPress: () => router.push(`/(app)/sales/quotes/new?partyId=${party.id}`) },
                // Only when something is owed; it opens the same reminder as the aging screen.
                ...(outstanding.length ? [{ label: tr('contacts:detail.sendReminder'), icon: 'bell-ring-outline' as const, onPress: () => setReminderOpen(true) }] : []),
                // A party that is both is bought from too.
                ...(isBoth
                  ? [
                      { label: tr('nav:title.newPurchaseBill'), icon: 'cart-outline' as const, onPress: () => router.push(`/(app)/purchases/bills/new?partyId=${party.id}`) },
                      { label: tr('contacts:detail.pay'), icon: 'cash-minus' as const, onPress: () => router.push(`/(app)/payments/new?direction=paid&partyId=${party.id}`) },
                    ]
                  : []),
              ]
            : [{ label: tr('nav:title.newPurchaseBill'), icon: 'cart-outline' as const, onPress: () => router.push(`/(app)/purchases/bills/new?partyId=${party.id}`) }]),
          { label: tr('contacts:detail.deleteContact'), icon: 'trash-can-outline' as const, onPress: () => setConfirmDelete(true) },
        ].map((a) => (
          <Pressable
            key={a.label}
            // Every action closes the sheet first; it is a modal, so one left open
            // would sit over the screen the action navigates to.
            onPress={() => {
              setActionsOpen(false);
              a.onPress();
            }}
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
            <Icon name={a.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <ConfirmDialog
        visible={confirmDelete}
        title={tr('contacts:detail.deleteTitle', { name: party.name })}
        message={tr('contacts:detail.deleteMessage')}
        confirmLabel={tr('contacts:detail.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void serverSave(() => removeParty(party.id), tr('contacts:detail.deleted'), { icon: 'account-remove-outline' }).then((res) => {
            if (res) goBack('/(app)/(tabs)/contacts');
          });
        }}
      />

      <PaymentReminderSheet party={reminderOpen ? party : undefined} rows={outstanding} onClose={() => setReminderOpen(false)} />
    </View>
  );
}
