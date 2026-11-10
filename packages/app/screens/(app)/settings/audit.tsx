import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Sheet } from '@esmart/ui/components/Sheet';
import { pagedTableProps } from '../../../components/pagedTable';
import { useAuditPages } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { formatDateTime } from '@esmart/core/lib/date';
import { auditChanges } from '@esmart/core/domain/auditDiff';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../../components/ScreenSkeleton';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';

const ICONS: Record<string, IconName> = {
  created: 'plus-circle-outline',
  updated: 'pencil-outline',
  deleted: 'trash-can-outline',
  finalized: 'check-decagram-outline',
  invited: 'account-plus-outline',
};

/** `billingAddress.postalCode` → `Billing address › postal code`. */
function fieldLabel(path: string): string {
  const words = path
    .split('.')
    .map((p) => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase())
    .join(' › ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function AuditTrail() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings', 'domain', 'common']);
  // Statuses are stored as their codes ("partiallyPaid"); show them as the rest of the app names them.
  const status = (code: string) => tr(`domain:status.${code}`, { defaultValue: code });
  const actionText = (action: string) => {
    const marked = /^marked (\w+)$/.exec(action);
    return marked ? `marked ${status(marked[1]).toLowerCase()}` : action;
  };
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // A desktop shows an event's changes in a drawer beside the table.
  // Read from the server 50 at a time, newest first, and searched there.
  const pages = useAuditPages(useDebounced(query));
  const filtered = pages.rows;
  // A desktop shows an event's changes in a drawer beside the table.
  const [shown, setShown] = useState<(typeof filtered)[number] | null>(null);

  const changeList = (changes: ReturnType<typeof auditChanges>) =>
    changes.map((c) => (
      <View key={c.field} style={{ gap: 2 }}>
        <Text variant="caption" weight="600">{c.field === 'value' ? tr('settings:audit.value') : fieldLabel(c.field)}</Text>
        <Text variant="caption" tone="bad" style={{ textDecorationLine: c.from ? 'line-through' : 'none' }}>
          {c.from == null ? tr('settings:audit.empty') : c.field === 'status' ? status(c.from) : c.from}
        </Text>
        <Text variant="caption" tone="good">{c.to == null ? tr('settings:audit.empty') : c.field === 'status' ? status(c.to) : c.to}</Text>
      </View>
    ));
  const shownChanges = shown ? auditChanges(shown.before, shown.after) : [];

  const iconFor = (action: string) =>
    ICONS[action] ?? (action.startsWith('marked') ? 'flag-outline' : action.includes('payment') ? 'cash' : 'circle-small');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.auditTrail') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('settings:audit.search')} />
        {/* Not "0 events" while the first page is on its way. */}
        {pages.isLoading && !filtered.length ? (
          <SkeletonGroup style={{ paddingVertical: 2 }}>
            <Skeleton height={12} width={60} radius={4} />
          </SkeletonGroup>
        ) : (
          <Text variant="caption" tone="muted">
            {tr('settings:audit.count', { count: filtered.length })}
          </Text>
        )}
      </View>

      {desktop ? (
        // A desktop reads the trail as a table across the page; a row with changes opens them in a drawer.
        <View style={{ flex: 1, padding: t.spacing.lg, gap: t.spacing.lg }}>
          <DataTable
            rows={filtered}
            rowKey={(e) => e.id}
            rowLabel={(e) => `${e.actorName} ${actionText(e.action)} ${e.entityLabel}`}
            onRowPress={(e) => (auditChanges(e.before, e.after).length ? setShown(e) : undefined)}
            empty={<EmptyState icon="history" title={tr('settings:audit.none')} message={tr('settings:audit.noneBody')} compact />}
            {...pagedTableProps(pages, tr('common:table.loadFailed'), 'audit')}
            columns={[
              { key: 'date', header: tr('common:table.date'), width: 180, render: (e) => <Cell tone="muted">{formatDateTime(e.createdAt)}</Cell> },
              {
                key: 'by',
                header: tr('settings:audit.by'),
                flex: 2,
                render: (e) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, alignSelf: 'stretch', minWidth: 0 }}>
                    <Avatar name={e.actorName} size={24} />
                    {/* Shrinks so a long name is cut off rather than running into the next column. */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Cell weight="600">{e.actorName}</Cell>
                    </View>
                  </View>
                ),
              },
              {
                key: 'event',
                header: tr('settings:audit.event'),
                flex: 3,
                render: (e) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch', minWidth: 0 }}>
                    <Icon name={iconFor(e.action)} size={14} color={t.c.muted} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Cell>{`${actionText(e.action)} ${e.entityLabel}`}</Cell>
                    </View>
                  </View>
                ),
              },
              { key: 'type', header: tr('common:table.type'), width: 130, secondary: true, render: (e) => <Cell tone="muted">{e.entityType}</Cell> },
              {
                key: 'changes',
                header: tr('settings:audit.changes'),
                width: 150,
                render: (e) => {
                  const n = auditChanges(e.before, e.after).length;
                  return <Cell tone={n ? 'primary' : 'muted'}>{n ? tr('settings:audit.fieldsChanged', { count: n }) : '—'}</Cell>;
                },
              },
              { key: 'device', header: tr('settings:audit.device'), width: 120, secondary: true, render: (e) => (e.device ? <Badge label={e.device} tone="neutral" size="sm" /> : null) },
            ]}
          />
          <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Icon name="lock-outline" size={19} color={t.c.muted} />
            <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:audit.note')}</Text>
          </Card>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600 && pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
          }}
          scrollEventThrottle={200}
        >
          <Card padded={false}>
            {pages.isLoading && !filtered.length ? (
              <CardRowsSkeleton kind="list" />
            ) : filtered.length === 0 ? (
              <EmptyState icon="history" title={tr('settings:audit.none')} message={tr('settings:audit.noneBody')} compact />
            ) : (
              filtered.map((e, i) => {
                const changes = auditChanges(e.before, e.after);
                const open = openId === e.id && changes.length > 0;
                return (
                  <Pressable
                    key={e.id}
                    disabled={!changes.length}
                    onPress={() => setOpenId(open ? null : e.id)}
                    accessibilityRole={changes.length ? 'button' : undefined}
                    accessibilityState={changes.length ? { expanded: open } : undefined}
                    style={{
                      gap: t.spacing.sm,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < Math.min(filtered.length, 150) - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                      <Avatar name={e.actorName} size={34} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Icon name={iconFor(e.action)} size={14} color={t.c.muted} />
                          <Text variant="small" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                            {e.actorName} {actionText(e.action)} {e.entityLabel}
                          </Text>
                        </View>
                        <Text variant="caption" tone="muted">
                          {e.entityType} · {formatDateTime(e.createdAt)}
                          {changes.length ? ` · ${tr('settings:audit.fieldsChanged', { count: changes.length })}` : ''}
                        </Text>
                      </View>
                      {e.device ? <Badge label={e.device} tone="neutral" size="sm" /> : null}
                      {changes.length ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.c.muted} /> : null}
                    </View>
                    {open ? (
                      <View style={{ marginLeft: 34 + t.spacing.md, gap: t.spacing.sm }}>{changeList(changes)}</View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </Card>
          {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : null}

          <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
            <Icon name="lock-outline" size={19} color={t.c.muted} />
            <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:audit.note')}</Text>
          </Card>
        </ScrollView>
      )}

      <Sheet
        visible={!!shown}
        onClose={() => setShown(null)}
        desktopAs="drawer"
        title={shown ? `${shown.actorName} ${actionText(shown.action)} ${shown.entityLabel}` : ''}
        subtitle={shown ? `${shown.entityType} · ${formatDateTime(shown.createdAt)}` : undefined}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>{changeList(shownChanges)}</View>
      </Sheet>
    </View>
  );
}
