import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Switch,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Icon, type IconName } from './Icon';
import { type Theme, useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { notePickerOpener } from './pickers/pickerOpener';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { currencyMeta, currencySymbol } from '@esmart/core/lib/currencies';
import { formatNumber, sanitizeAmountInput } from '@esmart/core/lib/format';
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

/**
 * What a field's input needs so assistive tech knows it is required, whether
 * it is wrong, and where its error or hint is. Pass `messageId` to the
 * field's `FieldShell` and spread `inputProps` on the input (or the button
 * that stands in for one). The aria props only take effect on the web; a
 * native screen reader hears the error through `FieldShell`'s announcement.
 */
export function useFieldA11y({ error, hint, required }: { error?: string; hint?: string; required?: boolean }) {
  const messageId = `field-msg-${useId().replace(/:/g, '')}`;
  return {
    messageId,
    inputProps: {
      'aria-required': required || undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error || hint ? messageId : undefined,
    },
  };
}

/**
 * After a failed save, moves keyboard focus to the first field marked
 * invalid, so a keyboard or screen reader user lands on what to fix. Call it
 * right after setting the errors; it waits a frame for them to render. The
 * web only: on native each new error is announced by its `FieldShell`.
 */
export function focusFirstInvalid() {
  if (!WEB || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });
}

export function FieldShell({
  label,
  error,
  hint,
  required,
  children,
  style,
  messageId,
}: {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The id the input points at with `aria-describedby`, from `useFieldA11y`. */
  messageId?: string;
}) {
  const t = useTheme();
  // A native screen reader has no live region on iOS, so a new error is spoken outright.
  useEffect(() => {
    if (!WEB && error) AccessibilityInfo.announceForAccessibility(label ? `${label}: ${error}` : error);
  }, [error, label]);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant={WEB ? 'small' : 'caption'} tone={WEB ? 'default' : 'muted'} weight={WEB ? '500' : '600'}>
          {label}
          {required ? (
            // On the web the asterisk must match the label's size, or a required
            // label runs taller and its field sits lower than the one beside it.
            // Hidden from screen readers: the input itself says it is required.
            <Text variant={WEB ? 'small' : undefined} style={{ color: t.c.bad }} aria-hidden importantForAccessibility="no">
              {' *'}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        // An alert, so the web reads a new error out as soon as it appears.
        <Text variant="caption" tone="bad" id={messageId} role={WEB ? 'alert' : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" id={messageId}>
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
  /** React 19 passes a ref as a prop; it reaches the input through ...rest. */
  ref?: React.Ref<TextInput>;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: IconName;
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
  // Read-only: no focus ring or text cursor on a click, and the lock a locked picker shows.
  const readOnly = rest.editable === false;
  const a11y = useFieldA11y({ error, hint, required });

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle} messageId={a11y.messageId}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: t.spacing.sm,
          // A desktop uses the web's white, outlined input.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused && !readOnly ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          // Tamil's below-line vowel signs need a few more pixels. The extra
          // goes on the box rather than as `lineHeight` on the TextInput,
          // which mis-centres the caret on Android.
          minHeight: t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48,
          // Read-only fields look it, rather than only refusing input.
          opacity: readOnly ? 0.6 : 1,
          ...webFocusHalo(t, focused && !error && !readOnly),
        }}
      >
        {icon ? <Icon name={icon} size={18} color={t.c.muted} style={{ marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          style={[
            {
              flex: 1,
              // A web input won't shrink below its default width otherwise, so at a high zoom it pushed the
              // show/hide eye (or the suffix) out of the box.
              minWidth: 0,
              color: t.c.text,
              fontSize: t.fontSize.body,
              paddingVertical: multiline ? t.spacing.md : t.spacing.sm,
              minHeight: multiline ? (t.script === 'tamil' ? 100 : 92) : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              ...WEB_INPUT_RESET,
              ...(readOnly ? ({ cursor: 'default' } as object) : null),
            },
            style,
          ]}
          placeholderTextColor={t.c.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
          accessibilityLabel={label}
          secureTextEntry={secureTextEntry && !revealed}
          {...a11y.inputProps}
          {...rest}
          // Emails are lowercase only, so capitals turn lowercase as they're typed.
          onChangeText={rest.keyboardType === 'email-address' && rest.onChangeText ? (v) => rest.onChangeText?.(v.toLowerCase()) : rest.onChangeText}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={tr(revealed ? 'common:component.hidePassword' : 'common:component.showPassword')}
            hitSlop={8}
            style={{ flexShrink: 0 }}
          >
            <Icon name={!revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.c.muted} />
          </Pressable>
        ) : null}
        {/* Text can't sit straight inside a View, so a plain unit such as "km" gets its own Text. */}
        {typeof suffix === 'string' || typeof suffix === 'number' ? (
          <Text variant="caption" tone="muted">
            {suffix}
          </Text>
        ) : (
          (suffix ?? (readOnly ? <Icon name="lock-outline" size={16} color={t.c.muted} style={{ marginTop: multiline ? 14 : 0 }} /> : null))
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
  icon?: IconName;
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
  const a11y = useFieldA11y({ error, hint, required });

  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle} messageId={a11y.messageId}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          // Disabled looks like any read-only field: faded, with a lock, and no focus ring on a click.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused && !disabled ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          minHeight: t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48,
          ...webFocusHalo(t, focused && !error && !disabled),
          ...(disabled ? { opacity: 0.6 } : null),
        }}
      >
        {icon ? <Icon name={icon} size={18} color={t.c.muted} /> : null}
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
          style={[input, { flex: 1 }, disabled && { color: t.c.muted }, disabled && ({ cursor: 'default' } as object)]}
          placeholderTextColor={t.c.muted}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          {...a11y.inputProps}
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          onSubmitEditing={onSubmitEditing}
        />
        {disabled ? <Icon name="lock-outline" size={16} color={t.c.muted} /> : null}
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

/** Adds the currency's digit grouping to a typed amount, keeping its sign and decimals as typed. */
export function groupAmountText(value: string, currency: string): string {
  const m = /^(-?)(\d+)(\.\d*)?$/.exec(value);
  if (!m) return value;
  const [, sign, int, dec = ''] = m;
  return `${sign}${formatNumber(Number(int), 0, currencyMeta(currency).grouping)}${dec}`;
}

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
  align = 'left',
}: {
  label?: string;
  value: string;
  onChangeValue: (v: string) => void;
  currency: string;
  /** `right` lines the figure up under a right-aligned column heading, as in a ledger grid. */
  align?: 'left' | 'right';
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

  const a11y = useFieldA11y({ error, hint, required });
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle} messageId={a11y.messageId}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          // A desktop uses the web's white, outlined input, the same height as the fields beside it.
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : focused ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          // As tall as a TextField beside it, Tamil's extra room included.
          height: size === 'lg' ? 64 : t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48,
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
          // Grouped (₹9,374.51) while at rest; the raw figure while typing.
          value={focused ? value : groupAmountText(value, currency)}
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
          {...a11y.inputProps}
          style={{
            flex: 1,
            color: t.c.text,
            fontSize: size === 'lg' ? t.fontSize.h2 : t.fontSize.body,
            fontWeight: size === 'lg' ? '700' : '500',
            fontVariant: ['tabular-nums'],
            textAlign: align,
            minWidth: 0,
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
  placeholder: placeholderProp,
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
  icon?: IconName;
  error?: string;
  hint?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  clearable?: boolean;
  onClear?: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const placeholder = placeholderProp ?? tr('common:component.select');
  const desktop = useIsDesktop();
  const a11y = useFieldA11y({ error, hint, required });
  // aria-required isn't allowed on a button, so a required picker says so in its label.
  const pickerLabel = `${label ?? tr('common:component.select')}${required ? `, ${tr('common:component.required')}` : ''}: ${value ?? placeholder}`;
  // A desktop notes where the field is as it opens its list, so a short list can drop down under it.
  const [node, setNode] = useState<View | null>(null);
  const press = () => {
    const el = desktop && WEB ? (node as unknown as HTMLElement | null) : null;
    const box = el?.getBoundingClientRect?.();
    if (box) notePickerOpener({ x: box.left, y: box.top, width: box.width, height: box.height, element: el });
    onPress();
  };
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} style={containerStyle} messageId={a11y.messageId}>
      {/* The clear button sits beside the field's button, not inside it: on
          web each is a <button>, and a button can't contain another. */}
      <View>
      <Pressable
        ref={setNode}
        onPress={press}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        accessibilityLabel={pickerLabel}
        aria-invalid={a11y.inputProps['aria-invalid']}
        aria-describedby={a11y.inputProps['aria-describedby']}
        style={(state) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error ? t.c.bad : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          height: t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48,
          opacity: disabled ? 0.6 : state.pressed ? 0.7 : 1,
          // The app's keyboard focus ring, in place of the browser's black outline.
          ...(WEB ? focusRing(t, (state as WebPressState).focused) : {}),
        })}
      >
        {icon ? <Icon name={icon} size={18} color={t.c.muted} /> : null}
        <Text style={{ flex: 1 }} tone={value ? 'default' : 'muted'} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        {disabled ? (
          <Icon name="lock-outline" size={16} color={t.c.muted} />
        ) : clearable && value ? (
          <View style={{ width: 17 }} />
        ) : (
          <Icon name="chevron-down" size={18} color={t.c.muted} />
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
          <Icon name="close-circle" size={17} color={t.c.muted} />
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
  style,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          paddingVertical: t.spacing.sm,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
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
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md';
  /** Locked: the chosen option stays as it is so it still reads; only the others fade. */
  disabled?: boolean;
}) {
  const t = useTheme();
  // A desktop shows the quieter web tab switch: the chosen option raised in
  // white on a grey track, rather than filled with the brand colour.
  const desktop = useIsDesktop();
  // A phone splits the width evenly. A desktop sizes each option to its label, as web tabs are,
  // unless the screen gives the control a width (or a flex) of its own to fill.
  const own = StyleSheet.flatten(style) ?? {};
  const fit = desktop && own.width === undefined && own.flex === undefined && own.flexGrow === undefined && own.alignSelf === undefined;
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
        fit ? { alignSelf: 'flex-start', flexWrap: 'wrap', maxWidth: '100%' } : null,
        style,
      ]}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            accessibilityLabel={o.label}
            style={{
              ...(fit ? { paddingHorizontal: size === 'sm' ? t.spacing.md : t.spacing.lg } : { flex: 1 }),
              height: size === 'sm' ? 30 : desktop ? 34 : 38,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              // The deeper brand blue: small white text on the bright one is only 4:1.
              backgroundColor: active ? (desktop ? t.c.paper : t.c.primaryPressed) : 'transparent',
              ...(desktop && active ? t.shadow.card : null),
              opacity: disabled && !active ? 0.4 : 1,
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
      <Icon name={icon} size={17} color={t.c.text} />
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
      {btn('minus', -step, tr('common:component.decreaseQuantity'))}
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
      {btn('plus', step, tr('common:component.increaseQuantity'))}
    </View>
  );
}
