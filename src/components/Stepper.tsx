import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Stepper({
  steps,
  current,
}: {
  steps: readonly { key: string; label: string }[];
  current: number;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((s, i) => (
          <View
            key={s.key}
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
        Step {current + 1} of {steps.length} · {steps[current]?.label}
      </Text>
    </View>
  );
}
