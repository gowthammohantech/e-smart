import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  style,
  autoFocus,
  onSubmitEditing,
  right,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
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
          borderColor: t.c.line,
          paddingHorizontal: t.spacing.md,
          height: 44,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={19} color={t.c.muted} />
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
        style={{ flex: 1, color: t.c.text, fontSize: t.fontSize.body }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('common:component.clearSearch')}>
          <MaterialCommunityIcons name="close-circle" size={17} color={t.c.muted} />
        </Pressable>
      ) : null}
      {right}
    </View>
  );
}
