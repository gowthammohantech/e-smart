import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Avatar } from '@esmart/ui/components/Avatar';
import { useAuditPages } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { formatDateTime } from '@esmart/core/lib/date';
import { auditChanges } from '@esmart/core/domain/auditDiff';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

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
  const { t: tr } = useTranslation(['nav', 'settings', 'domain']);
  // Statuses are stored as their codes ("partiallyPaid"); show them as the rest of the app names them.
  const status = (code: string) => tr(`domain:status.${code}`, { defaultValue: code });
  const actionText = (action: string) => {
    const marked = /^marked (\w+)$/.exec(action);
    return marked ? `marked ${status(marked[1]).toLowerCase()}` : action;
  };
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Read from the server 50 at a time, newest first, and searched there.
  const pages = useAuditPages(useDebounced(query));
  const filtered = pages.rows;

  const iconFor = (action: string) =>
    ICONS[action] ?? (action.startsWith('marked') ? 'flag-outline' : action.includes('payment') ? 'cash' : 'circle-small');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.auditTrail') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('settings:audit.search')} />
        <Text variant="caption" tone="muted">
          {tr('settings:audit.count', { count: filtered.length })}
        </Text>
      </View>

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
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
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
                    <View style={{ marginLeft: 34 + t.spacing.md, gap: t.spacing.sm }}>
                      {changes.map((c) => (
                        <View key={c.field} style={{ gap: 2 }}>
                          <Text variant="caption" weight="600">{c.field === 'value' ? tr('settings:audit.value') : fieldLabel(c.field)}</Text>
                          <Text variant="caption" tone="bad" style={{ textDecorationLine: c.from ? 'line-through' : 'none' }}>
                            {c.from == null ? tr('settings:audit.empty') : c.field === 'status' ? status(c.from) : c.from}
                          </Text>
                          <Text variant="caption" tone="good">{c.to == null ? tr('settings:audit.empty') : c.field === 'status' ? status(c.to) : c.to}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </Card>
        {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} style={{ paddingVertical: t.spacing.md }} /> : null}

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="lock-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:audit.note')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
