import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { BrandLogo } from './BrandLogo';
import { SHOW_SCROLLBAR, useBreakpoint } from '../theme/breakpoints';
import type { WebPressState } from '../theme/interaction';
import { Illustration } from './Illustration';
import { PageBackdrop } from './PageBackdrop';
import type { IllustrationName } from '../illustrations/registry';
import { useEntrance } from '../illustrations/motion';

/** The sign-in form column on a desktop browser. */
export const AUTH_FORM_WIDTH = 380;

export function AuthShell({
  title,
  subtitle,
  children,
  hideBack,
  locked,
  illustration = 'secure',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hideBack?: boolean;
  /** Nothing on the screen responds, the back link included; for the moment a sign-in is in flight. */
  locked?: boolean;
  /** The scene beside the logo on a phone; `null` when the content brings its own. */
  illustration?: IllustrationName | null;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const breakpoint = useBreakpoint();
  const enter = useEntrance({ rise: 12, duration: 320 });

  // The browser tab names this page, not whichever page was open before.
  useEffect(() => {
    if (Platform.OS !== 'web' || !title || typeof document === 'undefined') return;
    document.title = `${title} · Elixir Books`;
  }, [title]);

  // A desktop browser shows this beside the brand panel: a centred form
  // column with a text back link, and no phone safe-area padding. The logo is
  // left to the panel. A tablet-width half is narrow, so the margin tightens.
  if (breakpoint !== 'phone') {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.paper }}>
      <PageBackdrop surface={t.c.paper} />
      <ScrollView
        pointerEvents={locked ? 'none' : 'auto'}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: breakpoint === 'tablet' ? t.spacing.xl : t.spacing.xxxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[{ width: '100%', maxWidth: AUTH_FORM_WIDTH, gap: t.spacing.xxl }, enter]}>
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
              <Icon name="arrow-left" size={16} color={t.c.muted} />
              <Text variant="small" tone="muted" weight="600">
                {tr('common:component.goBack')}
              </Text>
            </Pressable>
          ) : null}

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="h2">{title}</Text>
            {subtitle ? (
              <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: t.spacing.lg }}>{children}</View>
        </Animated.View>
      </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      pointerEvents={locked ? 'none' : 'auto'}
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PageBackdrop />
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
            <Icon name="arrow-left" size={19} color={t.c.text} />
          </Pressable>
        ) : null}

        <Animated.View style={[{ gap: t.spacing.sm }, enter]}>
          <View style={{ marginBottom: t.spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BrandLogo height={36} />
            {illustration ? <Illustration name={illustration} height={84} /> : null}
          </View>
          <Text variant="h2">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={{ lineHeight: 21 }}>
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>

        <View style={{ gap: t.spacing.lg }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
