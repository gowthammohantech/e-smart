import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { ListRow } from '@esmart/ui/components/ListRow';
import { SwitchField } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useToast } from '@esmart/ui/components/Toast';
import { Sheet } from '@esmart/ui/components/Sheet';
import type { SyncQueueEntry } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useUiStore } from '../../../store/uiStore';
import { formatRelative } from '@esmart/core/lib/date';
import { isRemote, remoteSession, syncNow, useRemoteMeta } from '../../../remote';
import { drop } from '../../../remote/outbox';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function SyncStatus() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

  const remote = isRemote();
  const allEntries = useAppStore((s) => s.syncQueue);
  // Remote mode lists what is still to send; the demo lists its seeded rows.
  const queue = remote ? allEntries.filter((q) => q.status !== 'synced') : allEntries;
  const online = useRemoteMeta((m) => m.online);
  const syncing = useRemoteMeta((m) => m.syncing);
  const lastSyncAt = useRemoteMeta((m) => m.lastSyncAt);
  const [open, setOpen] = useState<SyncQueueEntry | null>(null);
  const retrySync = useAppStore((s) => s.retrySync);
  const clearSyncQueue = useAppStore((s) => s.clearSyncQueue);
  const simulatedOffline = useUiStore((s) => s.offlineMode);
  const offline = remote ? !online : simulatedOffline;
  const setOffline = useUiStore((s) => s.setOfflineMode);
  const simulateLatency = useUiStore((s) => s.simulateLatency);
  const setSimulateLatency = useUiStore((s) => s.setSimulateLatency);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.syncStatus') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <Illustration name={offline ? 'offline' : 'all-settled'} size="full" />
          <Text variant="title" weight="700">
            {offline ? 'Working offline' : queue.length ? `${queue.length} waiting to sync` : 'Everything is synced'}
          </Text>
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>
            {offline
              ? 'You can keep drafting. Anything you create is queued and sent as soon as you are back online.'
              : 'Finalised financial records are validated on the server before they count, so your books stay authoritative.'}
          </Text>
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:sync.queue')}</Text>
        <Card padded={false}>
          {queue.length === 0 ? (
            <EmptyState illustration="all-settled" icon="cloud-check-outline" title={tr('settings:sync.none')} message={tr('settings:sync.noneBody')} compact />
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
                  if (remote) return setOpen(q);
                  retrySync(q.id);
                  toast.show(tr('settings:sync.synced'), 'success');
                }}
              />
            ))
          )}
        </Card>

        {remote ? (
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <Text variant="caption" tone="muted" center>
              {offline
                ? tr('settings:sync.offlineNow')
                : lastSyncAt
                  ? tr('settings:sync.lastSynced', { when: formatRelative(lastSyncAt.slice(0, 10)) })
                  : tr('settings:sync.neverSynced')}
            </Text>
            <Button title={tr('settings:sync.syncNow')} icon="sync" loading={syncing} onPress={() => void syncNow()} fullWidth />
            <Button title={tr('settings:sync.reload')} variant="ghost" icon="cloud-download-outline" onPress={() => void syncNow().then(remoteSession.resync)} fullWidth />
          </View>
        ) : null}

        {queue.some((q) => q.status === 'failed') || (!remote && queue.length > 0) ? (
          <Button
            title={tr('settings:sync.retryAll')}
            variant="secondary"
            icon="sync"
            style={{ marginTop: t.spacing.md }}
            onPress={() => {
              clearSyncQueue();
              toast.show(tr('settings:sync.allSynced'), 'success');
            }}
            fullWidth
          />
        ) : null}

        {remote ? null : (
        <>
        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:sync.prototypeControls')}</Text>
        <Card>
          <SwitchField
            label={tr('settings:sync.simulateOffline')}
            description={tr('settings:sync.offlineHint')}
            value={offline}
            onValueChange={setOffline}
          />
          <SwitchField
            label={tr('settings:sync.simulateLatency')}
            description={tr('settings:sync.latencyHint')}
            value={simulateLatency}
            onValueChange={setSimulateLatency}
          />
        </Card>
        </>
        )}

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:sync.conflictNote')}</Text>
        </Card>
      </ScrollView>

      <Sheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open?.conflict ? tr('settings:sync.conflictTitle') : open?.status === 'failed' ? tr('settings:sync.rejectedTitle') : open?.label}
        footer={
          <View style={{ gap: t.spacing.sm }}>
            <Button
              title={tr('settings:sync.retry')}
              icon="send"
              fullWidth
              onPress={() => {
                if (!open) return;
                retrySync(open.id);
                setOpen(null);
                toast.show(tr('settings:sync.retrying'), 'success');
              }}
            />
            <Button
              title={tr('settings:sync.discard')}
              variant="ghost"
              icon="delete-outline"
              fullWidth
              onPress={() => {
                if (!open) return;
                drop(open.id);
                setOpen(null);
                // Put back the server's version of whatever the change touched.
                void remoteSession.resync();
                toast.show(tr('settings:sync.discarded'), 'success');
              }}
            />
          </View>
        }
      >
        <View style={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.sm }}>
          <Text weight="600">{open?.label}</Text>
          <Text variant="caption" tone="muted">
            {open?.conflict ? tr('settings:sync.conflictBody') : (open?.lastError ?? `${open?.action ?? ''} · ${open?.entityType ?? ''}`)}
          </Text>
        </View>
      </Sheet>
    </View>
  );
}
