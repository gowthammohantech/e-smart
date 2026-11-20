import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { useTheme } from '../../theme/ThemeProvider';
import { WEB_INPUT_RESET, webFocusHalo } from '../Field';
import type { PickerOpener } from './pickerOpener';
import type { SelectOption } from './SelectSheet';

const WEB = Platform.OS === 'web';

/**
 * A desktop picker's short list, dropped down under the field it was opened from. The field itself
 * becomes the search: a text input is drawn exactly over it, so you type where you clicked and the
 * list under it narrows as you type. Arrow keys move through the matches, Enter or a click takes
 * one, Escape (or a click outside) leaves the field as it was.
 */
export function SearchDropdown({
  anchor,
  options,
  value,
  onSelect,
  onClose,
  loading,
  emptyMessage,
  subtitle,
  label,
}: {
  anchor: PickerOpener;
  options: SelectOption[];
  value?: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  loading?: boolean;
  emptyMessage?: string;
  subtitle?: string;
  /** What a screen reader calls the search field. */
  label: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const window = useWindowDimensions();
  const current = options.find((o) => o.value === value);
  const [text, setText] = useState(current?.label ?? '');
  // Until something is typed the whole list shows, not only what matches the picked name.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const input = useRef<TextInput>(null);

  useEffect(() => {
    // A frame after mount, once the input is in the DOM.
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const matches = useMemo(() => {
    const q = typed ? text.trim().toLowerCase() : '';
    if (!q) return options;
    const hit = options.filter((o) => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q));
    // Names that start with what's typed come first.
    return hit.sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)));
  }, [options, text, typed]);

  const choose = (o: SelectOption | undefined) => {
    if (!o) return onClose();
    onSelect(o.value);
    onClose();
  };

  const onKeyPress = (e: { nativeEvent: { key: string }; preventDefault?: () => void }) => {
    const key = e.nativeEvent.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault?.();
      setActive((i) => (matches.length ? (i + (key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0));
    } else if (key === 'Enter') {
      e.preventDefault?.();
      choose(matches[active]);
    } else if (key === 'Escape') {
      e.preventDefault?.();
      onClose();
    } else if (key === 'Tab') {
      // Tab takes what's highlighted only when something was typed; tabbing past leaves the field as it was.
      if (typed && matches[active]) onSelect(matches[active].value);
      onClose();
    }
  };

  // Under the field; when there is more room above it (a field near the bottom of the window), above.
  const maxHeight = 360;
  const below = window.height - (anchor.y + anchor.height + 4) - 16;
  const above = anchor.y - 4 - 16;
  const up = below < Math.min(maxHeight, 240) && above > below;
  const room = Math.max(up ? above : below, 120);
  const width = Math.max(anchor.width, 220);
  const left = Math.max(8, Math.min(anchor.x, window.width - width - 8));
  const vertical = up ? { bottom: window.height - anchor.y + 4 } : { top: anchor.y + anchor.height + 4 };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common:component.closeMenu')} />
      {/* The field, drawn again where it is, as the search box. */}
      <View
        style={{
          position: 'absolute',
          left: anchor.x,
          top: anchor.y,
          width: anchor.width,
          height: anchor.height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: t.c.paper,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.c.primary,
          paddingHorizontal: t.spacing.md,
          ...webFocusHalo(t, true),
        }}
      >
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setTyped(true);
            setActive(0);
          }}
          onKeyPress={onKeyPress as never}
          selectTextOnFocus
          autoFocus
          placeholder={tr('common:component.search')}
          placeholderTextColor={t.c.muted}
          accessibilityLabel={label}
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          style={{ flex: 1, minWidth: 0, color: t.c.text, fontSize: t.fontSize.body, paddingVertical: t.spacing.sm, ...WEB_INPUT_RESET }}
        />
        <Icon name="chevron-down" size={18} color={t.c.muted} />
      </View>
      <View
        // RN's roles leave out listbox; react-native-web passes it through.
        {...({ role: 'listbox' } as object)}
        style={[
          {
            position: 'absolute',
            ...vertical,
            left,
            width,
            maxHeight: Math.min(maxHeight, room),
            backgroundColor: t.c.paper,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.c.line,
            overflow: 'hidden',
          },
          t.shadow.sheet,
        ]}
      >
        <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingVertical: t.spacing.xs }}>
          {subtitle ? (
            <Text variant="caption" tone="muted" style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.xs }}>
              {subtitle}
            </Text>
          ) : null}
          {options.length === 0 && loading ? (
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.md }} />
          ) : matches.length === 0 ? (
            <Text variant="small" tone="muted" style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
              {options.length === 0 ? (emptyMessage ?? tr('common:component.noMatches')) : tr('common:component.noMatches')}
            </Text>
          ) : (
            matches.map((o, i) => (
              <Pressable
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onPress={() => choose(o)}
                {...(WEB ? ({ onMouseEnter: () => setActive(i) } as object) : null)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: o.description ? 6 : 9,
                  marginHorizontal: t.spacing.xs,
                  borderRadius: t.radius.sm,
                  backgroundColor: i === active ? t.c.card2 : 'transparent',
                }}
              >
                {o.leading ?? (o.icon ? <Icon name={o.icon} size={18} color={t.c.muted} /> : null)}
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="small" weight={o.value === value ? '700' : '500'} numberOfLines={1}>
                    {o.label}
                  </Text>
                  {o.description ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {o.description}
                    </Text>
                  ) : null}
                </View>
                {o.trailing ? (
                  <Text variant="caption" tone="muted">
                    {o.trailing}
                  </Text>
                ) : null}
                {o.value === value ? <Icon name="check" size={16} color={t.c.primary} /> : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
