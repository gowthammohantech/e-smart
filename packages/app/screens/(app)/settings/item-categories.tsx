import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { TextField } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import type { ItemCategory } from '@esmart/core/types';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useItemCategories } from '../../../store/selectors';
import { useServerSave } from '../../../components/useServerSave';

/** The colours a category can take; the first is the neutral default. */
const COLOURS = ['#8E98AC', '#4DA3FF', '#2EC4B6', '#5CB85C', '#F5A623', '#F2711C', '#E5484D', '#D6409F', '#8E4EC6', '#6E56CF'];

export default function ItemCategorySettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const categories = useItemCategories();
  const saveItemCategory = useAppStore((s) => s.saveItemCategory);
  const removeItemCategory = useAppStore((s) => s.removeItemCategory);

  const [editing, setEditing] = useState<ItemCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ItemCategory | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOURS[0]);

  const open = (c?: ItemCategory) => {
    setEditing(c ?? { id: '', companyId: company.id, name: '', color: COLOURS[0] });
    setName(c?.name ?? '');
    setColor(c?.color ?? COLOURS[0]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.itemCategories') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {categories.length ? (
          <Card padded={false}>
            {categories.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name}
                icon="tag-outline"
                iconColor={c.color}
                divider={i < categories.length - 1}
                onPress={() => open(c)}
                chevron
              />
            ))}
          </Card>
        ) : (
          <EmptyState icon="tag-outline" title={tr('settings:itemCategories.emptyTitle')} message={tr('settings:itemCategories.emptyMessage')} compact />
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:itemCategories.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:itemCategories.editTitle') : tr('settings:itemCategories.add')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id ? (
              <Button
                title={tr('settings:itemCategories.delete')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const c = editing;
                  setEditing(null);
                  setConfirmDelete(c);
                }}
              />
            ) : null}
            <Button
              title={tr('settings:itemCategories.save')}
              onPress={async () => {
                if (!editing || !name.trim()) return;
                const category: ItemCategory = { ...editing, id: editing.id || uid('icat'), companyId: company.id, name: name.trim(), color };
                // The sheet stays open until the server has it, so a refusal (a name taken) can be fixed here.
                const res = await serverSave(() => saveItemCategory(category), tr('settings:itemCategories.saved'), { icon: 'tag-outline' });
                if (res) setEditing(null);
              }}
              loading={saving}
              disabled={!name.trim() || saving}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('settings:itemCategories.name')} value={name} onChangeText={setName} placeholder={tr('settings:itemCategories.namePlaceholder')} icon="tag-outline" maxLength={100} required />
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="small" weight="600">
              {tr('settings:itemCategories.colour')}
            </Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
              {COLOURS.map((c, i) => {
                const selected = c.toLowerCase() === color.toLowerCase();
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={tr('settings:itemCategories.colourOption', { n: i + 1 })}
                    onPress={() => setColor(c)}
                    hitSlop={4}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: c,
                      borderWidth: selected ? 3 : 0,
                      borderColor: t.c.text,
                    }}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:itemCategories.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:itemCategories.deleteMessage')}
        confirmLabel={tr('settings:itemCategories.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const c = confirmDelete;
          setConfirmDelete(null);
          if (c) void serverSave(() => removeItemCategory(c.id), tr('settings:itemCategories.deleted'), { icon: 'tag-outline' });
        }}
      />
    </View>
  );
}
