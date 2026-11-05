import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Icon } from '@esmart/ui/components/Icon';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Skeleton } from '@esmart/ui/components/EmptyState';
import { businessDate, formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { useFilingsHub } from '../../remote/queries';
import { useCanOpen } from '../../store/selectors';
import { gstPeriodLabel } from './labels';

const TONE = { filed: 'success', pending: 'warning', overdue: 'danger' } as const;

/**
 * What's due to the tax department and where the credit stands: the filing calendar, GSTR-2B
 * against the purchase register, and TDS still to deposit. Each card shows only when the server
 * sends it (a plan or role without it gets none). Informational: nothing here files anything.
 */
export function FilingCards({ branchId, limit = 5 }: { branchId?: string; limit?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports', 'common']);
  const router = useRouter();
  const canOpen = useCanOpen();
  const q = useFilingsHub(branchId);
  const data = q.data;

  if (!data) {
    // A failure here leaves the rest of the page alone: the calendar is a side card.
    if (q.isError) return null;
    return (
      <>
        <SectionHeader title={tr('reports:dash.filings.title')} />
        <Card style={{ gap: t.spacing.md }}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="45%" />
          <Skeleton height={14} width="55%" />
        </Card>
      </>
    );
  }

  // Overdue first, then what's next; filed ones drop off once their date has passed.
  const upcoming = data.calendar.filter((d) => d.status !== 'filed' || d.due >= businessDate()).sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || a.due.localeCompare(b.due));
  const shown = upcoming.slice(0, limit);
  const period = (d: (typeof upcoming)[number]) => (d.kind === 'tds' ? formatDate(`${d.period}-01`, 'MMM yyyy') : gstPeriodLabel(d.period));
  const itc = data.itc;
  const tds = data.tdsDue;

  return (
    <>
      <SectionHeader title={tr('reports:dash.filings.title')} action={canOpen('/(app)/gst/returns') ? tr('common:action.seeAll') : undefined} onAction={() => router.push('/(app)/gst/returns')} />
      <Card padded={false}>
        {shown.length === 0 ? (
          <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
            {tr('reports:dash.filings.none')}
          </Text>
        ) : (
          shown.map((d, i) => (
            <View
              key={`${d.kind}-${d.period}-${d.gstin ?? ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, padding: t.spacing.lg, borderBottomWidth: i < shown.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}
            >
              <Icon name="calendar-clock" size={18} color={d.status === 'overdue' ? t.c.bad : t.c.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="500" numberOfLines={1}>
                  {tr(`reports:dash.filings.kind.${d.kind}`)}
                  <Text variant="caption" tone="muted">{`  ${tr('reports:dash.filings.forPeriod', { period: period(d) })}`}</Text>
                </Text>
                <Text variant="micro" tone="muted" numberOfLines={1}>
                  {[tr('reports:dash.filings.due', { date: formatDate(d.due, 'd MMM') }), d.gstin].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Badge label={tr(`reports:dash.filings.status.${d.status}`)} tone={TONE[d.status]} size="sm" />
            </View>
          ))
        )}
      </Card>

      {itc ? (
        <>
          <SectionHeader title={tr('reports:dash.filings.itc')} action={tr('reports:dash.filings.fetch')} onAction={() => router.push(`/(app)/gst/gstr2b?period=${itc.period}`)} />
          <Card onPress={() => router.push(`/(app)/gst/gstr2b?period=${itc.period}`)} style={{ gap: t.spacing.md }}>
            {itc.fetched ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 3 }}>
                    <Text variant="caption" tone="muted">{tr('reports:dash.filings.claimable')}</Text>
                    <Text variant="h3" weight="700">{formatMoney(itc.claimableTax!)}</Text>
                  </View>
                  <Text variant="caption" tone="muted">{tr('reports:dash.filings.itcFor', { period: gstPeriodLabel(itc.period) })}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                  <Badge label={`${tr('reports:dash.filings.matched')} ${itc.matched ?? 0}`} tone="success" size="sm" />
                  {itc.mismatched ? <Badge label={`${tr('reports:dash.filings.mismatched')} ${itc.mismatched}`} tone="warning" size="sm" /> : null}
                  {itc.missingInBooks ? <Badge label={`${tr('reports:dash.filings.missingInBooks')} ${itc.missingInBooks}`} tone="danger" size="sm" /> : null}
                  {itc.missingIn2b ? <Badge label={`${tr('reports:dash.filings.missingIn2b')} ${itc.missingIn2b}`} tone="danger" size="sm" /> : null}
                </View>
                {itc.missingIn2b && itc.missingIn2bTax ? (
                  <Text variant="small" tone="warn">{tr('reports:dash.filings.atRisk', { amount: formatMoney(itc.missingIn2bTax) })}</Text>
                ) : null}
              </>
            ) : (
              <Text variant="small" tone="muted">{tr('reports:dash.filings.itcNotFetched', { period: gstPeriodLabel(itc.period) })}</Text>
            )}
          </Card>
        </>
      ) : null}

      {tds ? (
        <>
          <SectionHeader title={tr('reports:dash.filings.tds')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/reports/tds-payable')} />
          <Card padded={false}>
            {tds.rows.length === 0 ? (
              <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
                {tr('reports:dash.filings.tdsNone')}
              </Text>
            ) : (
              <>
                <Pressable onPress={() => router.push('/(app)/reports/tds-payable')} accessibilityRole="button" style={{ padding: t.spacing.lg, gap: 3, borderBottomWidth: 0.5, borderBottomColor: t.c.line }}>
                  <Text variant="h3" weight="700">{formatMoney(tds.total)}</Text>
                  {tds.overdue.minor > 0 ? <Text variant="small" tone="bad">{tr('reports:dash.filings.tdsOverdue', { amount: formatMoney(tds.overdue) })}</Text> : null}
                </Pressable>
                {tds.rows.slice(0, 4).map((r, i, arr) => (
                  <View key={`${r.section}-${r.month}`} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}>
                    <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
                      {tr('reports:dash.filings.tdsRow', { section: r.section || '—', month: formatDate(`${r.month}-01`, 'MMM yyyy') })}
                    </Text>
                    <Text variant="caption" tone={r.overdue ? 'bad' : 'muted'}>{tr('reports:dash.filings.due', { date: formatDate(r.dueDate, 'd MMM') })}</Text>
                    <Text variant="small" weight="600">{formatMoney(r.balance)}</Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

