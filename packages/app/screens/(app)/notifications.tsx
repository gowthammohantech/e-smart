import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useToast } from '@esmart/ui/components/Toast';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useAppStore } from '../../store/appStore';
import { useListsReady, useNotifications } from '../../store/selectors';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { CardRowsSkeleton } from '../../components/ScreenSkeleton';
import { NOTIFICATION_META, notificationRoute } from '../../features/notifications/notificationMeta';
import { formatRelative } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { useQueryParams } from '../../navigation/queryParams';
import type { AppNotification } from '@esmart/core/types';

/** How wide the list grows on a desktop. */
const DESKTOP_LIST_WIDTH = 880;

export default function Notifications() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['common']);
  const toast = useToast();
  const router = useRouter();
  // Always false in the native apps, so the desktop layout only ever reaches a browser.
  const desktop = useIsDesktop();

  const notifications = useNotifications();
  // Until this business's notifications come the list is empty, not "none": no counts, no empty picture.
  const ready = useListsReady();
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const clearAll = useAppStore((s) => s.clearNotifications);
  const readAll = () => {
    markAllRead();
    toast.show(tr('common:notifications.allRead'), 'success', { icon: 'check-all' });
  };

  const [params, setParams] = useQueryParams();
  const filter: 'all' | 'unread' = params.filter === 'unread' ? 'unread' : 'all';
  const setFilter = (f: 'all' | 'unread') => setParams({ filter: f === 'all' ? undefined : f });
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: tr('common:component.notifications'),
          headerRight: desktop
            ? () => (
                // A desktop keeps the page actions together, top right, instead of a bar at the bottom.
                <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  {ready && unread > 0 ? (
                    <Button title={tr('common:notifications.markAllRead')} variant="ghost" icon="check-all" onPress={readAll} />
                  ) : null}
                  {ready && notifications.length > 0 ? (
                    <Button title={tr('common:notifications.clearAll')} variant="ghost" icon="notification-clear-all" onPress={() => setConfirmClear(true)} />
                  ) : null}
                </View>
              )
            : () =>
                ready && unread > 0 ? (
                  <Pressable onPress={readAll} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:notifications.markAllRead')}>
                    <Text variant="small" tone="primary" weight="600">{tr('common:notifications.markAllRead')}</Text>
                  </Pressable>
                ) : null,
        }}
      />

      {/* A desktop keeps the filter compact at the left rather than stretched across the page. */}
      <View
        style={
          desktop
            ? { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, width: 360 }
            : { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }
        }
      >
        {ready ? (
          <Segmented
            options={[
              { value: 'all', label: tr('common:notifications.filterAll', { n: notifications.length }) },
              { value: 'unread', label: tr('common:notifications.filterUnread', { n: unread }) },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'unread')}
            size="sm"
          />
        ) : (
          <SkeletonGroup>
            <Skeleton height={36} radius={t.radius.md} />
          </SkeletonGroup>
        )}
      </View>

      <ScrollView
        // No bottom bar to clear on a desktop.
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxxl : 120 + insets.bottom }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {/* A desktop keeps the list in a readable column, so the time stays near its message. */}
        <View style={desktop ? { width: '100%', maxWidth: DESKTOP_LIST_WIDTH } : undefined}>
        {!ready ? (
          <Card padded={false}>
            <CardRowsSkeleton kind="list" rows={6} />
          </Card>
        ) : rows.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-notifications" icon="bell-check-outline"
              title={filter === 'unread' ? tr('common:notifications.emptyUnread') : tr('common:notifications.emptyAll')}
              message={tr('common:notifications.emptyBody')}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((n, i) => {
              const meta = NOTIFICATION_META[n.kind];
              const route = notificationRoute(n.entityType, n.entityId);
              return (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    markRead(n.id);
                    if (route) router.push(route as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    n.read ? null : tr('common:notifications.unreadLabel'),
                    n.title,
                    n.body,
                    formatRelative(n.createdAt.slice(0, 10)),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  style={(state) => {
                    const { pressed, hovered, focused } = state as WebPressState;
                    return {
                      flexDirection: 'row',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed || (desktop && hovered) ? t.c.card2 : n.read ? 'transparent' : t.c.chip,
                      // A desktop row is one line: icon, text, then the time at the far right.
                      ...(desktop ? { alignItems: 'center' as const, ...focusRing(t, focused) } : {}),
                    };
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor:
                        meta.tone === 'danger'
                          ? t.c.badSoft
                          : meta.tone === 'success'
                            ? t.c.goodSoft
                            : meta.tone === 'warning'
                              ? t.c.warnSoft
                              : meta.tone === 'info'
                                ? t.c.chip
                                : t.c.mutedSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name={meta.icon}
                      size={18}
                      color={
                        meta.tone === 'danger'
                          ? t.c.bad
                          : meta.tone === 'success'
                            ? t.c.good
                            : meta.tone === 'warning'
                              ? t.c.warn
                              : meta.tone === 'info'
                                ? t.c.info
                                : t.c.muted
                      }
                    />
                  </View>
                  {desktop ? (
                    <DesktopRowText n={n} />
                  ) : (
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text variant="body" weight={n.read ? '500' : '700'} style={{ flex: 1 }} numberOfLines={1}>
                          {n.title}
                        </Text>
                        {!n.read ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.c.primary }} /> : null}
                      </View>
                      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                        {n.body}
                      </Text>
                      <Text variant="micro" tone="muted">
                        {formatRelative(n.createdAt.slice(0, 10))}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Card>
        )}

        <View style={{ height: t.spacing.lg }} />
        {/* A sentence, so it wraps: a one-line badge cut it off on a phone. */}
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start', paddingHorizontal: t.spacing.xs }}>
          <Icon name="information-outline" size={16} color={t.c.muted} style={{ marginTop: 1 }} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            {tr('common:notifications.deliveryNote')}
          </Text>
        </View>
        </View>
      </ScrollView>

      {/* On a desktop, Clear all sits in the header instead. */}
      {notifications.length > 0 && !desktop ? (
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
          <Button title={tr('common:notifications.clearAll')} variant="ghost" icon="notification-clear-all" onPress={() => setConfirmClear(true)} fullWidth />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmClear}
        title={tr('common:notifications.clearTitle')}
        message={tr('common:notifications.clearMessageFull')}
        confirmLabel={tr('common:notifications.clear')}
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
          toast.show(tr('common:notifications.cleared'), 'success', { icon: 'notification-clear-all' });
        }}
      />
    </View>
  );
}

/** A notification's text on one desktop row: title and body, then when it arrived at the far right. */
function DesktopRowText({ n }: { n: AppNotification }) {
  const t = useTheme();
  return (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="body" weight={n.read ? '500' : '700'} numberOfLines={1}>
          {n.title}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={2}>
          {n.body}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: t.spacing.sm, minWidth: 110 }}>
        <Text variant="caption" tone="muted">
          {formatRelative(n.createdAt.slice(0, 10))}
        </Text>
        {/* The dot keeps its place when read, so the times stay in one column. */}
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.read ? 'transparent' : t.c.primary }} />
      </View>
    </>
  );
}
