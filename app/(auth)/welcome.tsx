import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';

const HIGHLIGHTS: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }[] = [
  { icon: 'file-document-edit-outline', title: 'Invoice in under a minute', body: 'GST-ready invoices you can share on WhatsApp straight away.' },
  { icon: 'cash-clock', title: 'Know who owes you', body: 'Live receivables, aging buckets and one-tap reminders.' },
  { icon: 'package-variant-closed', title: 'Stock that stays honest', body: 'Every sale and purchase updates your stock automatically.' },
];

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top + t.spacing.xxxl, paddingHorizontal: t.spacing.xl, paddingBottom: insets.bottom + t.spacing.xl }}>
      <View style={{ flex: 1, gap: t.spacing.xxxl }}>
        <View style={{ gap: t.spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: t.radius.lg,
              backgroundColor: t.c.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="chart-box-outline" size={30} color={t.c.onPrimary} />
          </View>
          <Text variant="h1">Elixir Books Smart</Text>
          <Text variant="body" tone="muted" style={{ lineHeight: 22 }}>
            Run the money side of your business from your phone — invoices, payments, purchases and stock, without the
            accounting jargon.
          </Text>
        </View>

        <View style={{ gap: t.spacing.xl }}>
          {HIGHLIGHTS.map((h) => (
            <View key={h.title} style={{ flexDirection: 'row', gap: t.spacing.lg, alignItems: 'flex-start' }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: t.radius.md,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name={h.icon} size={20} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="body" weight="600">
                  {h.title}
                </Text>
                <Text variant="small" tone="muted" style={{ lineHeight: 19 }}>
                  {h.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: t.spacing.md }}>
        <Button title="Get started" onPress={() => router.push('/(auth)/sign-up')} fullWidth size="lg" />
        <Button title="I already have an account" variant="ghost" onPress={() => router.push('/(auth)/sign-in')} fullWidth />
        <Text variant="micro" tone="muted" center style={{ marginTop: t.spacing.sm }}>
          Prototype build · demo data only
        </Text>
      </View>
    </View>
  );
}
