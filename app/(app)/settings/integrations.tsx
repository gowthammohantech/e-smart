import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { Integration } from '@/types';

const GROUPS: { key: Integration['category']; title: string; blurb: string }[] = [
  { key: 'payments', title: 'Payments', blurb: 'Let customers pay an invoice without leaving it.' },
  { key: 'compliance', title: 'Compliance', blurb: 'Government filings and document generation.' },
  { key: 'messaging', title: 'Messaging', blurb: 'How invoices and reminders reach your customers.' },
  { key: 'accounting', title: 'Accounting', blurb: 'Hand data to your accountant in their format.' },
  { key: 'storage', title: 'Storage & backup', blurb: 'Where copies of your documents are kept.' },
];

export default function Integrations() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();
  const router = useRouter();

  const integrations = useAppStore((s) => s.integrations);
  const toggleIntegration = useAppStore((s) => s.toggleIntegration);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.integrations') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Each provider sits behind an adapter, so swapping one out never changes how your documents work. In this
            prototype the toggles are illustrative.
          </Text>
        </Card>

        {GROUPS.map((g) => {
          const rows = integrations.filter((i) => i.category === g.key);
          if (rows.length === 0) return null;
          return (
            <View key={g.key} style={{ marginBottom: t.spacing.xl }}>
              <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                {g.title}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginBottom: t.spacing.sm }}>
                {g.blurb}
              </Text>
              <Card padded={false}>
                {rows.map((i, idx) => (
                  <View
                    key={i.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: idx < rows.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: t.radius.sm,
                        backgroundColor: i.connected ? t.c.chip : t.c.mutedSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={i.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                        size={19}
                        color={i.connected ? t.c.primary : t.c.muted}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text variant="body" weight="600">
                          {i.name}
                        </Text>
                        {i.connected ? <Badge label={tr('settings:integrations.connected')} tone="success" size="sm" /> : null}
                      </View>
                      <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                        {i.description}
                      </Text>
                      {i.configRoute ? (
                        <Pressable
                          onPress={() => router.push(i.configRoute as never)}
                          accessibilityRole="button"
                          accessibilityLabel={`Configure ${i.name}`}
                          hitSlop={6}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                        >
                          <Text variant="caption" tone="primary" weight="600">{tr('settings:integrations.configure')}</Text>
                          <MaterialCommunityIcons name="chevron-right" size={14} color={t.c.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Switch
                      value={i.connected}
                      onValueChange={() => {
                        toggleIntegration(i.id);
                        toast.show(i.connected ? `${i.name} disconnected` : `${i.name} connected`, 'success');
                      }}
                      trackColor={{ true: t.c.primary, false: t.c.line }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel={`${i.connected ? 'Disconnect' : 'Connect'} ${i.name}`}
                    />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
