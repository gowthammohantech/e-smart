import React from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { SwitchField } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/uiStore';
import { formatRelative } from '@/lib/date';

export default function SyncStatus() {
  const t = useTheme();
  const toast = useToast();

  const queue = useAppStore((s) => s.syncQueue);
  const retrySync = useAppStore((s) => s.retrySync);
  const clearSyncQueue = useAppStore((s) => s.clearSyncQueue);
  const offline = useUiStore((s) => s.offlineMode);
  const setOffline = useUiStore((s) => s.setOfflineMode);
  const simulateLatency = useUiStore((s) => s.simulateLatency);
  const setSimulateLatency = useUiStore((s) => s.setSimulateLatency);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Sync status' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: offline ? t.c.warnSoft : queue.length ? t.c.chip : t.c.goodSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons
              name={offline ? 'cloud-off-outline' : queue.length ? 'cloud-sync-outline' : 'cloud-check-outline'}
              size={27}
              color={offline ? t.c.warn : queue.length ? t.c.primary : t.c.good}
            />
          </View>
          <Text variant="title" weight="700">
            {offline ? 'Working offline' : queue.length ? `${queue.length} waiting to sync` : 'Everything is synced'}
          </Text>
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>
            {offline
              ? 'You can keep drafting. Anything you create is queued and sent as soon as you are back online.'
              : 'Finalised financial records are validated on the server before they count, so your books stay authoritative.'}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          Queue
        </Text>
        <Card padded={false}>
          {queue.length === 0 ? (
            <EmptyState icon="cloud-check-outline" title="Nothing queued" message="Every change has reached the server." compact />
          ) : (
            queue.map((q, i) => (
              <ListRow
                key={q.id}
                title={q.label}
                subtitle={`${q.action} · ${q.entityType}`}
                meta={`Queued ${formatRelative(q.queuedAt.slice(0, 10))} · ${q.attempts} attempt${q.attempts === 1 ? '' : 's'}`}
                icon={q.status === 'failed' ? 'cloud-alert' : 'cloud-upload-outline'}
                iconColor={q.status === 'failed' ? t.c.bad : t.c.primary}
                divider={i < queue.length - 1}
                right={<Badge label={q.status} tone={q.status === 'failed' ? 'danger' : 'warning'} size="sm" />}
                onPress={() => {
                  retrySync(q.id);
                  toast.show('Synced', 'success');
                }}
              />
            ))
          )}
        </Card>

        {queue.length > 0 ? (
          <Button
            title="Retry all"
            variant="secondary"
            icon="sync"
            style={{ marginTop: t.spacing.md }}
            onPress={() => {
              clearSyncQueue();
              toast.show('All changes synced', 'success');
            }}
            fullWidth
          />
        ) : null}

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>
          Prototype controls
        </Text>
        <Card>
          <SwitchField
            label="Simulate offline"
            description="Shows the offline badge and queues new work instead of syncing it."
            value={offline}
            onValueChange={setOffline}
          />
          <SwitchField
            label="Simulate network latency"
            description="Adds a short delay with loading states so slow connections can be demonstrated."
            value={simulateLatency}
            onValueChange={setSimulateLatency}
          />
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            Conflicts are surfaced for you to resolve rather than being overwritten silently.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
