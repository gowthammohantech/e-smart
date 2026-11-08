import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Segmented } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import type { CashForecast, ForecastFlow } from '@esmart/core/domain/cashForecast';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { api } from '../../../remote/api';
import { useAppStore } from '../../../store/appStore';
import { useBaseCurrency } from '../../../store/selectors';
import { HeroFigure, KeyFigures } from '../../../features/reports/reportParts';
import { ReportSkeleton } from '../../../components/ScreenSkeleton';

const HORIZONS = ['4', '13', '26'] as const;

/** Where cash is heading over the coming weeks, from what is owed each way and what recurs. */
export default function CashForecastScreen() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books']);
  const companyId = useAppStore((s) => s.activeCompanyId);
  const currency = useBaseCurrency();
  const [weeks, setWeeks] = useState<(typeof HORIZONS)[number]>('13');
  const [open, setOpen] = useState<number | null>(null);
  const forecast = useQuery({
    queryKey: ['cashForecast', companyId, weeks],
    enabled: !!companyId,
    queryFn: async () => (await api.GET('/companies/{companyId}/cash-forecast', { params: { path: { companyId }, query: { weeks: Number(weeks) } } })).data as unknown as CashForecast,
  });
  const m = (minor: number) => formatMoney(money(minor, currency));
  const f = forecast.data;
  const openFlow = (fl: ForecastFlow) => {
    const [type, id] = (fl.ref ?? '').split(':');
    if (type === 'document') router.push(`/(app)/documents/${id}` as never);
    else if (type === 'expense') router.push(`/(app)/expenses/${id}` as never);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:forecast.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('books:forecast.basis')}
        </Text>
        <Segmented options={HORIZONS.map((h) => ({ value: h, label: tr('books:forecast.weeks', { count: Number(h) }) }))} value={weeks} onChange={(v) => setWeeks(v as typeof weeks)} />
        {!f ? (
          <ReportSkeleton figures={3} />
        ) : (
          <>
            <HeroFigure
              label={tr('books:forecast.endOf', { date: formatDate(f.weeks.at(-1)!.to) })}
              value={money(f.weeks.at(-1)!.closing, currency)}
              tone={f.weeks.at(-1)!.closing < 0 ? 'bad' : 'good'}
            />
            <KeyFigures
              rows={[
                { label: tr('books:forecast.today'), value: m(f.openingCash) },
                { label: tr('books:forecast.lowest', { date: formatDate(f.weeks[f.lowest.weekIndex].to) }), value: m(f.lowest.amount), tone: f.lowest.amount < 0 ? 'bad' : undefined },
                ...(f.firstShortfall !== null ? [{ label: tr('books:forecast.shortfall', { date: formatDate(f.weeks[f.firstShortfall].from) }), value: '!', tone: 'bad' as const }] : []),
              ]}
            />
            <Card padded={false}>
              {f.weeks.map((w, i) => (
                <View key={w.from}>
                  <ListRow
                    title={`${formatDate(w.from)} – ${formatDate(w.to)}`}
                    subtitle={tr('books:forecast.inOut', { inflow: m(w.inflow), outflow: m(w.outflow) })}
                    right={
                      <Text variant="small" weight="700" tone={w.closing < 0 ? 'bad' : undefined} style={{ fontVariant: ['tabular-nums'] }}>
                        {m(w.closing)}
                      </Text>
                    }
                    chevron={w.flows.length > 0}
                    divider={i < f.weeks.length - 1 || open === i}
                    onPress={w.flows.length ? () => setOpen(open === i ? null : i) : undefined}
                  />
                  {open === i
                    ? w.flows.map((fl, j) => (
                        <ListRow
                          key={`${fl.ref}-${fl.date}-${j}`}
                          title={fl.label}
                          subtitle={`${formatDate(fl.date)} · ${tr(`books:forecast.kind.${fl.kind}`)}${fl.overdue ? ` · ${tr('books:forecast.overdue')}` : ''}`}
                          right={
                            <Text variant="small" tone={fl.kind === 'payable' || fl.kind === 'recurringExpense' ? 'bad' : 'good'} style={{ fontVariant: ['tabular-nums'] }}>
                              {fl.kind === 'payable' || fl.kind === 'recurringExpense' ? `− ${m(fl.amount)}` : `+ ${m(fl.amount)}`}
                            </Text>
                          }
                          divider
                          onPress={() => openFlow(fl)}
                        />
                      ))
                    : null}
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
