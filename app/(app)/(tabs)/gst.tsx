import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { HubTiles } from '@/components/HubTiles';
import { StatRow, StatTile } from '@/components/StatTile';
import { EmptyState } from '@/components/EmptyState';
import {
  useActiveCompany,
  useBaseCurrency,
  useComplianceSummary,
  useDocuments,
  useEInvoiceQueue,
  useEWayBillQueue,
  useParties,
} from '@/store/selectors';
import { summarizeTax } from '@/domain/reports';
import { formatGstin } from '@/domain/gst/gstin';
import { stateNameOf } from '@/domain/gst/stateCodes';
import { remainingHours } from '@/domain/gst/eway/validity';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatDate, nowISO, resolveRange } from '@/lib/date';

/**
 * The compliance hub. It leads with what is unfinished — invoices the portal
 * has not accepted, and e-way bills about to run out — because those are the
 * only two things on this screen that are time-critical.
 */
export default function GstTab() {
  const t = useTheme();
  const router = useRouter();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const summary = useComplianceSummary();
  const eInvoices = useEInvoiceQueue();
  const eWayBills = useEWayBillQueue();
  const parties = useParties();
  const documents = useDocuments();

  const thisMonth = useMemo(() => resolveRange('thisMonth'), []);
  const tax = useMemo(
    () => summarizeTax(documents, baseCurrency, { range: thisMonth }),
    [documents, baseCurrency, thisMonth],
  );

  const reg = company.taxRegistration;
  const now = nowISO();
  const attention = [...eInvoices.failed, ...eWayBills.expiringToday, ...eWayBills.expired].slice(0, 5);
  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="GST" subtitle="e-Invoice, e-way bill and returns" />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted" weight="600">
              GSTIN
            </Text>
            <Badge
              label={reg?.registered ? 'Registered' : 'Not registered'}
              tone={reg?.registered ? 'success' : 'neutral'}
            />
          </View>
          <Text variant="mono">{reg?.identifier ? formatGstin(reg.identifier) : '—'}</Text>
          <Text variant="caption" tone="muted">
            {stateNameOf(reg?.placeOfSupplyStateCode)} · e-Invoicing{' '}
            {reg?.eInvoiceEnabled ? 'on' : 'off'} · E-way bills {reg?.eWayBillEnabled ? 'on' : 'off'}
          </Text>
        </Card>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label="Output tax this month"
            value={tax.outwardTotal}
            icon="percent-outline"
            caption={`${tax.outward.length} rate${tax.outward.length === 1 ? '' : 's'}`}
          />
          <StatTile
            label="IRNs generated"
            value={String(summary.registered)}
            icon="shield-check-outline"
            tone="good"
            caption={summary.failed ? `${summary.failed} rejected` : 'All accepted'}
          />
        </StatRow>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label="E-way bills live"
            value={String(summary.ewbActive)}
            icon="truck-fast-outline"
            caption={summary.ewbExpiringToday ? `${summary.ewbExpiringToday} expire today` : 'None expiring today'}
            tone={summary.ewbExpiringToday ? 'warn' : 'default'}
          />
          <StatTile
            label="Cancelled"
            value={String(summary.cancelled)}
            icon="close-circle-outline"
            caption="IRNs withdrawn"
          />
        </StatRow>

        <SectionHeader title="Compliance" />
        <HubTiles
          tiles={[
            {
              key: 'einvoice',
              label: 'E-invoices',
              icon: 'shield-check-outline',
              route: '/(app)/gst/e-invoices',
              count: eInvoices.generated.length,
              tone: eInvoices.failed.length ? 'danger' : 'default',
            },
            {
              key: 'eway',
              label: 'E-way bills',
              icon: 'truck-fast-outline',
              route: '/(app)/gst/e-way-bills',
              count: eWayBills.active.length,
              tone: eWayBills.expiringToday.length ? 'warning' : 'default',
            },
            { key: 'gstr1', label: 'GSTR-1', icon: 'file-send-outline', route: '/(app)/gst/gstr1' },
            { key: 'settings', label: 'GST settings', icon: 'cog-outline', route: '/(app)/settings/gst' },
          ]}
        />

        <SectionHeader title="Needs attention" />
        {attention.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="all-settled"
              icon="check-all"
              title="Nothing outstanding"
              message="Every invoice is registered and no e-way bill is close to expiring."
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {attention.map((d, i) => {
              const ewb = d.compliance?.eWayBill;
              const failed = d.compliance?.eInvoice?.status === 'failed';
              const hours = ewb?.validUpto ? Math.round(remainingHours(ewb.validUpto, now)) : 0;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
                  accessibilityRole="button"
                  accessibilityLabel={d.number}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < attention.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <MaterialCommunityIcons
                    name={failed ? 'alert-circle-outline' : 'clock-alert-outline'}
                    size={20}
                    color={failed ? t.c.bad : t.c.warn}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="600">
                      {d.number}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {failed
                        ? d.compliance?.eInvoice?.errors?.[0]?.message ?? 'The portal rejected this invoice.'
                        : hours > 0
                          ? `${nameOf(d.partyId)} — e-way bill expires in ${hours}h`
                          : `${nameOf(d.partyId)} — e-way bill expired ${formatDate((ewb?.validUpto ?? '').slice(0, 10))}`}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
