import React, { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { DATE_RANGE_PRESETS, DateRangePreset, formatDate, resolveRange } from '@/lib/date';
import { useActiveCompany, useBranches, useParties } from '@/store/selectors';
import { ReportFilters } from '@/domain/reports';

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
  exportRows?: () => string;
}) {
  const t = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const company = useActiveCompany();
  const branches = useBranches();
  const parties = useParties();

  const [filterOpen, setFilterOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);

  const branch = branches.find((b) => b.id === scope.filters.branchId);
  const party = parties.find((p) => p.id === scope.filters.partyId);
  const rangeLabel = DATE_RANGE_PRESETS.find((p) => p.key === scope.preset)?.label ?? 'Custom';

  const setPreset = (preset: DateRangePreset) =>
    onScopeChange({ preset, filters: { ...scope.filters, range: resolveRange(preset) } });

  const doExport = async () => {
    if (!exportRows) return;
    try {
      await Share.share({ message: exportRows(), title: `${title} export` });
    } catch {
      toast.show('Export was cancelled', 'error');
    }
  };

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
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
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

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg, gap: 4 }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Report basis
          </Text>
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

      {exportRows ? (
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
          <Button title="Export as CSV" icon="file-export-outline" variant="secondary" onPress={doExport} fullWidth />
        </View>
      ) : null}

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Date range">
        {DATE_RANGE_PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              setPreset(p.key);
              setFilterOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: scope.preset === p.key }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <Text variant="body" style={{ flex: 1 }} weight={scope.preset === p.key ? '600' : '400'}>
              {p.label}
            </Text>
            {scope.preset === p.key ? <MaterialCommunityIcons name="check" size={19} color={t.c.primary} /> : null}
          </Pressable>
        ))}
      </Sheet>

      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title="Branch"
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
        title="Contact"
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

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}
