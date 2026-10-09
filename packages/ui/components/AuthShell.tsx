import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { BrandLogo } from './BrandLogo';
import { SHOW_SCROLLBAR, useBreakpoint } from '../theme/breakpoints';
import type { WebPressState } from '../theme/interaction';

/** The sign-in form column on a desktop browser. */
export const AUTH_FORM_WIDTH = 380;

export function AuthShell({
  title,
  subtitle,
  children,
  hideBack,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hideBack?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const breakpoint = useBreakpoint();

  // A desktop browser shows this beside the brand panel: a centred form
  // column with a text back link, and no phone safe-area padding. The logo is
  // left to the panel unless the window is too narrow to show it.
  if (breakpoint !== 'phone') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: t.c.paper }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: t.spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: AUTH_FORM_WIDTH, gap: t.spacing.xxl }}>
          {!hideBack && router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={tr('common:component.goBack')}
              style={(state) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                alignSelf: 'flex-start',
                opacity: (state as WebPressState).hovered ? 0.7 : 1,
              })}
            >
              <MaterialCommunityIcons name="arrow-left" size={16} color={t.c.muted} />
              <Text variant="small" tone="muted" weight="600">
                {tr('common:component.goBack')}
              </Text>
            </Pressable>
          ) : null}

          <View style={{ gap: t.spacing.sm }}>
            {breakpoint === 'tablet' ? (
              <View style={{ marginBottom: t.spacing.md }}>
                <BrandLogo height={36} />
              </View>
            ) : null}
            <Text variant="h2">{title}</Text>
            {subtitle ? (
              <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: t.spacing.lg }}>{children}</View>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + t.spacing.lg,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: insets.bottom + t.spacing.xxxl,
          gap: t.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {!hideBack && router.canGoBack() ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('common:component.goBack')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: t.c.card2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={t.c.text} />
          </Pressable>
        ) : null}

        <View style={{ gap: t.spacing.sm }}>
          <View style={{ marginBottom: t.spacing.sm }}>
            <BrandLogo height={36} />
          </View>
          <Text variant="h2">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={{ lineHeight: 21 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: t.spacing.lg }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
