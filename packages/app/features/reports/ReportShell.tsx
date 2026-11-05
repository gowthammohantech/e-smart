import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, formatDateTime, resolveRange } from '@esmart/core/lib/date';
import { dateRangeLabel } from '@esmart/core/labels';
import { useActiveCompany, useBranches, useParties } from '../../store/selectors';
import { usePartyRecord, usePartySearch } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { ReportFilters } from '@esmart/core/domain/reports';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { deliverFile, deliverPdf } from './exportFiles';
import { presetParam, useQueryParams } from '../../navigation/queryParams';
import { ReportTable, XLSX_MIME, exportName, tableHtml, toCsv, xlsxBytes } from './reportTable';

export type ReportScope = {
  filters: ReportFilters;
  preset: DateRangePreset;
};

/**
 * Shared chrome for every report: the filter bar the PRD requires
 * (date range, branch, party, currency), a stated basis, and export.
 */
export function ReportShell({
  title,
  subtitle,
  scope,
  onScopeChange,
  showPartyFilter,
  children,
  exportRows,
  extraExports = [],
  generatedAt,
}: {
  title: string;
  subtitle?: string;
  scope: ReportScope;
  onScopeChange: (s: ReportScope) => void;
  showPartyFilter?: boolean;
  children: React.ReactNode;
  exportRows?: () => ReportTable;
  /** Files only this report offers, e.g. GSTR-1 for the portal; listed after the standard formats. */
  extraExports?: { key: string; icon: IconName; label: string; run: () => Promise<void> }[];
  /**
   * When the figures were fetched (ms, a query's `dataUpdatedAt`), printed as "Generated …" on the
   * report and its PDF. Left out, it is when the report was opened or its filters last changed.
   */
  generatedAt?: number;
}) {
  const t = useTheme();
  const { t: tr, i18n } = useTranslation(['common', 'reports']);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // Always false in the native apps, so the desktop header action only ever reaches a browser.
  const desktop = useIsDesktop();

  const company = useActiveCompany();
  const branches = useBranches();
  const parties = useParties();
  // The picker searches the server; the chosen contact is loaded into the store to be named.
  const [partyQuery, setPartyQuery] = useState('');

  const [filterOpen, setFilterOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const partySearch = usePartySearch(undefined, useDebounced(partyQuery), partyOpen);
  usePartyRecord(scope.filters.partyId ?? undefined);

  const branch = branches.find((b) => b.id === scope.filters.branchId);
  const party = parties.find((p) => p.id === scope.filters.partyId);
  const rangeLabel = DATE_RANGE_PRESET_KEYS.includes(scope.preset)
    ? dateRangeLabel(tr, scope.preset)
    : tr('common:dateRange.custom');

  const setPreset = (preset: DateRangePreset) =>
    changeScope({ preset, filters: { ...scope.filters, range: resolveRange(preset) } });

  const basisParams = {
    company: company?.name ?? '',
    from: formatDate(scope.filters.range.from),
    to: formatDate(scope.filters.range.to),
    branch: branch?.name ?? tr('reports:shell.allBranches'),
    currency: company?.baseCurrency ?? '',
  };
  // When the figures are from: the caller's fetch time, or else when the report was opened or
  // its filters last changed (set where they change, not while rendering).
  const [askedAt, setAskedAt] = useState(() => Date.now());
  const changeScope = (next: ReportScope) => {
    setAskedAt(new Date().getTime());
    onScopeChange(next);
  };
  const generatedLine = tr('reports:shell.generatedAt', { at: formatDateTime(new Date(generatedAt || askedAt).toISOString()) });
  const basisLine = () => `${tr('reports:shell.basisLine', basisParams)} · ${generatedLine}`;

  const doExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!exportRows) return;
    setExportOpen(false);
    const table = exportRows();
    const name = exportName(title, scope.filters.range.from, scope.filters.range.to);
    try {
      if (format === 'pdf') await deliverPdf(`${name}.pdf`, tableHtml(title, basisLine(), table, i18n.language));
      else if (format === 'xlsx') await deliverFile(`${name}.xlsx`, xlsxBytes(title, table), XLSX_MIME);
      else await deliverFile(`${name}.csv`, new TextEncoder().encode(toCsv(table)), 'text/csv');
    } catch {
      toast.show(tr('reports:shell.exportCancelled'), 'info', { icon: 'file-cancel-outline' });
    }
  };

  const EXPORTS: { format: 'pdf' | 'xlsx' | 'csv'; icon: IconName; label: string }[] = [
    { format: 'pdf', icon: 'file-pdf-box', label: tr('reports:shell.exportPdf') },
    { format: 'xlsx', icon: 'file-excel-box', label: tr('reports:shell.exportExcel') },
    { format: 'csv', icon: 'file-delimited-outline', label: tr('reports:shell.exportCsv') },
  ];

  const chip = (label: string, active: boolean, onPress: () => void, onClear?: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: t.spacing.md,
        paddingVertical: 7,
        borderRadius: t.radius.pill,
        backgroundColor: active ? t.c.chip : t.c.card,
        borderWidth: 1,
        borderColor: active ? t.c.primary : t.c.line,
      }}
    >
      <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
        {label}
      </Text>
      {active && onClear ? (
        <Pressable onPress={onClear} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('reports:shell.clearFilter', { label })}>
          <Icon name="close-circle" size={13} color={t.c.primary} />
        </Pressable>
      ) : (
        <Icon name="chevron-down" size={13} color={active ? t.c.primary : t.c.muted} />
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      {desktop && exportRows ? (
        // A desktop puts Export with the page title, top right, instead of a bar at the bottom.
        <Stack.Screen
          options={{
            headerRight: () => (
              <Button title={tr('reports:shell.export')} icon="file-export-outline" variant="secondary" onPress={() => setExportOpen(true)} />
            ),
          }}
        />
      ) : null}
      <View
        style={
          Platform.OS === 'web'
            ? // In a browser the report scrolls up under the filters; keep a gap below the chips.
              { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.md, gap: t.spacing.md }
            : { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {chip(rangeLabel, true, () => setFilterOpen(true))}
          {branches.length > 1
            ? chip(branch?.name ?? tr('common:component.allBranches'), !!branch, () => setBranchOpen(true), () =>
                changeScope({ ...scope, filters: { ...scope.filters, branchId: null } }),
              )
            : null}
          {showPartyFilter
            ? chip(party?.name ?? tr('reports:shell.allContacts'), !!party, () => setPartyOpen(true), () =>
                changeScope({ ...scope, filters: { ...scope.filters, partyId: null } }),
              )
            : null}
        </ScrollView>
      </View>

      <ScrollView
        // Only a phone has the export bar to scroll clear of.
        contentContainerStyle={desktop ? { padding: t.spacing.lg, paddingBottom: t.spacing.xxxl } : { padding: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <Card variant="flat" style={{ marginBottom: t.spacing.lg, gap: 4 }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('reports:shell.basis')}</Text>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {tr('reports:shell.basisFull', basisParams)}
          </Text>
          <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {generatedLine}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
              {subtitle}
            </Text>
          ) : null}
        </Card>

        {children}
      </ScrollView>

      {exportRows && !desktop ? (
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
          }}
        >
          <Button title={tr('reports:shell.export')} icon="file-export-outline" variant="secondary" onPress={() => setExportOpen(true)} fullWidth />
        </View>
      ) : null}

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} title={tr('reports:shell.export')}>
        {[
          ...EXPORTS.map((e) => ({ key: e.format, icon: e.icon, label: e.label, onPress: () => doExport(e.format) })),
          ...extraExports.map((e) => ({
            key: e.key,
            icon: e.icon,
            label: e.label,
            onPress: () => {
              setExportOpen(false);
              e.run().catch(() => toast.show(tr('reports:shell.exportFailed'), 'error', { icon: 'file-alert-outline' }));
            },
          })),
        ].map((e) => (
          <Pressable
            key={e.key}
            onPress={e.onPress}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <Icon name={e.icon} size={20} color={t.c.text} />
            <Text variant="body" style={{ flex: 1 }}>
              {e.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title={tr('reports:shell.dateRange')}>
        {DATE_RANGE_PRESET_KEYS.map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              setPreset(p);
              setFilterOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: scope.preset === p }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <Text variant="body" style={{ flex: 1 }} weight={scope.preset === p ? '600' : '400'}>
              {dateRangeLabel(tr, p)}
            </Text>
            {scope.preset === p ? <Icon name="check" size={19} color={t.c.primary} /> : null}
          </Pressable>
        ))}
      </Sheet>

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={tr('reports:shell.branch')}
        options={[
          { value: '', label: tr('common:component.allBranches') },
          ...branches.map((b) => ({ value: b.id, label: b.name, description: b.code })),
        ]}
        value={scope.filters.branchId ?? ''}
        onSelect={(v) => changeScope({ ...scope, filters: { ...scope.filters, branchId: v || null } })}
        searchable={false}
      />

      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={tr('reports:shell.contact')}
        options={[
          { value: '', label: tr('reports:shell.allContacts') },
          ...(partySearch.data ?? []).map((p) => ({ value: p.id!, label: p.name!, description: tr(p.kind === 'supplier' ? 'common:table.supplier' : 'common:table.customer') })),
        ]}
        onQueryChange={setPartyQuery}
        loading={partySearch.isFetching}
        value={scope.filters.partyId ?? ''}
        onSelect={(v) => changeScope({ ...scope, filters: { ...scope.filters, partyId: v || null } })}
      />
    </View>
  );
}

/** The report's filters, kept in the URL (`?range=lastMonth&branch=…&party=…&currency=…`). */
export function useReportScope(initial: DateRangePreset = 'thisFY') {
  const [params, setParams] = useQueryParams();
  const scope = useMemo<ReportScope>(() => {
    const preset = presetParam(params.range, initial);
    return {
      preset,
      filters: { range: resolveRange(preset), branchId: params.branch ?? null, partyId: params.party ?? null, currency: params.currency ?? null },
    };
  }, [params, initial]);
  const setScope = useCallback(
    (s: ReportScope) =>
      setParams({
        range: s.preset === initial ? undefined : s.preset,
        branch: s.filters.branchId ?? undefined,
        party: s.filters.partyId ?? undefined,
        currency: s.filters.currency ?? undefined,
      }),
    [setParams, initial],
  );
  return { scope, setScope };
}

/** A report's export: what the PDF, Excel and CSV files are built from. */
export function reportTable(headers: string[], rows: (string | number)[][]): ReportTable {
  return { headers, rows };
}
