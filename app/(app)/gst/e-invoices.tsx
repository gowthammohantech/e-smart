import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { Segmented } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useEInvoiceQueue, useParties } from '@/store/selectors';
import { BusinessDocument } from '@/types';
import { DOCUMENT_LABELS } from '@/domain/documentStates';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatMoney } from '@/lib/format';
import { formatDate } from '@/lib/date';

type Filter = 'generated' | 'failed' | 'cancelled' | 'notApplicable';

const TABS: { value: Filter; label: string }[] = [
  { value: 'generated', label: 'Registered' },
  { value: 'failed', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'notApplicable', label: 'Not applicable' },
];

const EMPTY: Record<Filter, { title: string; message: string }> = {
  generated: { title: 'Nothing registered yet', message: 'Issue an invoice, then generate its IRN.' },
  failed: { title: 'No rejections', message: 'Every submission has been accepted by the portal.' },
  cancelled: { title: 'Nothing cancelled', message: 'No IRN has been withdrawn.' },
  notApplicable: { title: 'Nothing here', message: 'Every document is reportable.' },
};

export default function EInvoiceRegister() {
  const t = useTheme();
  const router = useRouter();
  const queue = useEInvoiceQueue();
  const parties = useParties();
  const [filter, setFilter] = useState<Filter>('generated');

  const rows = queue[filter];
  const counts: Record<Filter, number> = useMemo(
    () => ({
      generated: queue.generated.length,
      failed: queue.failed.length,
      cancelled: queue.cancelled.length,
      notApplicable: queue.notApplicable.length,
    }),
    [queue],
  );

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';

  const subtitleFor = (d: BusinessDocument) => {
    const record = d.compliance?.eInvoice;
    if (filter === 'generated' || filter === 'cancelled') {
      return record?.irn ? `IRN ${record.irn.slice(0, 16)}… · Ack ${record.ackNo}` : nameOf(d.partyId);
    }
    return record?.errors?.[0]?.message ?? nameOf(d.partyId);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'E-invoices' }} />
      <Screen bottomInset={24}>
        <Segmented
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={TABS.map((tab) => ({
            value: tab.value,
            label: counts[tab.value] ? `${tab.label} ${counts[tab.value]}` : tab.label,
          }))}
        />

        <View style={{ height: t.spacing.md }} />

        {rows.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration={filter === 'failed' ? 'all-settled' : 'no-documents'}
              icon="shield-check-outline"
              title={EMPTY[filter].title}
              message={EMPTY[filter].message}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((d, i) => (
              <Pressable
                key={d.id}
                onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
                accessibilityRole="button"
                accessibilityLabel={`${d.number}, ${nameOf(d.partyId)}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                  backgroundColor: pressed ? t.c.card2 : 'transparent',
                })}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="body" weight="600">
                      {d.number}
                    </Text>
                    <Badge label={DOCUMENT_LABELS[d.kind].singular} tone="neutral" size="sm" />
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {subtitleFor(d)}
                  </Text>
                  <Text variant="micro" tone="muted">
                    {nameOf(d.partyId)} · {formatDate(d.date)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text variant="small" weight="700">
                    {formatMoney(d.totals.grandTotal)}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
