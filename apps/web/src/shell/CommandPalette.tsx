import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import type { WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { quickActions } from '@esmart/app/components/QuickActions';
import { TABS } from '@esmart/app/navigation/tabs';
import { useGlobalSearch } from '@esmart/app/features/search/useGlobalSearch';
import { matchPages, sectionHref, useAppPages } from '@esmart/app/navigation/pages';
import { appHref } from '@esmart/app/navigation/menu';
import { useCanOpen, usePlan } from '@esmart/app/store/selectors';
import { useDebounced } from '@esmart/app/components/useDebounced';

type Entry = { key: string; group: string; title: string; subtitle?: string; trailing?: string; icon: IconName; route: string };

/**
 * ⌘K: jump to any record or start any common task from the keyboard. Empty,
 * it lists quick actions and sections; typing searches every record. Mounted
 * only while open, so each opening starts blank.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common']);
  const router = useRouter();
  const plan = usePlan();
  const allowed = useCanOpen();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const { results, isFetching } = useGlobalSearch(query);
  const searching = query.trim().length >= 2;
  // Typed but not yet asked (the search waits for typing to pause), or asked and not yet back.
  const settled = useDebounced(query);
  const pending = searching && (isFetching || settled !== query);
  const rows = useRef(new Map<number, View>());
  // Every page in the menu: the sections, the pages under them, the tools and settings.
  const pages = useAppPages();

  const entries = useMemo<Entry[]>(() => {
    const actions: Entry[] = quickActions(tr, t.c.primary)
      .filter((a) => allowed(a.route))
      .map((a) => ({ key: `action-${a.key}`, group: tr('nav:shell.quickActions'), title: a.label, icon: a.icon, route: a.route }));
    if (searching) {
      // "new invoice" starts one: an action whose name has every word typed comes first.
      const words = query.trim().toLowerCase().split(/\s+/);
      const matchedActions = actions.filter((a) => words.every((w) => a.title.toLowerCase().includes(w)));
      const group = tr('nav:shell.pages');
      const matchedPages: Entry[] = matchPages(pages, query).map((p) => ({ ...p, key: `page-${p.key}`, group }));
      // Results arrive in date order across kinds; list each kind together.
      const byGroup = new Map<string, Entry[]>();
      results.slice(0, 40).forEach((r) => byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), { ...r, key: `${r.group}-${r.id}` }]));
      return [...matchedActions, ...matchedPages, ...Array.from(byGroup.values()).flat()];
    }
    // More is the phone's catch-all; the sidebar and settings cover it here.
    // A section whose own page is locked opens the first of its pages the plan has.
    const sections: Entry[] = TABS.filter((tab) => tab.name !== 'more' && sectionHref(plan, tab.name)).map((tab) => ({
      key: `tab-${tab.name}`,
      group: tr('nav:shell.goTo'),
      title: tr(`nav:tab.${tab.name}` as 'nav:tab.index'),
      icon: tab.icon,
      route: appHref(sectionHref(plan, tab.name) as string),
    }));
    return [...actions, ...sections];
  }, [searching, query, pages, results, tr, t.c.primary, allowed, plan]);

  // The arrow keys move the highlight; keep it in view.
  useEffect(() => {
    const node = rows.current.get(index) as unknown as HTMLElement | undefined;
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  const open = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    router.push(entry.route as never);
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={tr('common:component.close')}
      />
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: 96, paddingHorizontal: t.spacing.xl }]}>
        <View
          style={[
            {
              width: '100%',
              maxWidth: 640,
              backgroundColor: t.c.paper,
              borderRadius: t.radius.lg,
              borderWidth: 1,
              borderColor: t.c.line,
              overflow: 'hidden',
            },
            t.shadow.sheet,
          ]}
          accessibilityRole="search"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: t.c.line,
            }}
          >
            <Icon name="magnify" size={20} color={t.c.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setIndex(0);
              }}
              placeholder={tr('nav:shell.searchPlaceholder')}
              placeholderTextColor={t.c.muted}
              accessibilityLabel={tr('nav:shell.searchPlaceholder')}
              onKeyPress={(e) => {
                const key = e.nativeEvent.key;
                if (key === 'ArrowDown') {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, entries.length - 1));
                } else if (key === 'ArrowUp') {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                }
              }}
              onSubmitEditing={() => open(entries[index])}
              style={{ flex: 1, height: 44, fontSize: t.fontSize.body, color: t.c.text, outlineStyle: 'none' } as object}
            />
            <Text variant="micro" tone="muted" weight="700">
              {tr('nav:shell.escKey')}
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: t.spacing.xs }} keyboardShouldPersistTaps="handled">
            {searching && entries.length === 0 ? (
              <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
                {pending ? tr('nav:shell.searching') : tr('nav:shell.noMatches', { query: query.trim() })}
              </Text>
            ) : null}
            {entries.map((entry, i) => {
              const header = i === 0 || entries[i - 1].group !== entry.group ? entry.group : null;
              const active = i === index;
              return (
                <React.Fragment key={entry.key}>
                  {header ? (
                    <Text
                      variant="micro"
                      tone="muted"
                      weight="700"
                      style={{ textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: t.spacing.md, paddingTop: t.spacing.md, paddingBottom: 4 }}
                    >
                      {header}
                    </Text>
                  ) : null}
                  <Pressable
                    ref={(node) => {
                      if (node) rows.current.set(i, node);
                      else rows.current.delete(i);
                    }}
                    onPress={() => open(entry)}
                    onHoverIn={() => setIndex(i)}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    style={(state) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      paddingHorizontal: t.spacing.md,
                      paddingVertical: t.spacing.sm,
                      borderRadius: t.radius.sm,
                      backgroundColor: active || (state as WebPressState).pressed ? t.c.card2 : 'transparent',
                    })}
                  >
                    <Icon name={entry.icon} size={18} color={active ? t.c.primary : t.c.muted} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text variant="small" weight="600" numberOfLines={1}>
                        {entry.title}
                      </Text>
                      {entry.subtitle ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {entry.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {entry.trailing ? (
                      <Text variant="caption" tone="muted">
                        {entry.trailing}
                      </Text>
                    ) : null}
                    {active ? <Icon name="keyboard-return" size={16} color={t.c.muted} /> : null}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, borderTopWidth: 1, borderTopColor: t.c.line }}>
            <Text variant="micro" tone="muted">
              {searching ? tr('nav:shell.paletteHint') : tr('nav:shell.typeToSearch')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
