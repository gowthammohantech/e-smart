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
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { SwitchField } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Illustration } from '@esmart/ui/components/Illustration';
import { useToast } from '@esmart/ui/components/Toast';
import { Sheet } from '@esmart/ui/components/Sheet';
import type { SyncQueueEntry } from '@esmart/core/types';
import { formatRelative } from '@esmart/core/lib/date';
import { useAppStore } from '@esmart/app/store/appStore';
import { useUiStore } from '@esmart/app/store/uiStore';
import { isRemote, remoteSession, syncNow, useRemoteMeta } from '@esmart/app/remote';
import { drop } from '@esmart/app/remote/outbox';

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
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
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
        <MaterialCommunityIcons name={icon} size={22} color={color} />
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

  const failed = queue.filter((q) => q.status === 'failed').length;
  const canRetryAll = failed > 0 || (!remote && queue.length > 0);
  const lastSynced = offline
    ? tr('settings:sync.offlineNow')
    : lastSyncAt
      ? tr('settings:sync.lastSynced', { when: formatRelative(lastSyncAt.slice(0, 10)) })
      : tr('settings:sync.neverSynced');

  const openEntry = (q: SyncQueueEntry) => {
    if (remote) return setOpen(q);
    retrySync(q.id);
    toast.show(tr('settings:sync.synced'), 'success');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.syncStatus') }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }}>
        {/* State and actions */}
        <Card style={{ padding: t.spacing.xxl }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xxl }}>
            <Illustration name={offline ? 'offline' : 'all-settled'} height={140} />
            <View style={{ flexGrow: 1, flexBasis: 320, gap: t.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Badge
                  label={offline ? 'Offline' : 'Online'}
                  tone={offline ? 'warning' : 'success'}
                  icon={offline ? 'cloud-off-outline' : 'cloud-check-outline'}
                  size="sm"
                />
                {remote ? (
                  <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {lastSynced}
                  </Text>
                ) : null}
              </View>
              <Text variant="h2" weight="700">
                {offline ? 'Working offline' : queue.length ? `${queue.length} waiting to sync` : 'Everything is synced'}
              </Text>
              <Text tone="muted" style={{ maxWidth: 520, lineHeight: 22 }}>
                {offline
                  ? 'You can keep drafting. Anything you create is queued and sent as soon as you are back online.'
                  : 'Finalised financial records are validated on the server before they count, so your books stay authoritative.'}
              </Text>
              {remote ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
                  <Button title={tr('settings:sync.syncNow')} icon="sync" loading={syncing} onPress={() => void syncNow()} />
                  <Button
                    title={tr('settings:sync.reload')}
                    variant="ghost"
                    icon="cloud-download-outline"
                    onPress={() => void syncNow().then(remoteSession.resync)}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Card>

        {/* The figures */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg }}>
          <Tile
            icon="cloud-upload-outline"
            label="Waiting to send"
            value={String(queue.length)}
            caption={queue.length ? 'Sent when online' : 'Nothing queued'}
            color={t.c.primary}
          />
          <Tile
            icon="cloud-alert"
            label="Needs attention"
            value={String(failed)}
            caption={failed ? 'Refused or conflicted' : 'No problems'}
            color={failed ? t.c.bad : t.c.good}
          />
          <Tile
            icon={offline ? 'cloud-off-outline' : 'cloud-check-outline'}
            label="Connection"
            value={offline ? 'Offline' : 'Online'}
            caption={remote ? lastSynced : 'Demo data on this device'}
            color={offline ? t.c.warn : t.c.good}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg, alignItems: 'flex-start' }}>
          {/* The queue */}
          <View style={{ flexGrow: 3, flexBasis: 440, gap: t.spacing.md, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
              <SectionTitle>{tr('settings:sync.queue')}</SectionTitle>
              {canRetryAll ? (
                <Button
                  title={tr('settings:sync.retryAll')}
                  variant="secondary"
                  size="sm"
                  icon="sync"
                  onPress={() => {
                    clearSyncQueue();
                    toast.show(tr('settings:sync.allSynced'), 'success');
                  }}
                />
              ) : null}
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
                scroll={false}
                columns={[
                  {
                    key: 'change',
                    header: 'Change',
                    flex: 3,
                    render: (q) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                        <MaterialCommunityIcons
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
                    header: 'Queued',
                    flex: 1.2,
                    secondary: true,
                    render: (q) => <Cell tone="muted">{formatRelative(q.queuedAt.slice(0, 10))}</Cell>,
                  },
                  {
                    key: 'attempts',
                    header: 'Attempts',
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
                    header: 'Status',
                    width: 110,
                    align: 'right',
                    render: (q) => <Badge label={q.status} tone={q.status === 'failed' ? 'danger' : 'warning'} size="sm" />,
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
            {remote ? null : (
              <View style={{ gap: t.spacing.md }}>
                <SectionTitle>{tr('settings:sync.prototypeControls')}</SectionTitle>
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
              </View>
            )}

            <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
              <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                {tr('settings:sync.conflictNote')}
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
              variant="ghost"
              icon="delete-outline"
              onPress={() => {
                if (!open) return;
                drop(open.id);
                setOpen(null);
                // Put back the server's version of whatever the change touched.
                void remoteSession.resync();
                toast.show(tr('settings:sync.discarded'), 'success');
              }}
            />
            <Button
              title={tr('settings:sync.retry')}
              icon="send"
              onPress={() => {
                if (!open) return;
                retrySync(open.id);
                setOpen(null);
                toast.show(tr('settings:sync.retrying'), 'success');
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
