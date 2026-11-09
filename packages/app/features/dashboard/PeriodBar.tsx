import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { DIALOG_WIDTH, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Button } from '@esmart/ui/components/Button';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { formatDate, today } from '@esmart/core/lib/date';
import { useUiStore, type DashboardPeriod } from '../../store/uiStore';

const RANGES: DashboardPeriod['range'][] = ['today', 'week', 'month', 'quarter', 'year', 'custom'];
const GRAINS: { value: DashboardPeriod['grain']; key: 'day' | 'weekGrain' | 'monthGrain' }[] = [
  { value: 'day', key: 'day' },
  { value: 'week', key: 'weekGrain' },
  { value: 'month', key: 'monthGrain' },
];

/**
 * The dashboard's period: today to the financial year or dates of one's own, how the trends are
 * bucketed, and whether to compare with the period before. One setting for every tab, kept between
 * visits.
 */
export function PeriodBar({ showGrain = true }: { showGrain?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  const period = useUiStore((s) => s.dashboardPeriod);
  const setPeriod = useUiStore((s) => s.setDashboardPeriod);
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(period.from ?? today());
  const [to, setTo] = useState(period.to ?? today());
  // A thumb needs a taller target than a pointer: 36 tall, plus slop to 44.
  const desktop = useIsDesktop();
  const minHeight = desktop ? undefined : 36;
  const slop = desktop ? undefined : { top: 4, bottom: 4 };

  const chip = (key: string, label: string, active: boolean, onPress: () => void, icon?: 'calendar-range' | 'swap-vertical') => (
    <Pressable
      key={key}
      onPress={onPress}
      hitSlop={slop}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={(state) => {
        const { hovered, focused } = state as WebPressState;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: t.spacing.md,
            paddingVertical: 7,
            minHeight,
            borderRadius: t.radius.pill,
            borderWidth: 1,
            borderColor: active ? t.c.primary : hovered ? t.c.muted : t.c.line,
            backgroundColor: active ? t.c.chip : t.c.card,
          },
          focusRing(t, focused),
        ];
      }}
    >
      {icon ? <Icon name={icon} size={13} color={active ? t.c.primary : t.c.muted} /> : null}
      <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );

  const customLabel =
    period.range === 'custom' && period.from && period.to ? `${formatDate(period.from, 'd MMM')} – ${formatDate(period.to, 'd MMM')}` : tr('reports:dash.period.custom');

  return (
    <View style={{ gap: t.spacing.sm, paddingTop: t.spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
        {RANGES.map((r) =>
          r === 'custom'
            ? chip(r, customLabel, period.range === r, () => setCustomOpen(true), 'calendar-range')
            : chip(r, tr(`reports:dash.period.${r}`), period.range === r, () => setPeriod({ ...period, range: r, from: undefined, to: undefined })),
        )}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' }}>
        {showGrain ? (
          <View accessibilityLabel={tr('reports:dash.period.grain')} style={{ flexDirection: 'row', borderRadius: t.radius.pill, borderWidth: 1, borderColor: t.c.line, overflow: 'hidden' }}>
            {GRAINS.map((g, i) => {
              const on = period.grain === g.value;
              return (
                <Pressable
                  key={g.value}
                  onPress={() => setPeriod({ ...period, grain: g.value })}
                  hitSlop={slop}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: t.spacing.md, paddingVertical: 6, minHeight, justifyContent: 'center', backgroundColor: on ? t.c.chip : t.c.card, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.c.line }}
                >
                  <Text variant="caption" weight="600" tone={on ? 'primary' : 'muted'}>
                    {tr(`reports:dash.period.${g.key}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {chip('compare', period.compare ? tr('reports:dash.period.compareOn') : tr('reports:dash.period.compare'), period.compare, () => setPeriod({ ...period, compare: !period.compare }), 'swap-vertical')}
      </View>

      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title={tr('reports:dash.period.customTitle')}
        // Two dates and Apply: a small dialog on a desktop, the dates side by side.
        desktopWidth={DIALOG_WIDTH.sm}
        footer={
          <Button
            title={tr('reports:dash.period.apply')}
            disabled={!from || !to || from > to}
            onPress={() => {
              setPeriod({ ...period, range: 'custom', from, to });
              setCustomOpen(false);
            }}
            fullWidth={!desktop}
          />
        }
      >
        <View style={{ gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md, flexDirection: desktop ? 'row' : 'column' }}>
          <View style={desktop ? { flex: 1 } : undefined}>
            <DateField label={tr('reports:dash.period.from')} value={from} onChange={setFrom} />
          </View>
          <View style={desktop ? { flex: 1 } : undefined}>
            <DateField label={tr('reports:dash.period.to')} value={to} onChange={setTo} error={from && to && from > to ? tr('reports:dash.period.backwards') : undefined} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
