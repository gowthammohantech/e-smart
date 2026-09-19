import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { WelcomeHero } from '@/components/WelcomeHero';
import { WelcomeBackdrop } from '@/components/WelcomeBackdrop';
import { BrandLogo } from '@/components/BrandLogo';

export default function Welcome() {
  const t = useTheme();
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
        <WelcomeHero />
        <View style={{ gap: t.spacing.md, alignItems: 'center' }}>
          <BrandLogo height={72} />
          <Text variant="body" tone="muted" center style={{ lineHeight: 22, maxWidth: 280 }}>
            Sell, invoice and stay GST-compliant from your phone.
          </Text>
        </View>
      </View>

      <View style={{ gap: t.spacing.md }}>
        <Button title="Get started" onPress={() => router.push('/(auth)/sign-up')} fullWidth size="lg" />
        <Button title="I already have an account" variant="ghost" onPress={() => router.push('/(auth)/sign-in')} fullWidth />
        <Text variant="micro" tone="muted" center>
          Prototype build · demo data only
        </Text>
      </View>
    </View>
  );
}
