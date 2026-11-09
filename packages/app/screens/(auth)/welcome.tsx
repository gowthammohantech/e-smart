import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { WelcomeScene } from '@esmart/ui/components/welcome/WelcomeScene';
import { WelcomeBackdrop } from '@esmart/ui/components/WelcomeBackdrop';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { AUTH_FORM_WIDTH } from '@esmart/ui/components/AuthShell';

export default function Welcome() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();

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

      {/* A wide browser window keeps the buttons to the sign-in form's width. */}
      <View style={desktop ? { gap: t.spacing.md, width: '100%', maxWidth: AUTH_FORM_WIDTH, alignSelf: 'center' } : { gap: t.spacing.md }}>
        <Button title={tr('auth:welcome.getStarted')} onPress={() => router.push('/(auth)/sign-up')} fullWidth />
        <Button title={tr('auth:welcome.haveAccount')} variant="ghost" onPress={() => router.push('/(auth)/sign-in')} fullWidth />
        <Text variant="micro" tone="muted" center>
          {tr('auth:welcome.buildNote')}
        </Text>
      </View>
    </View>
  );
}
