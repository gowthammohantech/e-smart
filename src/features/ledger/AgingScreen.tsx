import React, { useMemo, useState } from 'react';
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
import { StatRow, StatTile } from '@/components/StatTile';
import { AgingBars } from '@/components/charts/AgingBars';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';

import { AgingBucketKey } from '@/domain/receivables';
import { formatMoney } from '@/lib/format';
import { formatDate } from '@/lib/date';
import { money, sum, zero } from '@/lib/money';
import { useBaseCurrency, useParties, usePayables, useReceivables } from '@/store/selectors';

type Mode = 'all' | 'overdue' | 'dueSoon';

export function AgingScreen({ kind }: { kind: 'receivable' | 'payable' }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();

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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <StatRow>
          <StatTile
            label={isReceivable ? 'Total receivable' : 'Total payable'}
            value={data.summary.total}
            icon="scale-balance"
            caption={`${data.outstanding.length} open documents`}
          />
          <StatTile label="Overdue" value={data.summary.overdue} tone="bad" icon="alert-circle-outline" caption={`Due soon ${formatMoney(data.summary.dueSoon)}`} />
        </StatRow>

        <Card style={{ marginTop: t.spacing.lg, gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Aging
            </Text>
            {bucket ? (
              <Pressable onPress={() => setBucket(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Clear bucket filter">
                <Text variant="caption" tone="primary" weight="600">
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>
          <AgingBars
            buckets={data.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))}
            selectedKey={bucket}
            onSelect={(k) => setBucket(bucket === k ? null : (k as AgingBucketKey))}
          />
        </Card>

        <View style={{ height: t.spacing.lg }} />

        <Segmented
          options={[
            { value: 'all', label: 'All' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'dueSoon', label: 'Due soon' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          size="sm"
        />

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
          <Card padded={false}>
            <EmptyState icon="check-all" title="Nothing outstanding" message={isReceivable ? 'Every invoice has been settled.' : 'You are all paid up.'} compact />
          </Card>
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
                    <Button title="Remind" variant="ghost" icon="bell-ring-outline" size="sm" onPress={() => setReminderFor(group.id)} style={{ flex: 1 }} />
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

      <Sheet
        visible={!!reminderFor}
        onClose={() => setReminderFor(null)}
        title="Send a reminder"
        subtitle={reminderParty?.name}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Button
              title="WhatsApp"
              icon="whatsapp"
              style={{ flex: 1 }}
              onPress={() => {
                const phone = (reminderParty?.phone ?? '').replace(/[^0-9]/g, '');
                Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(reminderText)}`).catch(() => {});
                setReminderFor(null);
                toast.show('Reminder opened in WhatsApp', 'success');
              }}
            />
            <Button
              title="Email"
              variant="secondary"
              icon="email-outline"
              style={{ flex: 1 }}
              onPress={() => {
                Linking.openURL(
                  `mailto:${reminderParty?.email ?? ''}?subject=${encodeURIComponent('Payment reminder')}&body=${encodeURIComponent(reminderText)}`,
                ).catch(() => {});
                setReminderFor(null);
                toast.show('Reminder opened in email', 'success');
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
          <Text variant="caption" tone="muted">
            The message is prepared for you — you send it yourself, so nothing leaves the app without your say-so.
          </Text>
        </View>
      </Sheet>
    </View>
  );
}
