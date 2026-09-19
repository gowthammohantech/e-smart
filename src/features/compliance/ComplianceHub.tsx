import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { StatRow, StatTile } from '@/components/StatTile';
import { SearchBar } from '@/components/SearchBar';
import { ListRow } from '@/components/ListRow';
import { EmptyState } from '@/components/EmptyState';
import { Segmented } from '@/components/Field';
import { EInvoiceStatus, EwayBillStatus } from '@/types';
import { useAppStore } from '@/store/appStore';
import {
  useComplianceSettings,
  useComplianceSummary,
  useEInvoiceDocuments,
  useEwayBills,
  useExpiringEwayBills,
  useParties,
} from '@/store/selectors';
import { ewayBillStatusAt, hoursUntilExpiry } from '@/domain/ewayBill';
import { detailRouteFor } from '@/features/documents/DocumentEditor';
import { formatDate, nowISO } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { EWAY_STATUS_META, E_INVOICE_STATUS_META, expiryPhrase } from './complianceMeta';

type Tab = 'eInvoice' | 'eway';

const E_INVOICE_FILTERS: { key: EInvoiceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'generated', label: 'Reported' },
  { key: 'pending', label: 'Not reported' },
  { key: 'failed', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
];

const EWAY_FILTERS: { key: EwayBillStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

/**
 * The compliance register (FRD 16): everything reported, in one place.
 * `header` sits above the register inside the same scroll, which is how the
 * GST tab puts its shortcuts on top.
 */
export function ComplianceHub({ header, bottomInset = 60 }: { header?: React.ReactNode; bottomInset?: number } = {}) {
  const t = useTheme();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('eInvoice');
  const [eInvoiceFilter, setEInvoiceFilter] = useState<EInvoiceStatus | 'all'>('all');
  const [ewayFilter, setEwayFilter] = useState<EwayBillStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const settings = useComplianceSettings();
  const summary = useComplianceSummary();
  const documents = useEInvoiceDocuments();
  const bills = useEwayBills();
  const expiring = useExpiringEwayBills(24);
  const parties = useParties();
  const allDocuments = useAppStore((s) => s.documents);

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';
  const now = nowISO();

  const eInvoiceRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      const status = d.compliance?.eInvoiceStatus ?? 'pending';
      if (eInvoiceFilter !== 'all' && status !== eInvoiceFilter) return false;
      if (!q) return true;
      return (
        d.number.toLowerCase().includes(q) ||
        nameOf(d.partyId).toLowerCase().includes(q) ||
        (d.compliance?.irn ?? '').toLowerCase().includes(q) ||
        (d.compliance?.ackNo ?? '').includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, eInvoiceFilter, query, parties]);

  const ewayRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bills.filter((b) => {
      if (ewayFilter !== 'all' && ewayBillStatusAt(b, now) !== ewayFilter) return false;
      if (!q) return true;
      return (
        b.ewayBillNumber.includes(q) ||
        b.documentNumber.toLowerCase().includes(q) ||
        nameOf(b.partyId).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, ewayFilter, query, now, parties]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <Segmented
        options={[
          { value: 'eInvoice', label: 'E-invoices' },
          { value: 'eway', label: 'E-way bills' },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: t.spacing.lg }}
      />

      {tab === 'eInvoice' ? (
        <StatRow>
          <StatTile
            label="Reported"
            value={String(summary.eInvoice.generated)}
            icon="shield-check-outline"
            tone="good"
            caption={`${summary.eInvoice.cancelled} cancelled`}
          />
          <StatTile
            label="Needs attention"
            value={String(summary.eInvoice.pending + summary.eInvoice.failed)}
            icon="alert-circle-outline"
            tone={summary.eInvoice.failed ? 'bad' : 'warn'}
            caption={`${summary.eInvoice.failed} rejected`}
          />
        </StatRow>
      ) : (
        <StatRow>
          <StatTile
            label="Active bills"
            value={String(summary.eway.active)}
            icon="truck-fast-outline"
            tone="good"
          />
          <StatTile
            label="Expiring in 24 h"
            value={String(summary.expiringSoon)}
            icon="clock-alert-outline"
            tone={summary.expiringSoon ? 'warn' : 'default'}
            caption={`${summary.ewayOutstanding} consignments unbilled`}
          />
        </StatRow>
      )}

      {tab === 'eway' && expiring.length ? (
        <Pressable
          onPress={() => setEwayFilter('active')}
          accessibilityRole="button"
          style={{ marginTop: t.spacing.md }}
        >
          <Card
            variant="flat"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              borderColor: t.c.warn,
            }}
          >
            <MaterialCommunityIcons name="clock-alert-outline" size={20} color={t.c.warn} />
            <Text variant="small" tone="warn" style={{ flex: 1, lineHeight: 18 }}>
              {expiring.length} {expiring.length === 1 ? 'e-way bill expires' : 'e-way bills expire'} within
              24 hours.
            </Text>
          </Card>
        </Pressable>
      ) : null}

      {!settings.eInvoiceEnabled && tab === 'eInvoice' ? (
        <Card variant="flat" style={{ marginTop: t.spacing.md }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            E-invoicing is switched off for this business. Turn it on under Settings to report invoices.
          </Text>
        </Card>
      ) : null}

      <View style={{ height: t.spacing.md }} />
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={tab === 'eInvoice' ? 'Invoice, party or IRN' : 'Bill number, document or party'}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: t.spacing.sm, paddingVertical: t.spacing.md }}
      >
        {(tab === 'eInvoice' ? E_INVOICE_FILTERS : EWAY_FILTERS).map((f) => {
          const active = tab === 'eInvoice' ? eInvoiceFilter === f.key : ewayFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() =>
                tab === 'eInvoice'
                  ? setEInvoiceFilter(f.key as EInvoiceStatus | 'all')
                  : setEwayFilter(f.key as EwayBillStatus | 'all')
              }
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: t.spacing.md,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: active ? t.c.primary : t.c.card2,
              }}
            >
              <Text variant="caption" weight="600" tone={active ? 'onPrimary' : 'muted'}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'eInvoice' ? (
        eInvoiceRows.length ? (
          <Card padded={false}>
            {eInvoiceRows.map((d, i) => {
              const status = d.compliance?.eInvoiceStatus ?? 'pending';
              const meta = E_INVOICE_STATUS_META[status];
              return (
                <ListRow
                  key={d.id}
                  title={d.number}
                  subtitle={`${nameOf(d.partyId)} · ${formatDate(d.date)}`}
                  meta={
                    d.compliance?.irn
                      ? `IRN ${d.compliance.irn.slice(0, 12)}…`
                      : formatMoney(d.totals.grandTotal)
                  }
                  right={<Badge label={meta.label} tone={meta.tone} size="sm" />}
                  divider={i < eInvoiceRows.length - 1}
                  onPress={() => router.push(detailRouteFor(d.kind, d.id) as never)}
                />
              );
            })}
          </Card>
        ) : (
          <EmptyState
            illustration="no-documents"
            title="Nothing here"
            message={
              query
                ? 'No invoice matches that search.'
                : 'Invoices become reportable once they are finalised for a registered buyer.'
            }
          />
        )
      ) : ewayRows.length ? (
        <Card padded={false}>
          {ewayRows.map((b, i) => {
            const status = ewayBillStatusAt(b, now);
            const meta = EWAY_STATUS_META[status];
            const hours = hoursUntilExpiry(b, now);
            const soon = status === 'active' && hours <= 24;
            return (
              <ListRow
                key={b.id}
                title={b.ewayBillNumber}
                subtitle={`${b.documentNumber} · ${nameOf(b.partyId)}`}
                meta={
                  status === 'cancelled'
                    ? `Cancelled${b.cancelledAt ? ` ${formatDate(b.cancelledAt.slice(0, 10))}` : ''}`
                    : `${formatDate(b.validUpto.slice(0, 10))} · ${expiryPhrase(hours)}`
                }
                right={<Badge label={meta.label} tone={soon ? 'warning' : meta.tone} size="sm" />}
                divider={i < ewayRows.length - 1}
                onPress={() => router.push(`/(app)/compliance/eway/${b.id}`)}
              />
            );
          })}
        </Card>
      ) : (
        <EmptyState
          illustration="no-documents"
          title="No e-way bills"
          message={
            query
              ? 'No bill matches that search.'
              : allDocuments.length
                ? 'Raise one from an invoice or delivery note that moves goods above the threshold.'
                : 'Bills appear here once goods start moving.'
          }
        />
      )}
    </ScrollView>
  );
}
