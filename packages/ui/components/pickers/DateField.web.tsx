import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { useIsDesktop } from '../../theme/breakpoints';
import { FieldShell, useFieldA11y, webFocusHalo } from '../Field';
import { toISODate } from '@esmart/core/lib/date';

/** `2026-11-25` → `25/11/2026`, as the field shows it. */
const shown = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Digits typed, with the slashes put in: `2511` → `25/11`. */
const masked = (digits: string) => [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');

/** `25112026` → `2026-11-25` when it is a real day (no 31/02), else undefined. */
function isoOf(digits: string): string | undefined {
  if (digits.length !== 8) return undefined;
  const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toISODate(d) === iso ? iso : undefined;
}

/**
 * A date typed as DD/MM/YYYY, whatever the computer's region (the browser's own date box
 * follows it, and shows 11/25/2026 on a US system). The calendar button opens the browser's
 * calendar on a hidden date input. Same props as DateField.tsx, so screens don't know which
 * one they got.
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
  const day = value ? value.slice(0, 10) : '';
  // What is in the box while typing; the date itself only changes once a whole, allowed day is in.
  const [text, setText] = useState(shown(day));
  // A whole date that isn't a real day, or is outside min and max: shown in red, never passed on;
  // leaving the field puts the last good date back.
  const [stray, setStray] = useState(false);
  const min = minimumDate ? toISODate(minimumDate) : undefined;
  const max = maximumDate ? toISODate(maximumDate) : undefined;
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  // A date set from outside (a default, the calendar, a reset) shows when not mid-typing.
  const [seen, setSeen] = useState({ day, focused });
  if (seen.day !== day || seen.focused !== focused) {
    setSeen({ day, focused });
    if (!focused) setText(shown(day));
  }

  const a11y = useFieldA11y({ error, hint, required });
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const openCalendar = () => {
    const el = picker.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    try {
      el?.showPicker?.();
    } catch {
      // Some browsers refuse outside a direct click: the date can still be typed.
      box.current?.focus();
    }
  };

  const typed = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setText(masked(digits));
    if (digits.length < 8) return setStray(false);
    const iso = isoOf(digits);
    if (iso && allowed(iso)) {
      setStray(false);
      onChange(iso);
    } else setStray(true);
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
          position: 'relative',
          ...webFocusHalo(t, focused && !error && !stray),
        }}
      >
        <Pressable onPress={openCalendar} accessibilityRole="button" accessibilityLabel={tr('common:component.selectDate')} {...({ tabIndex: -1 } as object)}>
          <Icon name="calendar-outline" size={18} color={t.c.muted} />
        </Pressable>
        {/* The browser's calendar, opened from the button; the box beside it is what shows. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={day}
          min={min}
          max={max}
          onChange={(e) => {
            const next = e.target.value;
            if (!next || !allowed(next)) return;
            setStray(false);
            setText(shown(next));
            onChange(next);
          }}
          style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0, border: 'none', padding: 0, pointerEvents: 'none' }}
        />
        <input
          ref={box}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          aria-label={label ?? tr('common:component.date')}
          required={required}
          aria-invalid={error || stray ? true : undefined}
          aria-describedby={a11y.inputProps['aria-describedby']}
          value={text}
          onChange={(e) => typed(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setStray(false);
            setText(shown(day));
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            // The box around it shows focus; the browser's own outline would double it.
            outline: 'none',
            background: 'transparent',
            color: t.c.text,
            fontSize: t.fontSize.body,
            // RN Web sets the font on Text only, so a raw input needs it spelled out.
            fontFamily: t.fontFamily,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      </View>
    </FieldShell>
  );
}
