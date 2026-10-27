import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  StyleProp,
  Switch,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Theme, useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { currencySymbol } from '@esmart/core/lib/currencies';
import { sanitizeAmountInput } from '@esmart/core/lib/format';
import {
  joinPhone,
  maxNationalDigits,
  sanitizePhoneNumber,
  splitPhone,
  validPhoneParts,
} from '@esmart/core/lib/phone';

const WEB = Platform.OS === 'web';

/**
 * Web only: a focused field shows its own border, so the browser's outline on
 * the input inside it goes. Spread into a style object; empty on native.
 */
// RN's types only list the outline styles native draws; react-native-web also takes 'none'.
export const WEB_INPUT_RESET = (WEB ? { outlineStyle: 'none', outlineWidth: 0 } : {}) as TextStyle;

/** Web only: a soft halo outside a focused field's border. Empty on native. */
export function webFocusHalo(t: Theme, focused: boolean): ViewStyle {
  return WEB && focused ? { boxShadow: `0 0 0 3px ${t.c.primary}2E` } : {};
}

/* ------------------------------------------------------------------ */
/* Shared label / error wrapper                                        */
/* ------------------------------------------------------------------ */

export function FieldShell({
  label,
  error,
  hint,
  required,
  children,
  style,
}: {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="caption" tone="muted" weight="600">
          {label}
          {required ? (
            // On the web the asterisk must match the label's size, or a required
            // label runs taller and its field sits lower than the one beside it.
            <Text variant={WEB ? 'caption' : undefined} style={{ color: t.c.bad }}> *</Text>
          ) : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" tone="bad">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Text input                                                          */
/* ------------------------------------------------------------------ */

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  suffix?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  hint,
  required,
  icon,
  suffix,
  containerStyle,
  style,
  multiline,
  secureTextEntry,
  ...rest
}: TextFieldProps) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [focused, setFocused] = useState(false);
  // A password can be shown while typing, to check it.
  const [revealed, setRevealed] = useState(false);
  const desktop = useIsDesktop();

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: t.spacing.sm,
          // A desktop uses the web's white, outlined input.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          // Tamil's below-line vowel signs need a few more pixels. The extra
          // goes on the box rather than as `lineHeight` on the TextInput,
          // which mis-centres the caret on Android.
          minHeight: t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 42 : 48,
          // Read-only fields look it, rather than only refusing input.
          opacity: rest.editable === false ? 0.6 : 1,
          ...webFocusHalo(t, focused && !error),
        }}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={t.c.muted} style={{ marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          style={[
            {
              flex: 1,
              color: t.c.text,
              fontSize: t.fontSize.body,
              paddingVertical: multiline ? t.spacing.md : t.spacing.sm,
              minHeight: multiline ? (t.script === 'tamil' ? 100 : 92) : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              ...WEB_INPUT_RESET,
            },
            style,
          ]}
          placeholderTextColor={t.c.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          accessibilityLabel={label}
          secureTextEntry={secureTextEntry && !revealed}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={tr(revealed ? 'common:component.hidePassword' : 'common:component.showPassword')}
            hitSlop={8}
          >
            <MaterialCommunityIcons name={!revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.c.muted} />
          </Pressable>
        ) : null}
        {/* Text can't sit straight inside a View, so a plain unit such as "km" gets its own Text. */}
        {typeof suffix === 'string' || typeof suffix === 'number' ? (
          <Text variant="caption" tone="muted">
            {suffix}
          </Text>
        ) : (
          suffix
        )}
      </View>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */
/* Phone input                                                         */
/* ------------------------------------------------------------------ */

/**
 * A country code and a number in one box. The code is fixed (India's unless a
 * saved number has another); the number takes digits only, no more than the
 * code's country allows. A country picker can take the code's place later.
 */
export function PhoneField({
  label,
  dialCode,
  value,
  onChangeText,
  error,
  hint,
  required,
  placeholder,
  icon = 'phone-outline',
  onSubmitEditing,
  containerStyle,
  disabled,
}: {
  label?: string;
  dialCode: string;
  /** The number without the country code, digits only. */
  value: string;
  onChangeText: (number: string) => void;
  onSubmitEditing?: () => void;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  containerStyle?: StyleProp<ViewStyle>;
  /** Shown grayed out and not editable, e.g. a phone already verified by OTP. */
  disabled?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [focused, setFocused] = useState(false);
  const desktop = useIsDesktop();
  const input: TextStyle = {
    color: t.c.text,
    fontSize: t.fontSize.body,
    paddingVertical: t.spacing.sm,
    ...WEB_INPUT_RESET,
  };

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: disabled ? t.c.line : desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          minHeight: t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 42 : 48,
          ...webFocusHalo(t, focused && !error),
          ...(disabled ? { opacity: 0.65 } : null),
        }}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={t.c.muted} /> : null}
        <Text style={{ color: disabled ? t.c.muted : t.c.text, fontSize: t.fontSize.body }} accessibilityLabel={`${tr('common:component.countryCode')} ${dialCode}`}>
          {dialCode}
        </Text>
        <View style={{ width: 1, alignSelf: 'stretch', marginVertical: t.spacing.sm, backgroundColor: t.c.line }} />
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(sanitizePhoneNumber(v, dialCode))}
          keyboardType="number-pad"
          maxLength={maxNationalDigits(dialCode)}
          placeholder={placeholder}
          style={[input, { flex: 1 }, disabled && { color: t.c.muted }]}
          placeholderTextColor={t.c.muted}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          onSubmitEditing={onSubmitEditing}
        />
      </View>
    </FieldShell>
  );
}

/**
 * State for a PhoneField holding a saved phone (`+91 98765 43210`).
 * `field` spreads into the PhoneField; `value` is what to save back.
 */
export function usePhoneInput(stored?: string) {
  const [parts, setParts] = useState(() => splitPhone(stored));
  return {
    field: {
      dialCode: parts.code,
      value: parts.number,
      onChangeText: (number: string) => setParts((p) => ({ ...p, number })),
    },
    value: joinPhone(parts.code, parts.number),
    error: () => validPhoneParts(parts.code, parts.number),
    /** Load another saved phone, e.g. when a sheet opens on a different record. */
    reset: (next?: string) => setParts(splitPhone(next)),
  };
}

/* ------------------------------------------------------------------ */
/* Amount input                                                        */
/* ------------------------------------------------------------------ */

export function AmountField({
  label,
  value,
  onChangeValue,
  currency,
  error,
  hint,
  required,
  placeholder = '0.00',
  containerStyle,
  autoFocus,
  size = 'md',
  allowNegative,
}: {
  label?: string;
  value: string;
  onChangeValue: (v: string) => void;
  currency: string;
  /** Accept a leading "-" (signed adjustments). */
  allowNegative?: boolean;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const desktop = useIsDesktop();

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          // A desktop uses the web's white, outlined input, the same height as the fields beside it.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: size === 'lg' ? 64 : desktop ? 42 : 48,
          ...webFocusHalo(t, focused && !error),
        }}
      >
        <Text
          tone="muted"
          style={{ fontSize: size === 'lg' ? t.fontSize.h3 : t.fontSize.body, fontWeight: '600' }}
        >
          {currencySymbol(currency)}
        </Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChangeValue(sanitizeAmountInput(v, currency, { allowNegative }))}
          // Neither decimal pad has a minus key: iOS needs the punctuation
          // keyboard, Android's numeric keyboard carries the sign.
          keyboardType={allowNegative ? (Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric') : 'decimal-pad'}
          placeholder={placeholder}
          placeholderTextColor={t.c.muted}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={{
            flex: 1,
            color: t.c.text,
            fontSize: size === 'lg' ? t.fontSize.h2 : t.fontSize.body,
            fontWeight: size === 'lg' ? '700' : '500',
            fontVariant: ['tabular-nums'],
            ...WEB_INPUT_RESET,
          }}
        />
        <Text variant="caption" tone="muted">
          {currency}
        </Text>
      </View>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */
/* Picker (opens a sheet elsewhere) + switch                           */
/* ------------------------------------------------------------------ */

export function PickerField({
  label,
  value,
  placeholder = 'Select',
  onPress,
  icon,
  error,
  hint,
  required,
  containerStyle,
  clearable,
  onClear,
  disabled,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  /** Read-only: shows the value but does not open the picker. */
  disabled?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  error?: string;
  hint?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  clearable?: boolean;
  onClear?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const desktop = useIsDesktop();
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      {/* The clear button sits beside the field's button, not inside it: on
          web each is a <button>, and a button can't contain another. */}
      <View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityLabel={`${label ?? 'Select'}: ${value ?? placeholder}`}
        style={(state) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: desktop ? 42 : 48,
          opacity: disabled ? 0.6 : state.pressed ? 0.7 : 1,
          // The app's keyboard focus ring, in place of the browser's black outline.
          ...(WEB ? focusRing(t, (state as WebPressState).focused) : {}),
        })}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={t.c.muted} /> : null}
        <Text style={{ flex: 1 }} tone={value ? 'default' : 'muted'} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        {disabled ? (
          <MaterialCommunityIcons name="lock-outline" size={16} color={t.c.muted} />
        ) : clearable && value ? (
          <View style={{ width: 17 }} />
        ) : (
          <MaterialCommunityIcons name="chevron-down" size={18} color={t.c.muted} />
        )}
      </Pressable>
      {!disabled && clearable && value ? (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tr('common:component.clear')}
          style={{ position: 'absolute', right: t.spacing.md, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <MaterialCommunityIcons name="close-circle" size={17} color={t.c.muted} />
        </Pressable>
      ) : null}
      </View>
    </FieldShell>
  );
}

export function SwitchField({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingVertical: t.spacing.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="500">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: t.c.primary, false: t.c.line }}
        thumbColor="#FFFFFF"
        // On the web the "on" thumb defaults to green; keep it white like the rest.
        {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : null)}
        accessibilityLabel={label}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  size = 'md',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  // A desktop shows the quieter web tab switch: the chosen option raised in
  // white on a grey track, rather than filled with the brand colour.
  const desktop = useIsDesktop();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          padding: 3,
          gap: 3,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              height: size === 'sm' ? 30 : desktop ? 34 : 38,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? (desktop ? t.c.paper : t.c.primary) : 'transparent',
              ...(desktop && active ? t.shadow.card : null),
            }}
          >
            <Text
              variant={size === 'sm' ? 'caption' : 'small'}
              weight="600"
              style={{ color: active ? (desktop ? t.c.text : t.c.onPrimary) : t.c.muted }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Quantity stepper                                                    */
/* ------------------------------------------------------------------ */

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  decimals = 0,
  compact = false,
  positive = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  decimals?: number;
  /** Smaller buttons and a fixed-width number, to sit inside a list row. */
  compact?: boolean;
  /** Never 0: the minus button stops before it, and 0 or nothing left in the box goes back to 1. */
  positive?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const btn = (icon: 'minus' | 'plus', delta: number, label: string) => (
    <Pressable
      onPress={() => {
        const next = Math.max(min, Number((value + delta).toFixed(decimals)));
        if (!positive || next > 0) onChange(next);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: compact ? 30 : 34,
        height: compact ? 30 : 34,
        borderRadius: t.radius.sm,
        backgroundColor: t.c.card2,
        borderWidth: 1,
        borderColor: t.c.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon} size={17} color={t.c.text} />
    </Pressable>
  );

  // Hold the raw text so an in-progress "1." survives re-render; resync when
  // the value changes from outside (the +/- buttons).
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text) !== value) setText(String(value));
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      {btn('minus', -step, 'Decrease quantity')}
      <TextInput
        value={text}
        onChangeText={(v) => {
          let clean = v.replace(/[^0-9.]/g, '');
          const dot = clean.indexOf('.');
          if (dot !== -1) {
            clean = decimals > 0
              ? clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, decimals)
              : clean.slice(0, dot);
          }
          setText(clean);
          const n = Number(clean);
          onChange(Number.isFinite(n) ? n : min);
        }}
        onBlur={() => {
          if (positive && !(value > 0)) {
            onChange(1);
            setText('1');
          } else setText(String(value));
        }}
        keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={tr('common:component.quantity')}
        style={{
          ...(compact ? { width: 56 } : { minWidth: 52 }),
          textAlign: 'center',
          color: t.c.text,
          fontSize: t.fontSize.body,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          paddingVertical: 4,
        }}
      />
      {btn('plus', step, 'Increase quantity')}
    </View>
  );
}
