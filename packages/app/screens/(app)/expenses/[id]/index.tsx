import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useServerSave } from '../../../../components/useServerSave';
import { useAppStore } from '../../../../store/appStore';
import { useExpense, useExpenseCategories, useParty, usePaymentAccounts, useTaxCategories } from '../../../../store/selectors';
import { Skeleton, SkeletonGroup, SkeletonListRow } from '@esmart/ui/components/Skeleton';
import { useExpenseRecord, usePartyRecord } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';
import { useCostCentres } from '../../../../store/books';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { formatDate, formatDateTime } from '@esmart/core/lib/date';
import { subtract } from '@esmart/core/lib/money';
import { SHOW_SCROLLBAR, WIDE_FORM_MAX_WIDTH, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Avatar } from '@esmart/ui/components/Avatar';
import { FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { useGoBack } from '../../../../navigation/useGoBack';
import { AttachmentLinks } from '../../../../features/expenses/AttachmentLinks';

export default function ExpenseDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'purchases', 'inventory']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave } = useServerSave();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const bp = useBreakpoint();
  const desktop = bp !== 'phone';

  const { id } = useLocalSearchParams<{ id: string }>();
  const expense = useExpense(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useExpenseRecord(id);
  const costCentre = useCostCentres(true).find((c) => c.id === expense?.costCentreId);
  const billTo = useParty(expense?.customerId);
  // The invoice that recovered it, when one has.
  const recoveredOn = remote.data?.recoveredBy;
  const extraBadges = (
    <>
      {costCentre ? <Badge label={costCentre.name} tone="neutral" icon="sitemap-outline" /> : null}
      {expense?.billable && billTo ? <Badge label={tr('purchases:expense.billTo', { name: billTo.name })} tone="neutral" /> : null}
      {recoveredOn ? <Badge label={tr('purchases:expense.recoveredOn', { number: recoveredOn.number })} tone="success" /> : null}
    </>
  );
  const categories = useExpenseCategories();
  const accounts = usePaymentAccounts();
  const taxCategories = useTaxCategories();
  const supplier = useParty(expense?.supplierId);
  // Neither party need be on the device: fetched (and kept), with a shimmer where it goes until then.
  const supplierRecord = usePartyRecord(expense?.supplierId);
  usePartyRecord(expense?.billable ? expense.customerId : undefined);
  const supplierPending = !!expense?.supplierId && !supplier && supplierRecord.isPending;
  const removeExpense = useAppStore((s) => s.removeExpense);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // isPending, not isLoading: a query not yet started isn't "not found".
  if (!expense && !!id && remote.isPending) return <LoadingView />;
  if (!expense) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.expense') }} />
        <EmptyState illustration="not-found" icon="receipt-text-outline" title={tr('common:notFound.title')} message={tr('common:notFound.expense')} />
      </View>
    );
  }

  const category = categories.find((c) => c.id === expense.categoryId);
  const account = accounts.find((a) => a.id === expense.accountId);
  const taxCategory = taxCategories.find((c) => c.id === expense.taxCategoryId);
  // Under reverse charge the supplier was paid the price alone; the GST is the business's to pay the
  // government, so it is not inside the amount. Otherwise the tax is part of what was paid.
  const taxLines = taxCategory
    ? [
        expense.reverseCharge
          ? { label: tr('purchases:expense.paidToSupplier'), value: formatMoney(expense.amount) }
          : { label: tr('common:totals.netAmount'), value: formatMoney(subtract(expense.amount, expense.taxAmount)) },
        expense.reverseCharge
          ? { label: tr('purchases:expense.rcmTax', { rate: formatPercent(taxCategory.rate) }), value: formatMoney(expense.taxAmount) }
          : { label: tr('purchases:form.inputTaxRate', { rate: formatPercent(taxCategory.rate) }), value: formatMoney(expense.taxAmount) },
        { label: tr('inventory:gst.itc'), value: tr(`inventory:gst.itcOption.${expense.itcEligibility ?? 'eligible'}`) },
      ]
    : [];

  const deleteDialog = (
    <ConfirmDialog
      visible={confirmDelete}
      title={tr('purchases:expense.deleteTitle')}
      message={tr('purchases:expense.deleteMessage')}
      confirmLabel={tr('purchases:expense.delete')}
      destructive
      onCancel={() => setConfirmDelete(false)}
      onConfirm={() => {
        setConfirmDelete(false);
        void serverSave(() => removeExpense(expense.id), tr('purchases:expense.deleted'), { icon: 'receipt-text-remove-outline' }).then((res) => {
          if (res) goBack('/(app)/expenses');
        });
      }}
    />
  );

  if (desktop) {
    const tint = category?.color ?? t.c.muted;
    const details = [
      { label: tr('purchases:form.date'), value: formatDate(expense.date) },
      { label: tr('purchases:form.paidBy'), value: paymentMethodLabel(tr, expense.method) },
      { label: tr('purchases:form.paidFrom'), value: account?.name ?? '—' },
      ...(expense.reference ? [{ label: tr('purchases:form.reference'), value: expense.reference }] : []),
      ...(expense.nextRecurrenceDate ? [{ label: tr('purchases:expense.nextDue'), value: formatDate(expense.nextRecurrenceDate) }] : []),
      { label: tr('purchases:expense.recorded'), value: formatDateTime(expense.createdAt) },
    ];

    const main = (
      <View style={{ gap: t.spacing.lg }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={(category?.icon ?? 'cash') as IconName} size={26} color={tint} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {category?.name ?? tr('purchases:expense.uncategorised')}
            </Text>
            <Text variant="h1" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(expense.amount)}
            </Text>
            {/* Under the amount they describe, not at the far edge of the card. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {expense.recurrence !== 'none' ? <Badge label={tr(`purchases:recurrence.${expense.recurrence}`)} tone="info" icon="repeat" /> : null}
              {expense.billable ? <Badge label={tr('purchases:expense.billable')} tone="warning" /> : null}
              {extraBadges}
            </View>
          </View>
        </Card>

        <FormSection title={tr('purchases:expense.details')}>
          {/* Two label-over-value columns, so short facts don't sit a page-width apart. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.lg }}>
            {details.map((r) => (
              <View key={r.label} style={{ width: '50%', paddingRight: t.spacing.lg, gap: 4 }}>
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

        {expense.notes ? (
          <FormSection title={tr('purchases:expense.notes')}>
            <Text variant="body" style={{ lineHeight: 22 }}>
              {expense.notes}
            </Text>
          </FormSection>
        ) : null}
      </View>
    );

    const amountRow = (label: string, value: string, strong = false) => (
      <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
        <Text variant={strong ? 'body' : 'small'} tone={strong ? undefined : 'muted'} weight={strong ? '700' : undefined}>
          {label}
        </Text>
        <Text variant={strong ? 'body' : 'small'} weight={strong ? '700' : '600'} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </View>
    );

    const side = (
      <>
        <FormSection title={tr('purchases:expense.amount')}>
          <View style={{ gap: t.spacing.md }}>
            {taxLines.map((l) => amountRow(l.label, l.value))}
            {taxLines.length ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
            {amountRow(tr('purchases:expense.total'), formatMoney(expense.amount), true)}
          </View>
        </FormSection>

        {supplierPending ? (
          <FormSection title={tr('purchases:expense.supplier')}>
            <SkeletonGroup>
              <SkeletonListRow divider={false} right={false} />
            </SkeletonGroup>
          </FormSection>
        ) : supplier ? (
          <FormSection title={tr('purchases:expense.supplier')}>
            <Pressable
              onPress={() => router.push(`/(app)/contacts/suppliers/${supplier.id}`)}
              accessibilityRole="link"
              accessibilityLabel={supplier.name}
              style={(state) => {
                const { hovered, focused } = state as WebPressState;
                return [
                  { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, borderRadius: t.radius.md, opacity: hovered ? 0.8 : 1 },
                  focusRing(t, focused),
                ];
              }}
            >
              <Avatar name={supplier.name} size={36} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="body" weight="600" numberOfLines={1}>
                  {supplier.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {supplier.phone ?? supplier.email ?? supplier.code}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={t.c.muted} />
            </Pressable>
          </FormSection>
        ) : null}

        {expense.attachmentIds.length > 0 ? (
          <FormSection title={tr('purchases:expense.attachments')}>
            <AttachmentLinks ids={expense.attachmentIds} />
          </FormSection>
        ) : null}
      </>
    );

    // A narrow window stacks the side cards under the details instead.
    const stacked = bp === 'tablet';

    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: expense.number || tr('nav:title.expense'),
            // A desktop keeps the page actions together, top right, instead of a bar at the bottom.
            headerRight: () => (
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Button title={tr('purchases:expense.delete')} variant="danger" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} />
                <Button title={tr('purchases:expense.edit')} icon="pencil-outline" onPress={() => router.push(`/(app)/expenses/${expense.id}/edit`)} />
              </View>
            ),
          }}
        />
        <ScrollView
          // Held to a readable width: the details beside their side column, or the wide form width when stacked.
          contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl, width: '100%', maxWidth: (stacked ? WIDE_FORM_MAX_WIDTH : WIDE_FORM_MAX_WIDTH + 340 + t.spacing.xl) + 2 * t.spacing.lg }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          {stacked ? (
            <View style={{ gap: t.spacing.lg }}>
              {main}
              {side}
            </View>
          ) : (
            <SplitPane main={main} side={side} sideWidth={340} />
          )}
        </ScrollView>
        {deleteDialog}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: expense.number || tr('nav:title.expense') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: `${category?.color ?? t.c.muted}22`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={(category?.icon ?? 'cash') as IconName}
              size={27}
              color={category?.color ?? t.c.muted}
            />
          </View>
          <Text variant="h1" weight="700">
            {formatMoney(expense.amount)}
          </Text>
          <Text variant="small" tone="muted">
            {category?.name ?? tr('purchases:expense.uncategorised')}
          </Text>
          {/* Wraps on a phone rather than running off the card. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
            {expense.recurrence !== 'none' ? <Badge label={tr(`purchases:recurrence.${expense.recurrence}`)} tone="info" /> : null}
            {expense.billable ? <Badge label={tr('purchases:expense.billable')} tone="warning" /> : null}
            {extraBadges}
          </View>
        </Card>

        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          {[
            { label: tr('purchases:form.date'), value: formatDate(expense.date) },
            { label: tr('purchases:form.paidBy'), value: paymentMethodLabel(tr, expense.method) },
            { label: tr('purchases:form.paidFrom'), value: account?.name ?? '—' },
            ...(supplier || supplierPending ? [{ label: tr('purchases:form.supplier'), value: supplier?.name }] : []),
            ...(expense.reference ? [{ label: tr('purchases:form.reference'), value: expense.reference }] : []),
            ...taxLines,
            ...(expense.nextRecurrenceDate ? [{ label: tr('purchases:expense.nextDue'), value: formatDate(expense.nextRecurrenceDate) }] : []),
            { label: tr('purchases:expense.recorded'), value: formatDateTime(expense.createdAt) },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              {r.value === undefined ? (
                <SkeletonGroup>
                  <Skeleton width={120} height={14} />
                </SkeletonGroup>
              ) : (
                <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
                  {r.value}
                </Text>
              )}
            </View>
          ))}
        </Card>

        {expense.notes ? (
          <Card style={{ marginTop: t.spacing.md, gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">{tr('purchases:expense.notes')}</Text>
            <Text variant="small" style={{ lineHeight: 20 }}>
              {expense.notes}
            </Text>
          </Card>
        ) : null}

        {expense.attachmentIds.length > 0 ? (
          <Card style={{ marginTop: t.spacing.md, gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">{tr('purchases:expense.attachments')}</Text>
            <AttachmentLinks ids={expense.attachmentIds} />
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
          flexDirection: 'row',
          gap: t.spacing.md,
        }}
      >
        <Button title={tr('purchases:expense.edit')} icon="pencil-outline" onPress={() => router.push(`/(app)/expenses/${expense.id}/edit`)} style={{ flex: 1 }} />
        <Button title={tr('purchases:expense.delete')} variant="danger" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} style={{ flex: 1 }} />
      </View>

      {deleteDialog}
    </View>
  );
}
