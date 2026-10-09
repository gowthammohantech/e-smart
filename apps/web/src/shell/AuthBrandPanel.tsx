import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { BrandLogo } from '@esmart/ui/components/BrandLogo';
import { WelcomeBackdrop } from '@esmart/ui/components/WelcomeBackdrop';
import { WelcomeScene } from '@esmart/ui/components/welcome/WelcomeScene';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const FEATURES: { key: 'gst' | 'money' | 'stock' | 'lixi'; icon: IconName }[] = [
  { key: 'gst', icon: 'shield-check-outline' },
  { key: 'money', icon: 'cash-check' },
  { key: 'stock', icon: 'package-variant-closed' },
  { key: 'lixi', icon: 'creation-outline' },
];

/**
 * The left half of the desktop sign-in screens: what the phone's Welcome
 * screen says, laid out for a wide window. Decorative apart from the copy.
 */
export function AuthBrandPanel() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const [width, setWidth] = useState(0);
  // The hero scales with the panel but stops before it crowds the copy.
  const sceneWidth = Math.min(Math.max(width - t.spacing.xxxl * 2, 0), 460);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', backgroundColor: t.c.bg, borderRightWidth: 1, borderRightColor: t.c.line }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <WelcomeBackdrop />
      <View style={{ flex: 1, padding: t.spacing.xxxl, justifyContent: 'space-between', gap: t.spacing.xxl }}>
        <BrandLogo height={40} />

        <View style={{ gap: t.spacing.xxl }}>
          {sceneWidth > 0 ? (
            <View style={{ alignItems: 'flex-start' }}>
              <WelcomeScene width={sceneWidth} />
            </View>
          ) : null}

          <View style={{ gap: t.spacing.md, maxWidth: 480 }}>
            <View
              style={{
                alignSelf: 'flex-start',
                paddingVertical: t.spacing.xs,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radius.pill,
                backgroundColor: t.c.chip,
              }}
            >
              <Text variant="micro" tone="primary" weight="700">
                {tr('auth:welcome.badge')}
              </Text>
            </View>
            <Text variant="display">{tr('auth:panel.headline')}</Text>
            <Text variant="body" tone="muted" style={{ lineHeight: 22 }}>
              {tr('auth:welcome.pitch')}
            </Text>
          </View>

          <View style={{ gap: t.spacing.md }}>
            {FEATURES.map((f) => (
              <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: t.radius.sm,
                    backgroundColor: t.c.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name={f.icon} size={18} color={t.c.primary} />
                </View>
                <Text variant="body" weight="500">
                  {tr(`auth:panel.feature.${f.key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text variant="small" tone="muted">
            {tr('auth:panel.footer')}
          </Text>
          <Text variant="micro" tone="muted">
            {tr('auth:welcome.buildNote')}
          </Text>
        </View>
      </View>
    </View>
  );
}
