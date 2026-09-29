import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { WelcomeScene } from '@/components/welcome/WelcomeScene';
import { WelcomeBackdrop } from '@/components/WelcomeBackdrop';
import { BrandLogo } from '@/components/BrandLogo';

export default function Welcome() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.c.bg,
        paddingTop: insets.top + t.spacing.lg,
        paddingHorizontal: t.spacing.xl,
        paddingBottom: insets.bottom + t.spacing.lg,
      }}
    >
      <WelcomeBackdrop />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.xxl }}>
        <WelcomeScene />
        <View style={{ gap: t.spacing.md, alignItems: 'center' }}>
          <View
            style={{
              paddingVertical: t.spacing.xs,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.pill,
              backgroundColor: t.c.chip,
            }}
          >
            <Text variant="micro" tone="primary">
              {tr('auth:welcome.badge')}
            </Text>
          </View>
          <BrandLogo height={72} />
          <Text variant="body" tone="muted" center style={{ lineHeight: 22, maxWidth: 300 }}>
            {tr('auth:welcome.pitch')}
          </Text>
        </View>
      </View>

      <View style={{ gap: t.spacing.md }}>
        <Button title={tr('auth:welcome.getStarted')} onPress={() => router.push('/(auth)/sign-up')} fullWidth size="lg" />
        <Button title={tr('auth:welcome.haveAccount')} variant="ghost" onPress={() => router.push('/(auth)/sign-in')} fullWidth />
        <Text variant="micro" tone="muted" center>
          {tr('auth:welcome.buildNote')}
        </Text>
      </View>
    </View>
  );
}
