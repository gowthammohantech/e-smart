import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Stepper({
  steps,
  current,
}: {
  /** Display labels, already translated by the caller. */
  steps: readonly string[];
  current: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['onboarding']);
  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= current ? t.c.primary : t.c.line,
            }}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {tr('onboarding:stepProgress', {
          current: current + 1,
          total: steps.length,
          step: steps[current] ?? '',
        })}
      </Text>
    </View>
  );
}
