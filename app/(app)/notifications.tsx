import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppStore } from '@/store/appStore';
import { useNotifications } from '@/store/selectors';
import { NotificationKind } from '@/types';
import { formatRelative } from '@/lib/date';

const META: Record<NotificationKind, { icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  invoiceSent: { icon: 'send-outline', tone: 'info' },
  paymentReceived: { icon: 'cash-check', tone: 'success' },
  invoiceOverdue: { icon: 'alert-circle-outline', tone: 'danger' },
  lowStock: { icon: 'package-variant', tone: 'warning' },
  compliance: { icon: 'shield-check-outline', tone: 'info' },
  syncFailure: { icon: 'cloud-alert', tone: 'danger' },
  system: { icon: 'information-outline', tone: 'neutral' },
};

export default function Notifications() {
  const t = useTheme();
  const router = useRouter();

  const notifications = useNotifications();
  const markRead = useAppStore((s) => s.markNotificationRead);
  const markAllRead = useAppStore((s) => s.markAllNotificationsRead);
  const clearAll = useAppStore((s) => s.clearNotifications);

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );
  const unread = notifications.filter((n) => !n.read).length;

  const routeFor = (entityType?: string, entityId?: string): string | null => {
    if (!entityType) return null;
    if (entityType === 'invoice' && entityId) return `/(app)/sales/invoices/${entityId}`;
    if (entityType === 'payment' && entityId) return `/(app)/payments/${entityId}`;
    if (entityType === 'inventory') return '/(app)/inventory/low-stock';
    if (entityType === 'compliance') return '/(app)/settings/integrations';
    if (entityType === 'system') return '/(app)/reports/tax-summary';
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={markAllRead} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mark all read">
                <Text variant="small" tone="primary" weight="600">
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <Segmented
          options={[
            { value: 'all', label: `All (${notifications.length})` },
            { value: 'unread', label: `Unread (${unread})` },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'unread')}
          size="sm"
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon="bell-check-outline"
              title={filter === 'unread' ? 'Nothing unread' : 'No notifications'}
              message="Invoices sent, payments received, overdue reminders and stock alerts land here."
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((n, i) => {
              const meta = META[n.kind];
              const route = routeFor(n.entityType, n.entityId);
              return (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    markRead(n.id);
                    if (route) router.push(route as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={n.title}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : n.read ? 'transparent' : t.c.chip,
                  })}
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
                              : t.c.mutedSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name={meta.icon}
                      size={18}
                      color={
                        meta.tone === 'danger'
                          ? t.c.bad
                          : meta.tone === 'success'
                            ? t.c.good
                            : meta.tone === 'warning'
                              ? t.c.warn
                              : t.c.muted
                      }
                    />
                  </View>
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
                </Pressable>
              );
            })}
          </Card>
        )}

        <View style={{ height: t.spacing.lg }} />
        <Badge label="Delivered in-app · push, email and WhatsApp are configured under Integrations" tone="neutral" />
      </ScrollView>

      {notifications.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: t.spacing.lg,
            paddingBottom: t.spacing.xl,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
          }}
        >
          <Button title="Clear all" variant="ghost" icon="notification-clear-all" onPress={() => setConfirmClear(true)} fullWidth />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmClear}
        title="Clear all notifications?"
        message="They will be removed from this business's list. The underlying records are untouched."
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll();
          setConfirmClear(false);
        }}
      />
    </View>
  );
}
