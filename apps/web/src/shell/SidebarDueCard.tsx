import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { businessDate, daysBetween, formatDate } from '@esmart/core/lib/date';
import { appHref } from '@esmart/app/navigation/menu';
import { useFilingsHub } from '@esmart/app/remote/queries';
import { useCanOpen, useDashboardScope } from '@esmart/app/store/selectors';
import { gstPeriodLabel } from '@esmart/app/features/dashboard/labels';
import { leaveGuarded } from '@esmart/app/components/useLeaveGuard';

const RETURNS = '/gst/returns';

/**
 * The next return or deposit due, at the foot of the open sidebar: what it is, for which
 * period, and how long is left (or how late it is), linking to GST returns. It reads the same
 * filing calendar as Home's card (one request between them). Nothing shows until it has loaded,
 * on a failure, or for a plan that can't open GST returns; with nothing left to file it says so.
 */
export function SidebarDueCard() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'reports']);
  const router = useRouter();
  const canOpen = useCanOpen();
  const allowed = canOpen(RETURNS);
  const { branchId } = useDashboardScope();
  const q = useFilingsHub(branchId, allowed);
  if (!allowed || !q.data) return null;

  const today = businessDate();
  // Overdue first, then the nearest date.
  const open = q.data.calendar
    .filter((d) => d.status !== 'filed')
    .sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || a.due.localeCompare(b.due));
  const next = open[0];
  const more = open.length - 1;

  const days = next ? daysBetween(today, next.due) : 0;
  const late = !!next && days < 0;
  const soon = !!next && !late && days <= 3;
  const accent = late ? t.c.bad : soon ? t.c.warn : t.c.primary;
  const when = !next
    ? ''
    : late
      ? tr('nav:shell.dueCard.overdue', { count: -days })
      : days === 0
        ? tr('nav:shell.dueCard.today')
        : days === 1
          ? tr('nav:shell.dueCard.tomorrow')
          : tr('nav:shell.dueCard.inDays', { count: days });
  const period = next ? (next.kind === 'tds' ? formatDate(`${next.period}-01`, 'MMM yyyy') : gstPeriodLabel(next.period)) : '';
  const title = next ? tr(`reports:dash.filings.kind.${next.kind}` as 'reports:dash.filings.kind.gstr1') : tr('nav:shell.dueCard.allFiled');
  const label = next ? tr('nav:shell.dueCard.a11y', { title, period, when }) : title;

  return (
    <Pressable
      {...({ href: RETURNS } as object)}
      onPress={(e) => {
        e.preventDefault();
        leaveGuarded(() => router.navigate(appHref(RETURNS) as never));
      }}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressState;
        return {
          gap: t.spacing.xs,
          padding: t.spacing.md,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: hovered ? t.c.lineStrong : t.c.line,
          backgroundColor: pressed || hovered ? t.c.mutedSoft : t.c.card2,
          ...focusRing(t, focused),
        };
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
        <Icon name={next ? 'calendar-clock' : 'check-circle-outline'} size={16} color={next ? accent : t.c.good} />
        <Text variant="micro" weight="600" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.6 }} numberOfLines={1}>
          {tr('nav:shell.dueCard.heading')}
        </Text>
      </View>
      <Text variant="small" weight="600" numberOfLines={1}>
        {title}
        {next ? <Text variant="small" tone="muted">{`  ${period}`}</Text> : null}
      </Text>
      {next ? (
        <Text variant="caption" weight={late || soon ? '600' : '500'} style={{ color: late || soon ? accent : t.c.muted }} numberOfLines={1}>
          {[tr('reports:dash.filings.due', { date: formatDate(next.due, 'd MMM') }), when].join(' · ')}
        </Text>
      ) : (
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {tr('nav:shell.dueCard.allFiledHint')}
        </Text>
      )}
      {more > 0 ? (
        <Text variant="caption" tone="primary" weight="600" numberOfLines={1}>
          {tr('nav:shell.dueCard.more', { count: more })}
        </Text>
      ) : null}
    </Pressable>
  );
}
