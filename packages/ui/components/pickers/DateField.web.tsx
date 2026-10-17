import React, { useState } from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { useIsDesktop } from '../../theme/breakpoints';
import { FieldShell, webFocusHalo } from '../Field';
import { toISODate } from '@esmart/core/lib/date';

/**
 * The browser's own date input. The native picker has no web build, and a
 * desktop user expects to type a date or use the browser's calendar anyway.
 * Same props as DateField.tsx, so screens don't know which one they got.
 */
export function DateField({
  label,
  value,
  onChange,
  required,
  hint,
  error,
  minimumDate,
  maximumDate,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const [focused, setFocused] = useState(false);

  return (
    <FieldShell label={label} required={required} hint={hint} error={error}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          // Matches TextField: outlined white on a desktop, filled on a phone.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: desktop ? 42 : 48,
          ...webFocusHalo(t, focused && !error),
        }}
      >
        <MaterialCommunityIcons name="calendar-outline" size={18} color={t.c.muted} />
        <input
          type="date"
          aria-label={label ?? 'Date'}
          required={required}
          value={value ? value.slice(0, 10) : ''}
          min={minimumDate ? toISODate(minimumDate) : undefined}
          max={maximumDate ? toISODate(maximumDate) : undefined}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            // The box around it shows focus; the browser's own outline would double it.
            outline: 'none',
            background: 'transparent',
            color: t.c.text,
            fontSize: t.fontSize.body,
            // RN Web sets the font on Text only, so a raw input needs it spelled out.
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            colorScheme: t.scheme,
          }}
        />
      </View>
    </FieldShell>
  );
}
