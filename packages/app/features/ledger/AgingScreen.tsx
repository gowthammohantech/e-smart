import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
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

import { AgingBucketKey, summarizeAging, type OutstandingDoc } from '@esmart/core/domain/receivables';
import type { Party } from '@esmart/core/types';
import { formatMoney } from '@esmart/core/lib/format';
import { documentKindLabel } from '@esmart/core/labels';
import { formatDate, today } from '@esmart/core/lib/date';
import { Money, money, sum, zero } from '@esmart/core/lib/money';
import { StatGrid, SplitPane } from '@esmart/ui/components/Layout';
import { useBaseCurrency } from '../../store/selectors';
import { usePartyRecord, useReportData } from '../../remote/queries';
import { LoadingView } from '../../components/LoadingView';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { PaymentReminderSheet } from './PaymentReminderSheet';
import { detailRouteFor } from '../documents/DocumentEditor';

type Mode = 'all' | 'overdue' | 'dueSoon';

export function AgingScreen({ kind }: { kind: 'receivable' | 'payable' }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common', 'reports', 'contacts', 'domain']);
  const router = useRouter();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const bp = useBreakpoint();
  const desktop = bp !== 'phone';

  const baseCurrency = useBaseCurrency();
  // Worked out on the server from every open document; names travel with it.
  const remote = useReportData<Aging>(kind === 'receivable' ? 'receivables' : 'payables', { from: '2000-01-01', to: today() });
  const data = remote.data ?? { outstanding: [], summary: summarizeAging([], baseCurrency), partyNames: {} };

  const [mode, setMode] = useState<Mode>('all');
  const [bucket, setBucket] = useState<AgingBucketKey | null>(null);
  const [reminderFor, setReminderFor] = useState<string | null>(null);

  const nameOf = (id: string) => data.partyNames[id] ?? tr('common:placeholder.unknown');
  /** What the document is, the supplier's own number for a bill, and when it falls due (if it does). */
  const docMeta = (o: Outstanding) =>
    [
      documentKindLabel(tr, o.document.kind, 1),
      o.document.supplierDocNumber,
      o.document.dueDate ? tr('sales:detail.dueOn', { date: formatDate(o.document.dueDate, 'dd MMM') }) : tr('sales:payment.noDueDate'),
    ]
      .filter(Boolean)
      .join(' · ');

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
  const reminderQuery = usePartyRecord(reminderFor ?? undefined);
  const reminderParty = reminderQuery.data as unknown as Party | undefined;
  // The sheet opens once the party has come; until then the button that asked for it spins.
  const reminderLoading = (id: string) => reminderFor === id && !reminderParty && reminderQuery.isPending;
  const reminderRows = reminderFor ? rows.filter((o) => o.document.partyId === reminderFor) : [];

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
        { value: 'all', label: tr('sales:aging.all') },
        { value: 'overdue', label: tr('sales:aging.overdue') },
        { value: 'dueSoon', label: tr('sales:aging.dueSoon') },
      ]}
      value={mode}
      onChange={(v) => setMode(v as Mode)}
      size="sm"
    />
  );

  const emptyCard = (
    <Card padded={false}>
      <EmptyState illustration="all-settled" icon="check-all" title={tr('sales:aging.nothingOutstanding')} message={isReceivable ? tr('sales:aging.allSettled') : tr('sales:aging.allPaidUp')} compact />
    </Card>
  );

  // A debit note or an opening balance opens as itself, not as an invoice or bill.
  const openDocument = (doc: Outstanding['document']) =>
    router.push((doc.kind ? detailRouteFor(doc.kind, doc.id) : isReceivable ? `/(app)/sales/invoices/${doc.id}` : `/(app)/purchases/bills/${doc.id}`) as never);
  const recordPayment = (partyId: string) =>
    router.push(`/(app)/payments/new?direction=${isReceivable ? 'received' : 'paid'}&partyId=${partyId}`);

  const reminderSheet = <PaymentReminderSheet party={reminderParty} rows={reminderRows} onClose={() => setReminderFor(null)} />;

  if (!remote.data && remote.isLoading) return <LoadingView variant="report" keepTitle />;
  // Not "all paid up": the figures didn't load, so nothing can be said about them.
  if (!remote.data && remote.isError) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="cloud-off-outline"
          title={tr('common:table.loadFailed')}
          message={tr('common:documentList.loadFailedBody')}
          actionLabel={tr('common:action.retry')}
          onAction={() => void remote.refetch()}
        />
      </View>
    );
  }

  if (desktop) {
    const overdueCount = data.outstanding.filter((o) => o.daysOverdue > 0).length;
    // Beside the list on a wide window; above it when the sidebar leaves less room.
    const sideAging = bp === 'wide';
    const list = (
      <View style={{ gap: t.spacing.md }}>
        {/* The counts drop under the filter when the list is narrow (Lixi open) rather than running off the edge. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.md }}>
          <View style={{ width: 340, maxWidth: '100%' }}>{modeFilter}</View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, marginLeft: 'auto' }}>
            <Text variant="small" tone="muted">
              {tr('sales:aging.documentCount', { count: rows.length })} · {tr('sales:aging.contactCount', { count: byParty.length })}
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
                reminding={reminderLoading(group.id)}
                onRecord={() => recordPayment(group.id)}
              />
            ))}
      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <StatGrid>
            <StatTile
              label={isReceivable ? tr('reports:home.totalReceivable') : tr('reports:home.totalPayable')}
              value={data.summary.total}
              icon="scale-balance"
              caption={tr('sales:payment.openDocuments', { count: data.outstanding.length })}
            />
            <StatTile
              label={tr('sales:aging.overdue')}
              value={data.summary.overdue}
              tone="bad"
              icon="alert-circle-outline"
              caption={tr('sales:aging.overdueOfTotal', { overdue: overdueCount, total: data.outstanding.length })}
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <StatRow>
          <StatTile
            label={isReceivable ? tr('reports:home.totalReceivable') : tr('reports:home.totalPayable')}
            value={data.summary.total}
            icon="scale-balance"
            caption={tr('sales:payment.openDocuments', { count: data.outstanding.length })}
          />
          <StatTile
            label={tr('sales:aging.overdue')}
            value={data.summary.overdue}
            tone="bad"
            icon="alert-circle-outline"
            caption={tr('sales:aging.overdueOfTotal', { overdue: data.outstanding.filter((o) => o.daysOverdue > 0).length, total: data.outstanding.length })}
          />
        </StatRow>

        {agingCard}

        <View style={{ height: t.spacing.lg }} />

        {modeFilter}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: t.spacing.md }}>
          <Text variant="caption" tone="muted">
            {tr('sales:aging.documentCount', { count: rows.length })} · {tr('sales:aging.contactCount', { count: byParty.length })}
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
                      {tr('sales:aging.documentCount', { count: group.count })}
                      {group.oldest > 0 ? ` · ${tr('sales:aging.oldestLate', { days: group.oldest })}` : ''}
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
                      onPress={() => openDocument(o.document)}
                      accessibilityRole="button"
                      accessibilityLabel={tr('sales:aging.rowLabel', { number: o.document.number, amount: formatMoney(o.outstanding) })}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        paddingHorizontal: t.spacing.lg,
                        paddingVertical: t.spacing.sm,
                        minHeight: 48,
                        backgroundColor: pressed ? t.c.card2 : 'transparent',
                      })}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="small" weight="600">
                          {o.document.number}
                        </Text>
                        <Text variant="micro" tone="muted" numberOfLines={1}>
                          {docMeta(o)}
                        </Text>
                      </View>
                      {o.daysOverdue > 0 ? <Badge label={tr('sales:aging.daysShort', { days: o.daysOverdue })} tone="danger" size="sm" /> : null}
                      <Text variant="small" weight="600">
                        {formatMoney(o.outstanding)}
                      </Text>
                      <Icon name="chevron-right" size={16} color={t.c.muted} />
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: t.spacing.md, padding: t.spacing.lg, paddingTop: t.spacing.sm }}>
                  {isReceivable ? (
                    <Button title={tr('sales:aging.remind')} variant="ghost" icon="bell-ring-outline" size="sm" onPress={() => setReminderFor(group.id)} loading={reminderLoading(group.id)} style={{ flex: 1 }} />
                  ) : null}
                  <Button
                    title={isReceivable ? tr('common:action.recordPayment') : tr('sales:payment.makePayment')}
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

type Outstanding = OutstandingDoc;
type Aging = { outstanding: OutstandingDoc[]; summary: ReturnType<typeof summarizeAging>; partyNames: Record<string, string> };

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
  reminding,
  onRecord,
}: {
  name: string;
  group: { count: number; oldest: number };
  total: Money;
  rows: Outstanding[];
  isReceivable: boolean;
  onOpen: (doc: Outstanding['document']) => void;
  onRemind: () => void;
  reminding?: boolean;
  onRecord: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common', 'reports', 'contacts']);
  const header = (label: string, style: object) => (
    <Text variant="micro" tone="muted" weight="700" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6, ...style }}>
      {label}
    </Text>
  );

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {/* When the card is narrow (Lixi open beside it), the actions wrap under the
          name and amount instead of squeezing the name into a sliver. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 360, minWidth: 0 }}>
          <Avatar name={name} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="body" weight="700" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted">
              {tr('sales:aging.documentCount', { count: group.count })}
              {group.oldest > 0 ? ` · ${tr('sales:aging.oldestLate', { days: group.oldest })}` : ''}
            </Text>
          </View>
          <Text variant="title" weight="700" tone={group.oldest > 0 ? 'bad' : 'warn'} style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoney(total)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginLeft: 'auto' }}>
          {isReceivable ? (
            <Button title={tr('sales:aging.remind')} variant="secondary" icon="bell-ring-outline" size="sm" onPress={onRemind} loading={reminding} />
          ) : null}
          <Button title={isReceivable ? tr('common:action.recordPayment') : tr('sales:payment.makePayment')} size="sm" icon={isReceivable ? 'cash-plus' : 'cash-minus'} onPress={onRecord} />
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
          onPress={() => onOpen(o.document)}
          accessibilityRole="link"
          accessibilityLabel={tr('sales:aging.rowLabel', { number: o.document.number, amount: formatMoney(o.outstanding) })}
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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="small" weight="600" numberOfLines={1}>
              {o.document.number}
            </Text>
            <Text variant="micro" tone="muted" numberOfLines={1}>
              {[documentKindLabel(tr, o.document.kind, 1), o.document.supplierDocNumber].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text variant="small" tone="muted" numberOfLines={1} style={{ width: 130 }}>
            {o.document.dueDate ? formatDate(o.document.dueDate, 'dd MMM yyyy') : '—'}
          </Text>
          <View style={{ width: 100, alignItems: 'flex-start' }}>
            {o.daysOverdue > 0 ? <Badge label={tr('sales:aging.daysShort', { days: o.daysOverdue })} tone="danger" size="sm" /> : <Text variant="small" tone="muted">—</Text>}
          </View>
          <Text variant="small" weight="600" numberOfLines={1} style={{ width: 160, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {formatMoney(o.outstanding)}
          </Text>
          <Icon name="chevron-right" size={16} color={t.c.muted} />
        </Pressable>
      ))}
    </Card>
  );
}
