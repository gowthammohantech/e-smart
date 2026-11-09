import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { remoteSession } from '../remote';
import { useAppStore } from '../store/appStore';

/**
 * In the header while someone is trying the public demo: a "Demo" pill. Tapping it says what the demo
 * is (sample businesses, read-only, refreshed weekly) and offers the way to an account of their own.
 */
export function DemoChip() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const demo = useAppStore((s) => s.session.demo);
  const [open, setOpen] = useState(false);
  if (!demo) return null;

  const signUp = async () => {
    setOpen(false);
    await remoteSession.signOut();
    router.replace('/(auth)/sign-up');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tr('common:demo.a11y')}
        style={({ pressed }) => ({
          height: 28,
          paddingHorizontal: 10,
          borderRadius: 14,
          justifyContent: 'center',
          backgroundColor: t.c.primary,
          flexShrink: 0,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text variant="caption" weight="700" style={{ color: t.c.onPrimary }}>
          {tr('common:demo.chip')}
        </Text>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={tr('common:demo.title')} scroll={false}>
        <View style={{ gap: t.spacing.lg, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg }}>
          <Text variant="body" tone="muted">
            {tr('common:demo.body')}
          </Text>
          <Button title={tr('common:demo.createAccount')} onPress={() => void signUp()} fullWidth />
          <Button title={tr('common:demo.keepExploring')} variant="ghost" onPress={() => setOpen(false)} fullWidth />
        </View>
      </Sheet>
    </>
  );
}
