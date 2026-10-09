import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { Stepper } from './Stepper';
import { SHOW_SCROLLBAR, useIsDesktop } from '../theme/breakpoints';

/** The step content column on a desktop browser. */
export const WIZARD_CONTENT_WIDTH = 760;

export function WizardShell({
  title,
  subtitle,
  steps,
  currentStep,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  onSkip,
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
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'onboarding']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();

  // On a desktop the web layout draws the step rail beside this, so the
  // Stepper and round back button go; actions sit in a footer bar under the
  // form, with Back on the left and the way forward on the right.
  if (desktop) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: t.spacing.xxxl, paddingHorizontal: t.spacing.xxxl, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        >
          <View style={{ width: '100%', maxWidth: WIZARD_CONTENT_WIDTH, gap: t.spacing.xl }}>
            <View style={{ gap: t.spacing.sm }}>
              {steps && currentStep !== undefined ? (
                <Text variant="caption" tone="primary" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {tr('onboarding:stepProgress', {
                    current: currentStep + 1,
                    total: steps.length,
                    step: tr(`onboarding:step.${steps[currentStep]}` as 'onboarding:step.tax'),
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
            <View style={{ gap: t.spacing.lg }}>{children}</View>
          </View>
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
            <Button title={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} iconRight="arrow-right" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
              <MaterialCommunityIcons name="arrow-left" size={19} color={t.c.text} />
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

        {steps && currentStep !== undefined ? <Stepper steps={steps.map((k) => tr(`onboarding:step.${k}` as 'onboarding:step.tax'))} current={currentStep} /> : null}

        <View style={{ gap: 6 }}>
          <Text variant="h2">{title}</Text>
          {subtitle ? (
            <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.xl,
          paddingBottom: t.spacing.xxxl,
          gap: t.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
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
        <Button title={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} fullWidth size="lg" />
        {secondaryLabel && onSecondary ? (
          <Button title={secondaryLabel} variant="ghost" onPress={onSecondary} fullWidth />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
