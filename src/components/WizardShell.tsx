import React from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { Stepper } from './Stepper';

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
  const { t: tr } = useTranslation(['onboarding']);
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
              accessibilityLabel="Go back"
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
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip">
              <Text variant="small" tone="muted" weight="600">
                Skip
              </Text>
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
        showsVerticalScrollIndicator={false}
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
