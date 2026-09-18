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
import { useEWayBillQueue, useParties } from '@/store/selectors';
import { remainingHours } from '@/domain/gst/eway/validity';
import { formatVehicleNumber } from '@/domain/gst/eway/vehicle';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatMoney } from '@/lib/format';
import { formatDate, nowISO } from '@/lib/date';

type Filter = 'active' | 'expiringToday' | 'expired' | 'cancelled';

const TABS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'In transit' },
  { value: 'expiringToday', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY: Record<Filter, { title: string; message: string }> = {
  active: { title: 'Nothing in transit', message: 'Generate an e-way bill from a goods invoice over ₹50,000.' },
  expiringToday: { title: 'Nothing expiring today', message: 'Every live bill has more than a day left.' },
  expired: { title: 'Nothing expired', message: 'No consignment has outrun its validity.' },
  cancelled: { title: 'Nothing cancelled', message: 'No e-way bill has been withdrawn.' },
};

export default function EWayBillRegister() {
  const t = useTheme();
  const router = useRouter();
  const queue = useEWayBillQueue();
  const parties = useParties();
  const [filter, setFilter] = useState<Filter>('active');

  const now = nowISO();
  const rows = queue[filter];
  const counts: Record<Filter, number> = useMemo(
    () => ({
      active: queue.active.length,
      expiringToday: queue.expiringToday.length,
      expired: queue.expired.length,
      cancelled: queue.cancelled.length,
    }),
    [queue],
  );

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <>
      <Stack.Screen options={{ title: 'E-way bills' }} />
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
              illustration="no-documents"
              icon="truck-fast-outline"
              title={EMPTY[filter].title}
              message={EMPTY[filter].message}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((d, i) => {
              const ewb = d.compliance!.eWayBill!;
              const hours = Math.round(remainingHours(ewb.validUpto, now));
              return (
                <Pressable
                  key={d.id}
                  onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`E-way bill ${ewb.ewbNo}`}
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
                      <Text variant="mono" weight="600">
                        {ewb.ewbNo}
                      </Text>
                      {filter === 'active' && hours < 24 ? (
                        <Badge label={`${hours}h`} tone="warning" size="sm" />
                      ) : null}
                      {filter === 'expired' ? <Badge label="Expired" tone="danger" size="sm" /> : null}
                    </View>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {d.number} · {nameOf(d.partyId)}
                    </Text>
                    <Text variant="micro" tone="muted">
                      {ewb.partB?.vehicleNo ? formatVehicleNumber(ewb.partB.vehicleNo) : ewb.partB?.transDocNo ?? '—'} ·{' '}
                      {ewb.distanceKm} km · until {formatDate((ewb.validUpto ?? '').slice(0, 10))}
                    </Text>
                  </View>
                  <Text variant="small" weight="700">
                    {formatMoney(d.totals.grandTotal)}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
                </Pressable>
              );
            })}
          </Card>
        )}
      </Screen>
    </>
  );
}
