import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  StyleProp,
  Switch,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { currencySymbol } from '@/lib/currencies';
import { sanitizeAmountInput } from '@/lib/format';

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
          {required ? <Text style={{ color: t.c.bad }}> *</Text> : null}
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
  ...rest
}: TextFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          // Tamil's below-line vowel signs need a few more pixels. The extra
          // goes on the box rather than as `lineHeight` on the TextInput,
          // which mis-centres the caret on Android.
          minHeight: t.script === 'tamil' ? 52 : 48,
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
            },
            style,
          ]}
          placeholderTextColor={t.c.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          accessibilityLabel={label}
          {...rest}
        />
        {suffix}
      </View>
    </FieldShell>
  );
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

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: size === 'lg' ? 64 : 48,
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
          // The iOS decimal pad has no minus key.
          keyboardType={allowNegative && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
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
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
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
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Select'}: ${value ?? placeholder}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : t.c.line,
          paddingHorizontal: t.spacing.md,
          height: 48,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={t.c.muted} /> : null}
        <Text style={{ flex: 1 }} tone={value ? 'default' : 'muted'} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        {clearable && value ? (
          <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:component.clear')}>
            <MaterialCommunityIcons name="close-circle" size={17} color={t.c.muted} />
          </Pressable>
        ) : (
          <MaterialCommunityIcons name="chevron-down" size={18} color={t.c.muted} />
        )}
      </Pressable>
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
              height: size === 'sm' ? 30 : 38,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.c.primary : 'transparent',
            }}
          >
            <Text
              variant={size === 'sm' ? 'caption' : 'small'}
              weight="600"
              style={{ color: active ? t.c.onPrimary : t.c.muted }}
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
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  decimals?: number;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const btn = (icon: 'minus' | 'plus', delta: number, label: string) => (
    <Pressable
      onPress={() => onChange(Math.max(min, Number((value + delta).toFixed(decimals))))}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
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
        onBlur={() => setText(String(value))}
        keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
        accessibilityLabel={tr('common:component.quantity')}
        style={{
          minWidth: 52,
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
