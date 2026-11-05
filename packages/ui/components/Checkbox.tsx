import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';

/**
 * A checkbox: ticked, clear, or mixed (some of a group ticked, as a
 * select-all over a partly selected list). It has no visible label of its
 * own, so `label` is what a screen reader says.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  size = 18,
}: {
  checked: boolean | 'mixed';
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: number;
}) {
  const t = useTheme();
  const on = checked !== false;
  return (
    <Pressable
      onPress={() => onChange(checked !== true)}
      disabled={disabled}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      hitSlop={8}
      style={(state) => {
        const { hovered, focused } = state as WebPressState;
        return [
          {
            width: size,
            height: size,
            borderRadius: 4,
            borderWidth: 1.5,
            // The resting edge is the input border, at 3:1 like any other control.
            borderColor: on ? t.c.primary : hovered ? t.c.text : t.c.inputBorder,
            backgroundColor: on ? t.c.primary : t.c.paper,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.45 : 1,
          },
          focusRing(t, focused),
        ];
      }}
    >
      {checked === 'mixed' ? (
        <View style={{ width: size * 0.5, height: 2, borderRadius: 1, backgroundColor: t.c.onPrimary }} />
      ) : checked ? (
        <Icon name="check" size={size - 4} color={t.c.onPrimary} />
      ) : null}
    </Pressable>
  );
}
