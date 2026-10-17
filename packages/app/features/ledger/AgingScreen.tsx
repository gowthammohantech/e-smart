import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { AgingBars } from '@esmart/ui/components/charts/AgingBars';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useToast } from '@esmart/ui/components/Toast';

import { AgingBucketKey } from '@esmart/core/domain/receivables';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { Money, money, sum, zero } from '@esmart/core/lib/money';
import { StatGrid, SplitPane } from '@esmart/ui/components/Layout';
import { useBaseCurrency, useParties, usePayables, useReceivables } from '../../store/selectors';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';

type Mode = 'all' | 'overdue' | 'dueSoon';

export function AgingScreen({ kind }: { kind: 'receivable' | 'payable' }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common']);
  const router = useRouter();
  const toast = useToast();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const bp = useBreakpoint();
  const desktop = bp !== 'phone';

  const baseCurrency = useBaseCurrency();
  const parties = useParties();
  const receivables = useReceivables();
  const payables = usePayables();
  const data = kind === 'receivable' ? receivables : payables;

  const [mode, setMode] = useState<Mode>('all');
  const [bucket, setBucket] = useState<AgingBucketKey | null>(null);
  const [reminderFor, setReminderFor] = useState<string | null>(null);

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';
  const partyOf = (id: string) => parties.find((p) => p.id === id);

  const rows = useMemo(() => {
    let list = data.outstanding;
    if (mode === 'overdue') list = list.filter((o) => o.daysOverdue > 0);
    if (mode === 'dueSoon') list = list.filter((o) => o.daysOverdue <= 0 && o.daysOverdue >= -7);
    if (bucket) list = list.filter((o) => o.bucket === bucket);
    return [...list].sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [data.outstanding, mode, bucket]);

  const shownTotal = useMemo(
    () =>
      rows.length
        ? sum(
            rows.map((o) => money(Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)), baseCurrency)),
            baseCurrency,
          )
        : zero(baseCurrency),
    [rows, baseCurrency],
  );

  // Group by party so the user chases a person, not a stack of documents.
  const byParty = useMemo(() => {
    const map = new Map<string, { total: number; count: number; oldest: number }>();
    rows.forEach((o) => {
      const cur = map.get(o.document.partyId) ?? { total: 0, count: 0, oldest: 0 };
      map.set(o.document.partyId, {
        total: cur.total + Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)),
        count: cur.count + 1,
        oldest: Math.max(cur.oldest, o.daysOverdue),
      });
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const isReceivable = kind === 'receivable';
  const reminderParty = reminderFor ? partyOf(reminderFor) : undefined;
  const reminderRows = reminderFor ? rows.filter((o) => o.document.partyId === reminderFor) : [];

  const reminderText = reminderParty
    ? `Hi ${reminderParty.displayName ?? reminderParty.name}, a gentle reminder that ${reminderRows.length === 1 ? 'invoice' : 'invoices'} ${reminderRows
        .map((o) => o.document.number)
        .join(', ')} totalling ${formatMoney(
        money(
          reminderRows.reduce((a, o) => a + Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)), 0),
          baseCurrency,
        ),
      )} ${reminderRows.length === 1 ? 'is' : 'are'} still open. Could you let us know when payment is planned? Thank you.`
    : '';

  const agingCard = (
    <Card style={desktop ? { gap: t.spacing.md } : { marginTop: t.spacing.lg, gap: t.spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('sales:aging.aging')}</Text>
        {bucket ? (
          <Pressable onPress={() => setBucket(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('sales:aging.clearBucket')}>
            <Text variant="caption" tone="primary" weight="600">{tr('sales:aging.clear')}</Text>
          </Pressable>
        ) : null}
      </View>
      <AgingBars
        buckets={data.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))}
        selectedKey={bucket}
        onSelect={(k) => setBucket(bucket === k ? null : (k as AgingBucketKey))}
      />
    </Card>
  );

  const modeFilter = (
    <Segmented
      options={[
        { value: 'all', label: 'All' },
        { value: 'overdue', label: tr('sales:aging.overdue') },
        { value: 'dueSoon', label: 'Due soon' },
      ]}
      value={mode}
      onChange={(v) => setMode(v as Mode)}
      size="sm"
    />
  );

  const emptyCard = (
    <Card padded={false}>
      <EmptyState illustration="all-settled" icon="check-all" title={tr('sales:aging.nothingOutstanding')} message={isReceivable ? 'Every invoice has been settled.' : 'You are all paid up.'} compact />
    </Card>
  );

  const openDocument = (id: string) =>
    router.push(isReceivable ? `/(app)/sales/invoices/${id}` : `/(app)/purchases/bills/${id}`);
  const recordPayment = (partyId: string) =>
    router.push(`/(app)/payments/new?direction=${isReceivable ? 'received' : 'paid'}&partyId=${partyId}`);

  const reminderSheet = (
    <Sheet
      visible={!!reminderFor}
      onClose={() => setReminderFor(null)}
      title={tr('sales:aging.sendReminder')}
      subtitle={reminderParty?.name}
      footer={
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Button
            title={tr('sales:aging.whatsapp')}
            icon="whatsapp"
            style={{ flex: 1 }}
            onPress={() => {
              const phone = (reminderParty?.phone ?? '').replace(/[^0-9]/g, '');
              Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(reminderText)}`).catch(() => {});
              setReminderFor(null);
              toast.show(tr('sales:aging.openedWhatsapp'), 'success');
            }}
          />
          <Button
            title={tr('sales:aging.email')}
            variant="secondary"
            icon="email-outline"
            style={{ flex: 1 }}
            onPress={() => {
              Linking.openURL(
                `mailto:${reminderParty?.email ?? ''}?subject=${encodeURIComponent('Payment reminder')}&body=${encodeURIComponent(reminderText)}`,
              ).catch(() => {});
              setReminderFor(null);
              toast.show(tr('sales:aging.openedEmail'), 'success');
            }}
          />
        </View>
      }
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Card variant="flat">
          <Text variant="small" style={{ lineHeight: 21 }}>
            {reminderText}
          </Text>
        </Card>
        <Text variant="caption" tone="muted">{tr('sales:aging.reminderNote')}</Text>
      </View>
    </Sheet>
  );

  if (desktop) {
    const overdueCount = data.outstanding.filter((o) => o.daysOverdue > 0).length;
    // Beside the list on a wide window; above it when the sidebar leaves less room.
    const sideAging = bp === 'wide';
    const list = (
      <View style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
          <View style={{ width: 340 }}>{modeFilter}</View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <Text variant="small" tone="muted">
              {rows.length} documents · {byParty.length} contacts
            </Text>
            <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(shownTotal)}
            </Text>
          </View>
        </View>

        {byParty.length === 0
          ? emptyCard
          : byParty.map((group) => (
              <DesktopPartyGroup
                key={group.id}
                name={nameOf(group.id)}
                group={group}
                total={money(group.total, baseCurrency)}
                rows={rows.filter((o) => o.document.partyId === group.id)}
                isReceivable={isReceivable}
                onOpen={openDocument}
                onRemind={() => setReminderFor(group.id)}
                onRecord={() => recordPayment(group.id)}
              />
            ))}
      </View>
    );

    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <StatGrid>
            <StatTile
              label={isReceivable ? 'Total receivable' : 'Total payable'}
              value={data.summary.total}
              icon="scale-balance"
              caption={`${data.outstanding.length} open documents`}
            />
            <StatTile
              label={tr('sales:aging.overdue')}
              value={data.summary.overdue}
              tone="bad"
              icon="alert-circle-outline"
              caption={`${overdueCount} of ${data.outstanding.length} documents`}
            />
            <StatTile
              label={tr('sales:aging.dueSoon')}
              value={data.summary.dueSoon}
              tone="warn"
              icon="clock-outline"
              caption={tr('sales:aging.dueSoonCaption')}
            />
          </StatGrid>

          {sideAging ? null : agingCard}
          <SplitPane main={list} side={sideAging ? agingCard : undefined} sideWidth={340} />
        </ScrollView>

        {reminderSheet}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <StatRow>
          <StatTile
            label={isReceivable ? 'Total receivable' : 'Total payable'}
            value={data.summary.total}
            icon="scale-balance"
            caption={`${data.outstanding.length} open documents`}
          />
          <StatTile label={tr('sales:aging.overdue')} value={data.summary.overdue} tone="bad" icon="alert-circle-outline" caption={`Due soon ${formatMoney(data.summary.dueSoon)}`} />
        </StatRow>

        {agingCard}

        <View style={{ height: t.spacing.lg }} />

        {modeFilter}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: t.spacing.md }}>
          <Text variant="caption" tone="muted">
            {rows.length} documents · {byParty.length} contacts
          </Text>
          <Text variant="caption" weight="700">
            {formatMoney(shownTotal)}
          </Text>
        </View>

        <View style={{ height: t.spacing.sm }} />

        {byParty.length === 0 ? (
          emptyCard
        ) : (
          byParty.map((group) => {
            const groupRows = rows.filter((o) => o.document.partyId === group.id);
            return (
              <Card key={group.id} style={{ marginBottom: t.spacing.md, gap: t.spacing.md }} padded={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg, paddingBottom: 0 }}>
                  <Avatar name={nameOf(group.id)} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="700" numberOfLines={1}>
                      {nameOf(group.id)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {group.count} document{group.count === 1 ? '' : 's'}
                      {group.oldest > 0 ? ` · oldest ${group.oldest}d late` : ''}
                    </Text>
                  </View>
                  <Text variant="title" weight="700" tone={group.oldest > 0 ? 'bad' : 'warn'}>
                    {formatMoney(money(group.total, baseCurrency))}
                  </Text>
                </View>

                <View>
                  {groupRows.map((o) => (
                    <Pressable
                      key={o.document.id}
                      onPress={() =>
                        router.push(
                          isReceivable ? `/(app)/sales/invoices/${o.document.id}` : `/(app)/purchases/bills/${o.document.id}`,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${o.document.number}, ${formatMoney(o.outstanding)} outstanding`}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        paddingHorizontal: t.spacing.lg,
                        paddingVertical: t.spacing.sm,
                        backgroundColor: pressed ? t.c.card2 : 'transparent',
                      })}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="small" weight="600">
                          {o.document.number}
                        </Text>
                        <Text variant="micro" tone="muted">
                          due {formatDate(o.document.dueDate ?? o.document.date, 'dd MMM')}
                        </Text>
                      </View>
                      {o.daysOverdue > 0 ? <Badge label={`${o.daysOverdue}d`} tone="danger" size="sm" /> : null}
                      <Text variant="small" weight="600">
                        {formatMoney(o.outstanding)}
                      </Text>
                      <MaterialCommunityIcons name="chevron-right" size={16} color={t.c.muted} />
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.lg, paddingTop: t.spacing.sm }}>
                  {isReceivable ? (
                    <Button title={tr('sales:aging.remind')} variant="ghost" icon="bell-ring-outline" size="sm" onPress={() => setReminderFor(group.id)} style={{ flex: 1 }} />
                  ) : null}
                  <Button
                    title={isReceivable ? 'Record payment' : 'Pay'}
                    size="sm"
                    icon={isReceivable ? 'cash-plus' : 'cash-minus'}
                    onPress={() => router.push(`/(app)/payments/new?direction=${isReceivable ? 'received' : 'paid'}&partyId=${group.id}`)}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {reminderSheet}
    </View>
  );
}

type Outstanding = ReturnType<typeof useReceivables>['outstanding'][number];

/**
 * One contact's open documents on a desktop: who, how much and the actions in
 * one header line, then the documents as a small table with aligned columns.
 */
function DesktopPartyGroup({
  name,
  group,
  total,
  rows,
  isReceivable,
  onOpen,
  onRemind,
  onRecord,
}: {
  name: string;
  group: { count: number; oldest: number };
  total: Money;
  rows: Outstanding[];
  isReceivable: boolean;
  onOpen: (documentId: string) => void;
  onRemind: () => void;
  onRecord: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common']);
  const header = (label: string, style: object) => (
    <Text variant="micro" tone="muted" weight="700" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6, ...style }}>
      {label}
    </Text>
  );

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg }}>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="body" weight="700" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="muted">
            {group.count} document{group.count === 1 ? '' : 's'}
            {group.oldest > 0 ? ` · oldest ${group.oldest}d late` : ''}
          </Text>
        </View>
        <Text variant="title" weight="700" tone={group.oldest > 0 ? 'bad' : 'warn'} style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(total)}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginLeft: t.spacing.sm }}>
          {isReceivable ? (
            <Button title={tr('sales:aging.remind')} variant="secondary" icon="bell-ring-outline" size="sm" onPress={onRemind} />
          ) : null}
          <Button title={isReceivable ? 'Record payment' : 'Pay'} size="sm" icon={isReceivable ? 'cash-plus' : 'cash-minus'} onPress={onRecord} />
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          minHeight: 34,
          paddingHorizontal: t.spacing.lg,
          backgroundColor: t.c.card2,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
        }}
      >
        {header(tr('common:table.number'), { flex: 1 })}
        {header(tr('common:table.due'), { width: 130 })}
        {header(tr('sales:aging.overdue'), { width: 100 })}
        {header(tr('common:table.outstanding'), { width: 160, textAlign: 'right' })}
        <View style={{ width: 16 }} />
      </View>

      {rows.map((o) => (
        <Pressable
          key={o.document.id}
          onPress={() => onOpen(o.document.id)}
          accessibilityRole="link"
          accessibilityLabel={`${o.document.number}, ${formatMoney(o.outstanding)} outstanding`}
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressState;
            return [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                minHeight: 46,
                paddingHorizontal: t.spacing.lg,
                borderTopWidth: 1,
                borderTopColor: t.c.line,
                backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
              },
              focusRing(t, focused),
            ];
          }}
        >
          <Text variant="small" weight="600" numberOfLines={1} style={{ flex: 1 }}>
            {o.document.number}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1} style={{ width: 130 }}>
            {formatDate(o.document.dueDate ?? o.document.date, 'dd MMM yyyy')}
          </Text>
          <View style={{ width: 100, alignItems: 'flex-start' }}>
            {o.daysOverdue > 0 ? <Badge label={`${o.daysOverdue}d`} tone="danger" size="sm" /> : <Text variant="small" tone="muted">—</Text>}
          </View>
          <Text variant="small" weight="600" numberOfLines={1} style={{ width: 160, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {formatMoney(o.outstanding)}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={t.c.muted} />
        </Pressable>
      ))}
    </Card>
  );
}
