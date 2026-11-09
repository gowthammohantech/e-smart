import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useIsDesktop } from '../../theme/breakpoints';
import { FieldShell, useFieldA11y, webFocusHalo } from '../Field';
import { toISODate } from '@esmart/core/lib/date';

// The browser draws its own calendar button inside a date input, beside ours:
// two calendar icons, and in dark mode Chrome's is near invisible. Ours is the
// one shown (and opens the browser's calendar); the browser's is kept in place
// but clear, so a click at the field's end still opens the calendar while the
// date's parts stay clickable for typing.
const DATE_CLASS = 'esmart-date-input';
if (typeof document !== 'undefined' && !document.getElementById(DATE_CLASS)) {
  const style = document.createElement('style');
  style.id = DATE_CLASS;
  style.textContent = `
    .${DATE_CLASS}::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
  `;
  document.head.appendChild(style);
}

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
  containerStyle,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  hint?: string;
  error?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Around the label and the box, as on the other fields (e.g. a desktop width). */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const desktop = useIsDesktop();
  const [focused, setFocused] = useState(false);
  // The calendar greys out days past min and max, but a typed date isn't held
  // to them. One outside them shows while it is being typed (a year goes in a
  // digit at a time) and is never passed on; leaving the field puts the last
  // allowed date back.
  const [stray, setStray] = useState<string | null>(null);
  const min = minimumDate ? toISODate(minimumDate) : undefined;
  const max = maximumDate ? toISODate(maximumDate) : undefined;
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const a11y = useFieldA11y({ error, hint, required });
  const input = useRef<HTMLInputElement>(null);
  const openCalendar = () => {
    const el = input.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // Some browsers refuse outside a direct click; focus is enough to type.
    }
  };

  return (
    <FieldShell style={containerStyle} label={label} required={required} hint={hint} error={error} messageId={a11y.messageId}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          // Matches TextField: outlined white on a desktop, filled on a phone.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error || stray ? t.c.bad : focused ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          height: desktop ? 40 : 48,
          ...webFocusHalo(t, focused && !error && !stray),
        }}
      >
        <Pressable onPress={openCalendar} accessibilityElementsHidden importantForAccessibility="no" {...({ tabIndex: -1 } as object)}>
          <Icon name="calendar-outline" size={18} color={t.c.muted} />
        </Pressable>
        <input
          ref={input}
          className={DATE_CLASS}
          type="date"
          aria-label={label ?? tr('common:component.date')}
          required={required}
          aria-invalid={error || stray ? true : undefined}
          aria-describedby={a11y.inputProps['aria-describedby']}
          value={stray ?? (value ? value.slice(0, 10) : '')}
          min={min}
          max={max}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            if (allowed(next)) {
              setStray(null);
              onChange(next);
            } else setStray(next);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setStray(null);
          }}
          style={{
            flex: 1,
            border: 'none',
            // The box around it shows focus; the browser's own outline would double it.
            outline: 'none',
            background: 'transparent',
            color: t.c.text,
            fontSize: t.fontSize.body,
            // RN Web sets the font on Text only, so a raw input needs it spelled out.
            fontFamily: t.fontFamily,
            colorScheme: t.scheme,
          }}
        />
      </View>
    </FieldShell>
  );
}
