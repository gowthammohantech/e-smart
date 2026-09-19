import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Avatar } from '@/components/Avatar';
import { useAuditEvents } from '@/store/selectors';
import { formatDateTime } from '@/lib/date';

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  created: 'plus-circle-outline',
  updated: 'pencil-outline',
  deleted: 'trash-can-outline',
  finalized: 'check-decagram-outline',
  invited: 'account-plus-outline',
};

export default function AuditTrail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const events = useAuditEvents();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => `${e.action} ${e.entityType} ${e.entityLabel} ${e.actorName}`.toLowerCase().includes(q));
  }, [events, query]);

  const iconFor = (action: string) =>
    ICONS[action] ?? (action.startsWith('marked') ? 'flag-outline' : action.includes('payment') ? 'cash' : 'circle-small');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.auditTrail') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.sm }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search the trail" />
        <Text variant="caption" tone="muted">
          {filtered.length} events · append-only, newest first
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState icon="history" title="Nothing recorded" message="Actions you take are logged here." compact />
          ) : (
            filtered.slice(0, 150).map((e, i) => (
              <View
                key={e.id}
                style={{
                  flexDirection: 'row',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < Math.min(filtered.length, 150) - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                }}
              >
                <Avatar name={e.actorName} size={34} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name={iconFor(e.action)} size={14} color={t.c.muted} />
                    <Text variant="small" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                      {e.actorName} {e.action} {e.entityLabel}
                    </Text>
                  </View>
                  <Text variant="caption" tone="muted">
                    {e.entityType} · {formatDateTime(e.createdAt)}
                  </Text>
                </View>
                {e.device ? <Badge label={e.device} tone="neutral" size="sm" /> : null}
              </View>
            ))
          )}
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="lock-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
            Audit records cannot be edited or deleted from the app. Export them with your company backup for your records.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
