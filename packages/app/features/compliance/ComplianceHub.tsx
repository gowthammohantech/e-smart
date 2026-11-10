import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keyLabel } from '@esmart/core/labels';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { EInvoiceStatus, EwayBillStatus } from '@esmart/core/types';
import { useComplianceSettings, useComplianceSummary } from '../../store/selectors';
import { useComplianceDocuments, useEwayBillPages } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { ewayBillStatusAt, hoursUntilExpiry } from '@esmart/core/domain/ewayBill';
import { detailRouteFor } from '../documents/DocumentEditor';
import { formatDate, nowISO } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { EWAY_STATUS_META, E_INVOICE_STATUS_META, expiryPhrase } from './complianceMeta';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { useQueryParams } from '../../navigation/queryParams';
import { ListSkeleton, MoreRowsSkeleton } from '../../components/ScreenSkeleton';

type Tab = 'eInvoice' | 'eway';

/** Filter keys, in order. Names resolve from `compliance:filter.*` at render. */
const E_INVOICE_FILTERS: { key: EInvoiceStatus | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'compliance:filter.all' },
  { key: 'generated', labelKey: 'compliance:filter.reported' },
  { key: 'pending', labelKey: 'compliance:filter.notReported' },
  { key: 'failed', labelKey: 'compliance:filter.rejected' },
  { key: 'cancelled', labelKey: 'compliance:filter.cancelled' },
];

/** `pending` lists the consignments that still need a bill, rather than bills. */
type EwayFilter = EwayBillStatus | 'all' | 'pending';

const EWAY_FILTERS: { key: EwayFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'compliance:filter.all' },
  { key: 'pending', labelKey: 'compliance:filter.needsBill' },
  { key: 'active', labelKey: 'compliance:filter.active' },
  { key: 'expired', labelKey: 'compliance:filter.expired' },
  { key: 'cancelled', labelKey: 'compliance:filter.cancelled' },
];

/**
 * The compliance register (FRD 16): everything reported, in one place.
 * `header` sits above the register inside the same scroll, which is how the
 * GST tab puts its shortcuts on top.
 */
export function ComplianceHub({ header, bottomInset = 60 }: { header?: React.ReactNode; bottomInset?: number } = {}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'common']);
  const router = useRouter();
  const desktop = useIsDesktop();

  // Tab and status filters live in the URL (`?tab=eway&eway=active`); search stays local.
  const [params, setParams] = useQueryParams();
  const tab: Tab = params.tab === 'eway' ? 'eway' : 'eInvoice';
  const eInvoiceFilter = (params.einvoice ?? 'all') as EInvoiceStatus | 'all';
  const ewayFilter = (params.eway ?? 'all') as EwayFilter;
  const setTab = (v: Tab) => setParams({ tab: v === 'eInvoice' ? undefined : v });
  const setEInvoiceFilter = (v: EInvoiceStatus | 'all') => setParams({ einvoice: v === 'all' ? undefined : v });
  const setEwayFilter = (v: EwayFilter) => setParams({ eway: v === 'all' ? undefined : v });
  const [query, setQuery] = useState('');

  const settings = useComplianceSettings();
  const summary = useComplianceSummary();
  // Each list is read from the server, filtered and searched there, and only while it is on screen.
  const search = useDebounced(query);
  const eInvoices = useComplianceDocuments({ need: 'eInvoice', status: eInvoiceFilter === 'all' ? undefined : eInvoiceFilter, q: search || undefined }, tab === 'eInvoice');
  const unbilled = useComplianceDocuments({ need: 'ewayBill', q: search || undefined }, tab === 'eway' && ewayFilter === 'pending');
  const bills = useEwayBillPages({ status: ewayFilter === 'all' || ewayFilter === 'pending' ? undefined : ewayFilter, q: search || undefined }, tab === 'eway' && ewayFilter !== 'pending');

  const nameOf = (d: { partyName?: string }) => d.partyName ?? tr('common:placeholder.unknown');
  const now = nowISO();
  const eInvoiceRows = eInvoices.rows;
  const unbilledRows = unbilled.rows;
  const ewayRows = bills.rows;
  // A chip or search change keeps the last filter's rows as placeholder; show the shimmer, not rows of the wrong kind.
  const shownList = tab === 'eInvoice' ? eInvoices : ewayFilter === 'pending' ? unbilled : bills;
  const loading = shownList.isLoading || shownList.isPlaceholderData;
  // Until the counts arrive the tiles shimmer rather than read "0".
  const countsLoading = !summary.loaded;
  const statusCell = (label: string, tone: React.ComponentProps<typeof Badge>['tone']) => (
    <Badge label={label} tone={tone} size="sm" />
  );

  return (
    <ScrollView
      // A desktop has no tab bar or floating button to clear at the bottom.
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : bottomInset }}
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <Segmented
        options={[
          { value: 'eInvoice', label: tr('compliance:hub.eInvoices') },
          { value: 'eway', label: tr('compliance:hub.ewayBills') },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: t.spacing.lg }}
      />

      {tab === 'eInvoice' ? (
        <StatRow>
          <StatTile
            label={tr('compliance:hub.reported')}
            value={String(summary.eInvoice.generated)}
            icon="shield-check-outline"
            tone="good"
            loading={countsLoading}
            caption={tr('compliance:hub.cancelledCount', { count: summary.eInvoice.cancelled })}
          />
          <StatTile
            label={tr('compliance:hub.needsAttention')}
            value={String(summary.eInvoice.pending + summary.eInvoice.failed)}
            icon="alert-circle-outline"
            tone={summary.eInvoice.failed ? 'bad' : 'warn'}
            loading={countsLoading}
            caption={tr('compliance:hub.rejectedCount', { count: summary.eInvoice.failed })}
          />
        </StatRow>
      ) : (
        <StatRow>
          <StatTile
            label={tr('compliance:hub.activeBills')}
            value={String(summary.eway.active)}
            icon="truck-fast-outline"
            tone="good"
            loading={countsLoading}
          />
          <StatTile
            label={tr('compliance:hub.expiring24h')}
            value={String(summary.expiringSoon)}
            icon="clock-alert-outline"
            tone={summary.expiringSoon ? 'warn' : 'default'}
            loading={countsLoading}
            caption={tr('compliance:hub.unbilled', { count: summary.ewayOutstanding })}
          />
        </StatRow>
      )}

      {tab === 'eway' && summary.ewayOutstanding && ewayFilter !== 'pending' ? (
        <Pressable onPress={() => setEwayFilter('pending')} accessibilityRole="button" style={{ marginTop: t.spacing.md }}>
          <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, borderColor: t.c.warn }}>
            <Icon name="truck-alert-outline" size={20} color={t.c.warn} />
            <Text variant="small" tone="warn" style={{ flex: 1, lineHeight: 18 }}>
              {tr('compliance:hub.unbilledBanner', { count: summary.ewayOutstanding })}
            </Text>
            <Icon name="chevron-right" size={20} color={t.c.warn} />
          </Card>
        </Pressable>
      ) : null}

      {tab === 'eway' && summary.expiringSoon ? (
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
            <Icon name="clock-alert-outline" size={20} color={t.c.warn} />
            <Text variant="small" tone="warn" style={{ flex: 1, lineHeight: 18 }}>
              {tr('compliance:hub.expiringBanner', { count: summary.expiringSoon })}
            </Text>
            <Icon name="chevron-right" size={20} color={t.c.warn} />
          </Card>
        </Pressable>
      ) : null}

      {!settings.eInvoiceEnabled && tab === 'eInvoice' ? (
        <Card variant="flat" style={{ marginTop: t.spacing.md }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>{tr('compliance:hub.switchedOff')}</Text>
        </Card>
      ) : null}

      <View style={{ height: t.spacing.md }} />
      <SearchBar
        compact
        value={query}
        onChangeText={setQuery}
        placeholder={tab === 'eInvoice' ? tr('compliance:hub.searchEInvoice') : tr('compliance:hub.searchEway')}
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
                  : setEwayFilter(f.key as EwayFilter)
              }
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                // A full 40pt target, as the report filters are.
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: t.spacing.md,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: active ? t.c.primary : t.c.card2,
              }}
            >
              <Text variant="caption" weight="600" tone={active ? 'onPrimary' : 'muted'}>
                {keyLabel(tr, f.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ListSkeleton kind="list" />
      ) : desktop && tab === 'eInvoice' && eInvoiceRows.length ? (
        // A desktop reads the register as a table: number, party, date, IRN, amount and status in columns.
        <DataTable
          scroll={false}
          rows={eInvoiceRows}
          rowKey={(d) => d.id}
          rowLabel={(d) => d.number}
          onRowPress={(d) => router.push(detailRouteFor(d.kind!, d.id) as never)}
          columns={[
            { key: 'number', header: tr('common:table.number'), width: 170, render: (d) => <Cell weight="600">{d.number}</Cell> },
            { key: 'party', header: tr('common:table.party'), flex: 1.5, render: (d) => <Cell>{nameOf(d)}</Cell> },
            { key: 'date', header: tr('common:table.date'), width: 130, render: (d) => <Cell tone="muted">{formatDate(d.date)}</Cell> },
            { key: 'irn', header: 'IRN', flex: 1, secondary: true, render: (d) => <Cell tone="muted" mono>{d.irn ? `${d.irn.slice(0, 16)}…` : '—'}</Cell> },
            { key: 'amount', header: tr('common:table.amount'), width: 150, align: 'right', render: (d) => <Cell mono>{formatMoney(d.grandTotal)}</Cell> },
            {
              key: 'status',
              header: tr('common:table.status'),
              width: 160,
              render: (d) => {
                const meta = E_INVOICE_STATUS_META[d.eInvoiceStatus ?? 'pending'];
                return statusCell(keyLabel(tr, meta.labelKey), meta.tone);
              },
            },
          ]}
        />
      ) : desktop && tab === 'eway' && ewayFilter === 'pending' && unbilledRows.length ? (
        <DataTable
          scroll={false}
          rows={unbilledRows}
          rowKey={(d) => d.id}
          rowLabel={(d) => d.number}
          // The document's own page raises the bill.
          onRowPress={(d) => router.push(detailRouteFor(d.kind!, d.id) as never)}
          columns={[
            { key: 'number', header: tr('common:table.number'), width: 170, render: (d) => <Cell weight="600">{d.number}</Cell> },
            { key: 'party', header: tr('common:table.party'), flex: 1.5, render: (d) => <Cell>{nameOf(d)}</Cell> },
            { key: 'date', header: tr('common:table.date'), width: 130, render: (d) => <Cell tone="muted">{formatDate(d.date)}</Cell> },
            { key: 'amount', header: tr('common:table.amount'), width: 150, align: 'right', render: (d) => <Cell mono>{formatMoney(d.grandTotal)}</Cell> },
            { key: 'status', header: tr('common:table.status'), width: 160, render: () => statusCell(tr('compliance:hub.needsBill'), 'warning') },
          ]}
        />
      ) : desktop && tab === 'eway' && ewayFilter !== 'pending' && ewayRows.length ? (
        <DataTable
          scroll={false}
          rows={ewayRows}
          rowKey={(b) => b.id}
          rowLabel={(b) => b.ewayBillNumber}
          onRowPress={(b) => router.push(`/(app)/compliance/eway/${b.id}`)}
          columns={[
            { key: 'number', header: tr('compliance:ewb.number'), width: 170, render: (b) => <Cell weight="600" mono>{b.ewayBillNumber}</Cell> },
            { key: 'document', header: tr('compliance:ewb.document'), width: 160, render: (b) => <Cell>{b.documentNumber}</Cell> },
            { key: 'party', header: tr('common:table.party'), flex: 1.5, render: (b) => <Cell>{b.to.legalName}</Cell> },
            {
              key: 'valid',
              header: tr('compliance:ewb.validUntil'),
              flex: 1,
              render: (b) => {
                const status = ewayBillStatusAt(b, now);
                if (status === 'cancelled') {
                  return (
                    <Cell tone="muted">
                      {b.cancelledAt ? tr('compliance:ewb.cancelledOn', { date: formatDate(b.cancelledAt.slice(0, 10)) }) : tr('compliance:status.eway.cancelled')}
                    </Cell>
                  );
                }
                return <Cell tone="muted">{`${formatDate(b.validUpto.slice(0, 10))} · ${expiryPhrase(tr, hoursUntilExpiry(b, now))}`}</Cell>;
              },
            },
            {
              key: 'status',
              header: tr('common:table.status'),
              width: 150,
              render: (b) => {
                const status = ewayBillStatusAt(b, now);
                const meta = EWAY_STATUS_META[status];
                const soon = status === 'active' && hoursUntilExpiry(b, now) <= 24;
                return statusCell(keyLabel(tr, meta.labelKey), soon ? 'warning' : meta.tone);
              },
            },
          ]}
        />
      ) : tab === 'eInvoice' ? (
        eInvoiceRows.length ? (
          <Card padded={false}>
            {eInvoiceRows.map((d, i) => {
              const status = d.eInvoiceStatus ?? 'pending';
              const meta = E_INVOICE_STATUS_META[status];
              return (
                <ListRow
                  key={d.id}
                  title={d.number}
                  subtitle={`${nameOf(d)} · ${formatDate(d.date)}`}
                  meta={d.irn ? `IRN ${d.irn.slice(0, 12)}…` : formatMoney(d.grandTotal)}
                  right={<Badge label={keyLabel(tr, meta.labelKey)} tone={meta.tone} size="sm" />}
                  divider={i < eInvoiceRows.length - 1}
                  onPress={() => router.push(detailRouteFor(d.kind!, d.id) as never)}
                />
              );
            })}
          </Card>
        ) : (
          <EmptyState
            illustration="no-documents"
            title={tr('compliance:hub.nothingHere')}
            message={
              query
                ? tr('compliance:hub.noInvoiceMatch')
                : tr('compliance:hub.eInvoiceEmpty')
            }
          />
        )
      ) : ewayFilter === 'pending' ? (
        unbilledRows.length ? (
          <Card padded={false}>
            {unbilledRows.map((d, i) => (
              <ListRow
                key={d.id}
                title={d.number}
                subtitle={`${nameOf(d)} · ${formatDate(d.date)}`}
                meta={formatMoney(d.grandTotal)}
                right={<Badge label={tr('compliance:hub.needsBill')} tone="warning" size="sm" />}
                divider={i < unbilledRows.length - 1}
                // The document's own page raises the bill.
                onPress={() => router.push(detailRouteFor(d.kind!, d.id) as never)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            illustration="all-settled"
            title={tr('compliance:hub.nothingUnbilled')}
            message={query ? tr('compliance:hub.noInvoiceMatch') : tr('compliance:hub.nothingUnbilledBody')}
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
                subtitle={`${b.documentNumber} · ${b.to.legalName}`}
                meta={
                  status === 'cancelled'
                    ? b.cancelledAt
                      ? tr('compliance:ewb.cancelledOn', { date: formatDate(b.cancelledAt.slice(0, 10)) })
                      : tr('compliance:status.eway.cancelled')
                    : `${formatDate(b.validUpto.slice(0, 10))} · ${expiryPhrase(tr, hours)}`
                }
                right={<Badge label={keyLabel(tr, meta.labelKey)} tone={soon ? 'warning' : meta.tone} size="sm" />}
                divider={i < ewayRows.length - 1}
                onPress={() => router.push(`/(app)/compliance/eway/${b.id}`)}
              />
            );
          })}
        </Card>
      ) : (
        <EmptyState
          illustration="no-documents"
          title={tr('compliance:hub.noEwayBills')}
          message={
            query
              ? tr('compliance:hub.noBillMatch')
              : summary.ewayOutstanding
                ? tr('compliance:hub.ewayEmptyHasDocs')
                : tr('compliance:hub.ewayEmpty')
          }
        />
      )}
      {tab === 'eway' && ewayFilter !== 'pending' && bills.hasNextPage ? (
        <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
          {bills.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={() => void bills.fetchNextPage()} />}
        </View>
      ) : null}
    </ScrollView>
  );
}
