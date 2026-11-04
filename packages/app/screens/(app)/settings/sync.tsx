import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { ListRow } from '@esmart/ui/components/ListRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useToast } from '@esmart/ui/components/Toast';
import { Sheet } from '@esmart/ui/components/Sheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import type { SyncQueueEntry, SyncStatus as SyncState } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { formatRelative } from '@esmart/core/lib/date';
import { blockerOf, type Entry } from '../../../remote/outbox';
import { remoteSession, useRemoteMeta } from '../../../remote';
import { useSyncToasts } from '../../../features/session/useSyncToasts';
import { drop, dropAll } from '../../../remote/outbox';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const STATUS_LABELS = {
  synced: 'settings:sync.status.synced',
  pending: 'settings:sync.status.pending',
  failed: 'settings:sync.status.failed',
  offline: 'settings:sync.status.offline',
} as const satisfies Record<SyncState, string>;

export default function SyncStatus() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();
  const sync = useSyncToasts();

  const allEntries = useAppStore((s) => s.syncQueue);
  // What is still to send.
  const queue = allEntries.filter((q) => q.status !== 'synced');
  const online = useRemoteMeta((m) => m.online);
  const syncing = useRemoteMeta((m) => m.syncing);
  const lastSyncAt = useRemoteMeta((m) => m.lastSyncAt);
  const lastError = useRemoteMeta((m) => m.lastError);
  const [open, setOpen] = useState<SyncQueueEntry | null>(null);
  const [discardAllOpen, setDiscardAllOpen] = useState(false);
  const offline = !online;
  const waitingOn = (q: SyncQueueEntry) => {
    const blocker = q.method && q.path ? blockerOf(q as Entry) : undefined;
    return blocker ? tr('settings:sync.waitingOn', { label: blocker.label }) : undefined;
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.syncStatus') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <Illustration name={offline ? 'offline' : 'all-settled'} size="full" />
          <Text variant="title" weight="700">
            {offline ? tr('settings:sync.workingOffline') : queue.length ? tr('settings:sync.waiting', { count: queue.length }) : tr('settings:sync.allSynced')}
          </Text>
          <Text variant="caption" tone="muted" center style={{ maxWidth: 280, lineHeight: 18 }}>
            {offline
              ? tr('settings:sync.offlineBody')
              : tr('settings:sync.onlineBody')}
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
                subtitle={waitingOn(q) ?? `${q.action} · ${q.entityType}`}
                meta={tr('settings:sync.queuedMeta', { when: formatRelative(q.queuedAt.slice(0, 10)), count: q.attempts })}
                icon={q.status === 'failed' ? 'cloud-alert' : 'cloud-upload-outline'}
                iconColor={q.status === 'failed' ? t.c.bad : t.c.primary}
                divider={i < queue.length - 1}
                right={<Badge label={tr(STATUS_LABELS[q.status])} tone={q.status === 'failed' ? 'danger' : 'warning'} size="sm" />}
                onPress={() => setOpen(q)}
              />
            ))
          )}
        </Card>

        <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
            <Text variant="caption" tone="muted" center>
              {offline
                ? tr('settings:sync.offlineNow')
                : lastSyncAt
                  ? tr('settings:sync.lastSynced', { when: formatRelative(lastSyncAt.slice(0, 10)) })
                  : tr('settings:sync.neverSynced')}
            </Text>
            {lastError ? (
              <Text variant="caption" tone="bad" center>
                {tr('settings:sync.lastError', { message: lastError })}
              </Text>
            ) : null}
            <Button title={tr('settings:sync.syncNow')} icon="sync" loading={syncing} onPress={() => void sync.syncEverything()} fullWidth />
            <Button title={tr('settings:sync.reload')} variant="ghost" icon="cloud-download-outline" disabled={offline} onPress={() => void sync.reload()} fullWidth />
          </View>

        {queue.some((q) => q.status === 'failed') ? (
          <Button
            title={tr('settings:sync.retryAll')}
            variant="secondary"
            icon="sync"
            style={{ marginTop: t.spacing.md }}
            onPress={() => void sync.syncEverything()}
            fullWidth
          />
        ) : null}
        {queue.length > 0 ? (
          <Button
            title={tr('settings:sync.discardAll')}
            variant="ghost"
            icon="delete-sweep-outline"
            disabled={offline}
            style={{ marginTop: t.spacing.sm }}
            onPress={() => setDiscardAllOpen(true)}
            fullWidth
          />
        ) : null}

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="information-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:sync.conflictNote')}</Text>
        </Card>
        {/* The queue is saved only on this device: clearing the browser's or the app's data deletes it. */}
        <Card variant="flat" style={{ marginTop: t.spacing.sm, flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="content-save-alert-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            {tr(Platform.OS === 'web' ? 'settings:sync.storageNoteWeb' : 'settings:sync.storageNoteApp')}
          </Text>
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
                setOpen(null);
                void sync.retryOne(open.id);
              }}
            />
            <Button
              title={tr('settings:sync.discard')}
              disabled={offline}
              variant="ghost"
              icon="delete-outline"
              fullWidth
              onPress={() => {
                if (!open) return;
                drop(open.id);
                setOpen(null);
                // Put back the server's version of whatever the change touched.
                void remoteSession.resync();
                toast.show(tr('settings:sync.discarded'), 'success', { icon: 'delete-sweep-outline', detail: open.label });
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
      <ConfirmDialog
        visible={discardAllOpen}
        title={tr('settings:sync.discardAllTitle', { count: queue.length })}
        message={tr('settings:sync.discardAllMessage')}
        confirmLabel={tr('settings:sync.discardAll')}
        destructive
        onCancel={() => setDiscardAllOpen(false)}
        onConfirm={() => {
          const count = queue.length;
          dropAll(queue.map((q) => q.id));
          setDiscardAllOpen(false);
          // Put back the server's version of everything the changes touched.
          void remoteSession.resync();
          toast.show(tr('settings:sync.discardedAll', { count }), 'success', { icon: 'delete-sweep-outline' });
        }}
      />
    </View>
  );
}
