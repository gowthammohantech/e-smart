import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Cell, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useToast } from '@esmart/ui/components/Toast';
import { Sheet } from '@esmart/ui/components/Sheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import type { SyncQueueEntry } from '@esmart/core/types';
import { formatRelative } from '@esmart/core/lib/date';
import { useAppStore } from '@esmart/app/store/appStore';
import { remoteSession, useRemoteMeta } from '@esmart/app/remote';
import { useSyncToasts } from '@esmart/app/features/session/useSyncToasts';
import { drop, dropAll } from '@esmart/app/remote/outbox';

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="micro" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {children}
    </Text>
  );
}

function Tile({
  icon,
  label,
  value,
  caption,
  color,
}: {
  icon: IconName;
  label: string;
  value: string;
  caption?: string;
  color: string;
}) {
  const t = useTheme();
  return (
    <Card style={{ flexGrow: 1, flexBasis: 200, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: t.radius.md,
          backgroundColor: t.c.card2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="h3" weight="700" numberOfLines={1}>
          {value}
        </Text>
        {caption ? (
          <Text variant="micro" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Sync status on a desktop: the state and its actions up top, three figures
 * beneath, then the queue as a table beside the controls and the note. Same
 * data and actions as the phone screen
 * (`@esmart/app/screens/(app)/settings/sync`).
 */
export function SyncStatusDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings', 'common']);
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
  const offline = !online;

  const failed = queue.filter((q) => q.status === 'failed').length;
  const canRetryAll = failed > 0;
  const [discardAllOpen, setDiscardAllOpen] = useState(false);
  const lastSynced = offline
    ? tr('settings:sync.offlineNow')
    : lastSyncAt
      ? tr('settings:sync.lastSynced', { when: formatRelative(lastSyncAt.slice(0, 10)) })
      : tr('settings:sync.neverSynced');

  const openEntry = (q: SyncQueueEntry) => setOpen(q);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.syncStatus') }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }}>
        {/* State and actions */}
        <Card style={{ padding: t.spacing.xxl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xxl }}>
            <Illustration name={offline ? 'offline' : 'all-settled'} height={140} />
            <View style={{ flexGrow: 1, flexBasis: 320, gap: t.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Badge
                  label={offline ? tr('settings:sync.status.offline') : tr('settings:sync.online')}
                  tone={offline ? 'warning' : 'success'}
                  icon={offline ? 'cloud-off-outline' : 'cloud-check-outline'}
                  size="sm"
                />
                <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {lastSynced}
                </Text>
              </View>
              <Text variant="h2" weight="700">
                {offline ? tr('settings:sync.workingOffline') : queue.length ? tr('settings:sync.waiting', { count: queue.length }) : tr('settings:sync.allSynced')}
              </Text>
              <Text tone="muted" style={{ maxWidth: 520, lineHeight: 22 }}>
                {offline ? tr('settings:sync.offlineBody') : tr('settings:sync.onlineBody')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
                {lastError ? (
                  <Text variant="caption" tone="bad">
                    {tr('settings:sync.lastError', { message: lastError })}
                  </Text>
                ) : null}
                <Button title={tr('settings:sync.syncNow')} icon="sync" loading={syncing} onPress={() => void sync.syncEverything()} />
                <Button
                  title={tr('settings:sync.reload')}
                  variant="ghost"
                  icon="cloud-download-outline"
                  disabled={offline} onPress={() => void sync.reload()}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* The figures */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg }}>
          <Tile
            icon="cloud-upload-outline"
            label={tr('settings:sync.tile.waitingToSend')}
            value={String(queue.length)}
            caption={queue.length ? tr('settings:sync.tile.sentWhenOnline') : tr('settings:sync.none')}
            color={t.c.primary}
          />
          <Tile
            icon="cloud-alert"
            label={tr('settings:sync.tile.needsAttention')}
            value={String(failed)}
            caption={failed ? tr('settings:sync.tile.refusedOrConflicted') : tr('settings:sync.tile.noProblems')}
            color={failed ? t.c.bad : t.c.good}
          />
          <Tile
            icon={offline ? 'cloud-off-outline' : 'cloud-check-outline'}
            label={tr('settings:sync.tile.connection')}
            value={offline ? tr('settings:sync.status.offline') : tr('settings:sync.online')}
            caption={lastSynced}
            color={offline ? t.c.warn : t.c.good}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'flex-start' }}>
          {/* The queue */}
          <View style={{ flexGrow: 3, flexBasis: 440, gap: t.spacing.md, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
              <SectionTitle>{tr('settings:sync.queue')}</SectionTitle>
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                {queue.length > 0 ? (
                  <Button
                    title={tr('settings:sync.discardAll')}
                    variant="ghost"
                    size="sm"
                    icon="delete-sweep-outline"
                    disabled={offline}
                    onPress={() => setDiscardAllOpen(true)}
                  />
                ) : null}
                {canRetryAll ? (
                  <Button
                    title={tr('settings:sync.retryAll')}
                    variant="secondary"
                    size="sm"
                    icon="sync"
                    onPress={() => void sync.syncEverything()}
                  />
                ) : null}
              </View>
            </View>
            {queue.length === 0 ? (
              <Card padded={false}>
                <EmptyState
                  illustration="all-settled"
                  icon="cloud-check-outline"
                  title={tr('settings:sync.none')}
                  message={tr('settings:sync.noneBody')}
                  compact
                />
              </Card>
            ) : (
              <DataTable<SyncQueueEntry>
                pageSize={TABLE_PAGE_SIZE}
                scroll={false}
                columns={[
                  {
                    key: 'change',
                    header: tr('settings:sync.col.change'),
                    flex: 3,
                    render: (q) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                        <Icon
                          name={q.status === 'failed' ? 'cloud-alert' : 'cloud-upload-outline'}
                          size={18}
                          color={q.status === 'failed' ? t.c.bad : t.c.primary}
                        />
                        <View style={{ flexShrink: 1 }}>
                          <Cell weight="600">{q.label}</Cell>
                          <Cell tone="muted">{`${q.action} · ${q.entityType}`}</Cell>
                        </View>
                      </View>
                    ),
                  },
                  {
                    key: 'queued',
                    header: tr('settings:sync.col.queued'),
                    flex: 1.2,
                    secondary: true,
                    render: (q) => <Cell tone="muted">{formatRelative(q.queuedAt.slice(0, 10))}</Cell>,
                  },
                  {
                    key: 'attempts',
                    header: tr('settings:sync.col.attempts'),
                    width: 90,
                    align: 'right',
                    secondary: true,
                    render: (q) => (
                      <Cell mono tone="muted">
                        {q.attempts}
                      </Cell>
                    ),
                  },
                  {
                    key: 'status',
                    header: tr('common:table.status'),
                    width: 110,
                    align: 'right',
                    render: (q) => <Badge label={tr(`settings:sync.status.${q.status}`)} tone={q.status === 'failed' ? 'danger' : 'warning'} size="sm" />,
                  },
                ]}
                rows={queue}
                rowKey={(q) => q.id}
                onRowPress={openEntry}
                rowLabel={(q) => q.label}
              />
            )}
          </View>

          {/* Controls and the note */}
          <View style={{ flexGrow: 2, flexBasis: 300, gap: t.spacing.lg, minWidth: 0 }}>
            <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Icon name="information-outline" size={19} color={t.c.muted} />
              <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                {tr('settings:sync.conflictNote')}
              </Text>
            </Card>
            {/* The queue is saved only in this browser: clearing its site data deletes it. */}
            <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Icon name="content-save-alert-outline" size={19} color={t.c.muted} />
              <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                {tr('settings:sync.storageNoteWeb')}
              </Text>
            </Card>
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open?.conflict ? tr('settings:sync.conflictTitle') : open?.status === 'failed' ? tr('settings:sync.rejectedTitle') : open?.label}
        footer={
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm, padding: t.spacing.lg }}>
            <Button
              title={tr('settings:sync.discard')}
              disabled={offline}
              variant="ghost"
              icon="delete-outline"
              onPress={() => {
                if (!open) return;
                drop(open.id);
                setOpen(null);
                // Put back the server's version of whatever the change touched.
                void remoteSession.resync();
                toast.show(tr('settings:sync.discarded'), 'success', { icon: 'delete-sweep-outline', detail: open.label });
              }}
            />
            <Button
              title={tr('settings:sync.retry')}
              icon="send"
              onPress={() => {
                if (!open) return;
                setOpen(null);
                void sync.retryOne(open.id);
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
