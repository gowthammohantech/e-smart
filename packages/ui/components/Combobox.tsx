import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { useIsDesktop } from '../theme/breakpoints';
import { WEB_INPUT_RESET, webFocusHalo } from './Field';
import type { SelectOption } from './pickers/SelectSheet';

const WEB = Platform.OS === 'web';
/** Enough to find by typing; more only slows the list down. */
const SHOWN = 60;

/**
 * A field you type into to pick from a list, the list dropping down under it as you type: an
 * account in a voucher row, the way Tally takes one. The arrow keys move through the matches,
 * Enter or Tab takes the highlighted one, Escape puts the field back. For a desktop; on a phone a
 * SelectSheet does the same with room to scroll.
 *
 * The list draws over what's below it, so a row holding one needs a `zIndex` above the rows after it.
 */
export function Combobox({
  value,
  options,
  onSelect,
  placeholder,
  label,
  containerStyle,
  autoFocus,
}: {
  value?: string | null;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  /** What a screen reader calls the field. */
  label: string;
  containerStyle?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const desktop = useIsDesktop();
  const listId = `combo-${useId().replace(/:/g, '')}`;
  const current = options.find((o) => o.value === value);
  const [text, setText] = useState(current?.label ?? '');
  // Until something is typed the whole list shows, not only what matches the picked name.
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // The picked value changed from outside (a template, a balancing fill), or the field was left: show its name.
  const pickedLabel = current?.label ?? '';
  const [shown, setShown] = useState({ label: pickedLabel, focused });
  if (shown.label !== pickedLabel || shown.focused !== focused) {
    setShown({ label: pickedLabel, focused });
    if (!focused) setText(pickedLabel);
  }
  const [active, setActive] = useState(0);
  const input = useRef<TextInput>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read when the blur's timer fires, which may be after a pick changed it.
  const labelRef = useRef(current?.label ?? '');
  useEffect(() => {
    labelRef.current = current?.label ?? '';
  }, [current?.label]);

  useEffect(() => () => void (blurTimer.current && clearTimeout(blurTimer.current)), []);

  const matches = useMemo(() => {
    const q = typed ? text.trim().toLowerCase() : '';
    const hit = q ? options.filter((o) => !o.disabled && (o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q))) : options.filter((o) => !o.disabled);
    // Names that start with what's typed come first.
    if (q) hit.sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)));
    return hit.slice(0, SHOWN);
  }, [options, text, typed]);

  const reset = () => {
    setOpen(false);
    setTyped(false);
    setText(labelRef.current);
  };
  const choose = (o: SelectOption | undefined) => {
    if (!o) return reset();
    onSelect(o.value);
    labelRef.current = o.label;
    setText(o.label);
    setTyped(false);
    setOpen(false);
  };

  const onKeyPress = (e: { nativeEvent: { key: string }; preventDefault?: () => void }) => {
    const key = e.nativeEvent.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault?.();
      if (!open) return setOpen(true);
      setActive((i) => (matches.length ? (i + (key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0));
    } else if (key === 'Enter') {
      e.preventDefault?.();
      if (open) choose(matches[active]);
      else setOpen(true);
    } else if (key === 'Tab') {
      // Tab takes what's highlighted only when something was typed; tabbing past leaves the field as it was.
      if (open && typed && matches[active]) choose(matches[active]);
      else reset();
    } else if (key === 'Escape') {
      e.preventDefault?.();
      reset();
    }
  };

  const height = t.script === 'tamil' ? (desktop ? 46 : 52) : desktop ? 40 : 48;

  return (
    <View style={[{ position: 'relative', zIndex: open ? 10 : 0 }, containerStyle]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          backgroundColor: desktop ? t.c.paper : t.c.card2,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: focused ? t.c.primary : t.c.inputBorder,
          paddingHorizontal: t.spacing.md,
          height,
          ...webFocusHalo(t, focused),
        }}
      >
        <TextInput
          ref={input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setTyped(true);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setFocused(true);
            setActive(Math.max(0, matches.findIndex((o) => o.value === value)));
            setOpen(true);
          }}
          // A click on the list blurs the field first: wait a moment so the click lands.
          onBlur={() => {
            setFocused(false);
            blurTimer.current = setTimeout(reset, 150);
          }}
          onKeyPress={onKeyPress as never}
          selectTextOnFocus
          autoFocus={autoFocus}
          placeholder={placeholder}
          placeholderTextColor={t.c.muted}
          accessibilityLabel={label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          style={{ flex: 1, minWidth: 0, color: t.c.text, fontSize: t.fontSize.body, paddingVertical: t.spacing.sm, ...WEB_INPUT_RESET }}
        />
        <Icon name="chevron-down" size={16} color={t.c.muted} />
      </View>
      {open ? (
        <View
          id={listId}
          // RN's roles leave out listbox; react-native-web passes it through.
          {...({ role: 'listbox' } as object)}
          style={[
            {
              position: 'absolute',
              top: height + 4,
              left: 0,
              right: 0,
              minWidth: 260,
              maxHeight: 280,
              backgroundColor: t.c.paper,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.c.line,
              overflow: 'hidden',
              zIndex: 10,
            },
            t.shadow.sheet,
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingVertical: t.spacing.xs }}>
            {matches.length === 0 ? (
              <Text variant="small" tone="muted" style={{ padding: t.spacing.md }}>
                {tr('common:component.noMatches')}
              </Text>
            ) : (
              matches.map((o, i) => (
                <Pressable
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  // Before the field's blur, so the pick isn't lost to it.
                  onPressIn={() => choose(o)}
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
                  {o.value === value ? <Icon name="check" size={16} color={t.c.primary} /> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
