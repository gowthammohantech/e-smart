import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Avatar } from '@esmart/ui/components/Avatar';
import { useAuditEvents } from '../../../store/selectors';
import { formatDateTime } from '@esmart/core/lib/date';
import { auditChanges } from '@esmart/core/domain/auditDiff';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
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
  const { t: tr } = useTranslation(['nav', 'settings']);
  const events = useAuditEvents();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('settings:audit.search')} />
        <Text variant="caption" tone="muted">
          {filtered.length} events · append-only, newest first
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState icon="history" title={tr('settings:audit.none')} message={tr('settings:audit.noneBody')} compact />
          ) : (
            filtered.slice(0, 150).map((e, i) => {
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
                        <MaterialCommunityIcons name={iconFor(e.action)} size={14} color={t.c.muted} />
                        <Text variant="small" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                          {e.actorName} {e.action} {e.entityLabel}
                        </Text>
                      </View>
                      <Text variant="caption" tone="muted">
                        {e.entityType} · {formatDateTime(e.createdAt)}
                        {changes.length ? ` · ${tr('settings:audit.fieldsChanged', { count: changes.length })}` : ''}
                      </Text>
                    </View>
                    {e.device ? <Badge label={e.device} tone="neutral" size="sm" /> : null}
                    {changes.length ? <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.c.muted} /> : null}
                  </View>
                  {open ? (
                    <View style={{ marginLeft: 34 + t.spacing.md, gap: t.spacing.sm }}>
                      {changes.map((c) => (
                        <View key={c.field} style={{ gap: 2 }}>
                          <Text variant="caption" weight="600">{c.field === 'value' ? tr('settings:audit.value') : fieldLabel(c.field)}</Text>
                          <Text variant="caption" tone="bad" style={{ textDecorationLine: c.from ? 'line-through' : 'none' }}>
                            {c.from ?? tr('settings:audit.empty')}
                          </Text>
                          <Text variant="caption" tone="good">{c.to ?? tr('settings:audit.empty')}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </Card>

        <Card variant="flat" style={{ marginTop: t.spacing.lg, flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="lock-outline" size={19} color={t.c.muted} />
          <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>{tr('settings:audit.note')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
