import React from 'react';
import { Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { focusRing, type WebPressState } from '../theme/interaction';
import { Text } from './Text';
import { Menu, MenuItem, useMenuAnchor } from './Menu';

/**
 * A desktop filter: a pill showing the current choice that drops down the
 * options. Highlighted while it filters anything (not on `neutralValue`).
 */
export function FilterMenu<V extends string>({
  icon,
  label,
  value,
  neutralValue,
  options,
  onChange,
  width = 240,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Screen-reader name of the filter. */
  label: string;
  value: V;
  /** The "no filter" choice; the pill stays plain while it is selected. */
  neutralValue?: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  width?: number;
}) {
  const t = useTheme();
  const { setAnchor, rect, open, close } = useMenuAnchor();
  const active = neutralValue === undefined ? true : value !== neutralValue;
  const current = options.find((o) => o.value === value)?.label ?? label;

  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        style={(state) => {
          const { hovered, focused } = state as WebPressState;
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingHorizontal: t.spacing.md,
              borderRadius: t.radius.pill,
              borderWidth: 1,
              borderColor: active ? t.c.primary : hovered ? t.c.muted : t.c.line,
              backgroundColor: active ? t.c.chip : t.c.paper,
            },
            focusRing(t, focused),
          ];
        }}
      >
        {icon ? <MaterialCommunityIcons name={icon} size={15} color={active ? t.c.primary : t.c.muted} /> : null}
        <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'} numberOfLines={1}>
          {current}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={15} color={t.c.muted} />
      </Pressable>
      <Menu anchor={rect} onClose={close} width={width}>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={() => {
              onChange(o.value);
              close();
            }}
          />
        ))}
      </Menu>
    </>
  );
}
