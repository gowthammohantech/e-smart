import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { dateRangeLabel } from '@esmart/core/labels';
import { useActiveCompany, useBranches, useParties } from '../../store/selectors';
import { ReportFilters } from '@esmart/core/domain/reports';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { deliverFile, deliverPdf } from './exportFiles';
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
}: {
  title: string;
  subtitle?: string;
  scope: ReportScope;
  onScopeChange: (s: ReportScope) => void;
  showPartyFilter?: boolean;
  children: React.ReactNode;
  exportRows?: () => ReportTable;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'reports']);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // Always false in the native apps, so the desktop header action only ever reaches a browser.
  const desktop = useIsDesktop();

  const company = useActiveCompany();
  const branches = useBranches();
  const parties = useParties();

  const [filterOpen, setFilterOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const branch = branches.find((b) => b.id === scope.filters.branchId);
  const party = parties.find((p) => p.id === scope.filters.partyId);
  const rangeLabel = DATE_RANGE_PRESET_KEYS.includes(scope.preset)
    ? dateRangeLabel(tr, scope.preset)
    : tr('common:dateRange.custom');

  const setPreset = (preset: DateRangePreset) =>
    onScopeChange({ preset, filters: { ...scope.filters, range: resolveRange(preset) } });

  const basisLine = () =>
    `${company?.name ?? ''} · ${formatDate(scope.filters.range.from)} to ${formatDate(scope.filters.range.to)} · ${branch?.name ?? 'all branches'} · ${company?.baseCurrency ?? ''}`;

  const doExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!exportRows) return;
    setExportOpen(false);
    const table = exportRows();
    const name = exportName(title, scope.filters.range.from, scope.filters.range.to);
    try {
      if (format === 'pdf') await deliverPdf(`${name}.pdf`, tableHtml(title, basisLine(), table));
      else if (format === 'xlsx') await deliverFile(`${name}.xlsx`, xlsxBytes(title, table), XLSX_MIME);
      else await Share.share({ message: toCsv(table), title: `${title} export` });
    } catch {
      toast.show(tr('reports:shell.exportCancelled'), 'error');
    }
  };

  const EXPORTS: { format: 'pdf' | 'xlsx' | 'csv'; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
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
        <Pressable onPress={onClear} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
          <MaterialCommunityIcons name="close-circle" size={13} color={t.c.primary} />
        </Pressable>
      ) : (
        <MaterialCommunityIcons name="chevron-down" size={13} color={active ? t.c.primary : t.c.muted} />
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
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
            ? chip(branch?.name ?? 'All branches', !!branch, () => setBranchOpen(true), () =>
                onScopeChange({ ...scope, filters: { ...scope.filters, branchId: null } }),
              )
            : null}
          {showPartyFilter
            ? chip(party?.name ?? 'All contacts', !!party, () => setPartyOpen(true), () =>
                onScopeChange({ ...scope, filters: { ...scope.filters, partyId: null } }),
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
            {company?.name} · {formatDate(scope.filters.range.from)} to {formatDate(scope.filters.range.to)} ·{' '}
            {branch?.name ?? 'all branches'} · presented in {company?.baseCurrency}, foreign-currency documents converted at
            the rate stored on each document.
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
        {EXPORTS.map((e) => (
          <Pressable
            key={e.format}
            onPress={() => doExport(e.format)}
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
            <MaterialCommunityIcons name={e.icon} size={20} color={t.c.text} />
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
            {scope.preset === p ? <MaterialCommunityIcons name="check" size={19} color={t.c.primary} /> : null}
          </Pressable>
        ))}
      </Sheet>

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={tr('reports:shell.branch')}
        options={[
          { value: '', label: 'All branches' },
          ...branches.map((b) => ({ value: b.id, label: b.name, description: b.code })),
        ]}
        value={scope.filters.branchId ?? ''}
        onSelect={(v) => onScopeChange({ ...scope, filters: { ...scope.filters, branchId: v || null } })}
        searchable={false}
      />

      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={tr('reports:shell.contact')}
        options={[
          { value: '', label: 'All contacts' },
          ...parties.map((p) => ({ value: p.id, label: p.name, description: p.kind })),
        ]}
        value={scope.filters.partyId ?? ''}
        onSelect={(v) => onScopeChange({ ...scope, filters: { ...scope.filters, partyId: v || null } })}
      />
    </View>
  );
}

export function useReportScope(initial: DateRangePreset = 'thisFY') {
  const [scope, setScope] = useState<ReportScope>({
    preset: initial,
    filters: { range: resolveRange(initial), branchId: null, partyId: null, currency: null },
  });
  return { scope, setScope };
}

/** A report's export: what the PDF, Excel and CSV files are built from. */
export function reportTable(headers: string[], rows: (string | number)[][]): ReportTable {
  return { headers, rows };
}
