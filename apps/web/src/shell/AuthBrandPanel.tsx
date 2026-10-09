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

/** The panel's copy column: centred, at a comfortable reading width. */
const CONTENT_WIDTH = 460;

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
  // The hero fills the content column but stops before it crowds the copy.
  const sceneWidth = Math.min(Math.max(width - t.spacing.xxxl * 2, 0), CONTENT_WIDTH, 380);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', backgroundColor: t.c.bg, borderRightWidth: 1, borderRightColor: t.c.line }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <WelcomeBackdrop />
      <View style={{ flex: 1, padding: t.spacing.xxxl, justifyContent: 'space-between', gap: t.spacing.xxl }}>
        <View style={{ width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center' }}>
          <BrandLogo height={34} />
        </View>

        <View style={{ gap: t.spacing.xl, width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center' }}>
          {sceneWidth > 0 ? (
            <View style={{ alignItems: 'flex-start' }}>
              <WelcomeScene width={sceneWidth} />
            </View>
          ) : null}

          <View style={{ gap: t.spacing.sm }}>
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
            <Text variant="h1" style={{ marginTop: t.spacing.xs }}>
              {tr('auth:panel.headline')}
            </Text>
            <Text variant="body" tone="muted" style={{ lineHeight: 22 }}>
              {tr('auth:welcome.pitch')}
            </Text>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            {FEATURES.map((f) => (
              <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: t.radius.sm,
                    backgroundColor: t.c.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name={f.icon} size={16} color={t.c.primary} />
                </View>
                <Text variant="small" weight="500">
                  {tr(`auth:panel.feature.${f.key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 4, width: '100%', maxWidth: CONTENT_WIDTH, alignSelf: 'center' }}>
          <Text variant="caption" tone="muted">
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
