import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { Stepper } from './Stepper';
import { SHOW_SCROLLBAR, useIsDesktop, WIDE_FORM_MAX_WIDTH } from '../theme/breakpoints';
import { ScrollKeepContext, type ScrollKeep } from './ScrollKeep';
import { Illustration } from './Illustration';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBackdrop } from './PageBackdrop';
import { isIllustrationName } from '../illustrations/registry';
import { useEntrance } from '../illustrations/motion';

/** The step content column on a desktop browser: the long-form width the rest of the app's forms use. */
export const WIZARD_CONTENT_WIDTH = WIDE_FORM_MAX_WIDTH;

export function WizardShell({
  title,
  subtitle,
  steps,
  currentStep,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  onSkip,
  onSignOut,
}: {
  title: string;
  subtitle?: string;
  /** Onboarding step keys; named from `onboarding:step.*`. */
  steps?: readonly string[];
  currentStep?: number;
  children: React.ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onSkip?: () => void;
  /** On a phone's first step there is no back; this offers the way out to sign-in. */
  onSignOut?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'onboarding']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  // A step outside the plan's list (country, branches) shows no "Step 0 of N" progress.
  const hasSteps = !!steps && currentStep !== undefined && currentStep >= 0 && currentStep < steps.length;
  const stepKey = hasSteps ? steps[currentStep] : undefined;
  const primary = primaryLabel ?? tr('common:component.continue');
  const [signOutOpen, setSignOutOpen] = useState(false);

  // The browser tab names the step, not whichever page was open before.
  useEffect(() => {
    if (Platform.OS !== 'web' || !title || typeof document === 'undefined') return;
    document.title = `${title} · Elixir Books`;
  }, [title]);
  const scene = stepKey ? `onboarding-${stepKey}` : undefined;
  const art = scene && isIllustrationName(scene) ? scene : undefined;
  const enter = useEntrance({ key: stepKey, rise: 10, duration: 300 });

  // Pickers on the form restore this position when their sheet closes.
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const keep = useMemo<ScrollKeep>(
    () => ({ y: offset, scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: false }) }),
    [],
  );
  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };

  // On a desktop the web layout draws the step rail beside this, so the
  // Stepper and round back button go; actions sit in a footer bar under the
  // form, with Back on the left and the way forward on the right.
  if (desktop) {
    return (
      <ScrollKeepContext.Provider value={keep}>
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <PageBackdrop />
        <ScrollView
          ref={scrollRef}
          onScroll={track}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: t.spacing.xxxl, paddingHorizontal: t.spacing.xxxl, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          <Animated.View style={[{ width: '100%', maxWidth: WIZARD_CONTENT_WIDTH, gap: t.spacing.xl }, enter]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xl }}>
            <View style={{ gap: t.spacing.sm, flex: 1 }}>
              {hasSteps ? (
                <Text variant="caption" tone="primary" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {tr('onboarding:stepProgress', {
                    current: currentStep + 1,
                    total: steps!.length,
                    step: tr(`onboarding:step.${steps![currentStep!]}` as 'onboarding:step.tax'),
                  })}
                </Text>
              ) : null}
              <Text variant="h1">{title}</Text>
              {subtitle ? (
                <Text variant="body" tone="muted" style={{ lineHeight: 22 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {art ? <Illustration name={art} height={132} /> : null}
            </View>
            <View style={{ gap: t.spacing.lg }}>{children}</View>
          </Animated.View>
        </ScrollView>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.c.paper,
            paddingVertical: t.spacing.lg,
            paddingHorizontal: t.spacing.xxxl,
            alignItems: 'center',
          }}
        >
          <View style={{ width: '100%', maxWidth: WIZARD_CONTENT_WIDTH, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            {router.canGoBack() ? (
              <Button title={tr('common:component.goBack')} variant="ghost" icon="arrow-left" onPress={() => router.back()} />
            ) : null}
            <View style={{ flex: 1 }} />
            {onSkip ? <Button title={tr('common:component.skip')} variant="secondary" onPress={onSkip} /> : null}
            {secondaryLabel && onSecondary ? <Button title={secondaryLabel} variant="ghost" onPress={onSecondary} /> : null}
            <Button title={primary} onPress={onPrimary} disabled={primaryDisabled} iconRight="arrow-right" />
          </View>
        </View>
      </View>
      </ScrollKeepContext.Provider>
    );
  }

  return (
    <ScrollKeepContext.Provider value={keep}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PageBackdrop />
      <View
        style={{
          paddingTop: insets.top + t.spacing.md,
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.md,
          gap: t.spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={tr('common:component.goBack')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: t.c.card2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="arrow-left" size={19} color={t.c.text} />
            </Pressable>
          ) : onSignOut ? (
            <Pressable
              onPress={() => setSignOutOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={tr('common:component.signOut')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 }}
            >
              <Icon name="logout" size={16} color={t.c.muted} />
              <Text variant="small" tone="muted" weight="600">{tr('common:component.signOut')}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          {onSkip ? (
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:component.skip')}>
              <Text variant="small" tone="muted" weight="600">{tr('common:component.skip')}</Text>
            </Pressable>
          ) : null}
        </View>

        {hasSteps ? <Stepper steps={steps!.map((k) => tr(`onboarding:step.${k}` as 'onboarding:step.tax'))} current={currentStep!} /> : null}
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={track}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.xxxl,
          gap: t.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {/* The title scrolls with the form, so a short phone with the keyboard up keeps room for the fields. */}
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingTop: t.spacing.xs }, enter]}>
          <View style={{ gap: 6, flex: 1 }}>
            <Text variant="h2">{title}</Text>
            {subtitle ? (
              <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {art ? <Illustration name={art} height={76} /> : null}
        </Animated.View>
        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: t.spacing.xl,
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.bg,
          gap: t.spacing.sm,
        }}
      >
        <Button title={primary} onPress={onPrimary} disabled={primaryDisabled} fullWidth />
        {secondaryLabel && onSecondary ? (
          <Button title={secondaryLabel} variant="ghost" onPress={onSecondary} fullWidth />
        ) : null}
      </View>
      {onSignOut ? (
        <ConfirmDialog
          visible={signOutOpen}
          title={tr('common:component.signOutConfirmTitle')}
          message={tr('common:component.signOutConfirmBody')}
          confirmLabel={tr('common:component.signOut')}
          icon="logout"
          onConfirm={() => {
            setSignOutOpen(false);
            onSignOut();
          }}
          onCancel={() => setSignOutOpen(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
    </ScrollKeepContext.Provider>
  );
}
