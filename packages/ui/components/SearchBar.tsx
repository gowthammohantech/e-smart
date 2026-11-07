import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { WEB_INPUT_RESET, webFocusHalo } from './Field';
import { useIsDesktop } from '../theme/breakpoints';

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  style,
  autoFocus,
  onSubmitEditing,
  right,
  compact,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  right?: React.ReactNode;
  /** Opt-in: a desktop toolbar's height (38) instead of 44, to sit level with its buttons. */
  compact?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const [focused, setFocused] = useState(false);
  const desktop = useIsDesktop();
  const small = !!compact && desktop;
  // Only a browser shows focus on the bar; a phone keeps its look while typing.
  const webFocused = Platform.OS === 'web' && focused;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: webFocused ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          height: small ? 38 : 44,
          ...webFocusHalo(t, webFocused),
        },
        style,
      ]}
    >
      <Icon name="magnify" size={small ? 17 : 19} color={t.c.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? tr('common:component.search')}
        placeholderTextColor={t.c.muted}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flex: 1, color: t.c.text, fontSize: t.fontSize.body, ...WEB_INPUT_RESET }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:component.clearSearch')}>
          <Icon name="close-circle" size={17} color={t.c.muted} />
        </Pressable>
      ) : null}
      {right}
    </View>
  );
}
