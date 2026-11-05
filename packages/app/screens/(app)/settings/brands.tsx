import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
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
import type { Brand } from '@esmart/core/types';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBrands } from '../../../store/selectors';
import { useServerSave } from '../../../components/useServerSave';

export default function BrandSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const brands = useBrands();
  const saveBrand = useAppStore((s) => s.saveBrand);
  const removeBrand = useAppStore((s) => s.removeBrand);

  const [editing, setEditing] = useState<Brand | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Brand | null>(null);
  const [name, setName] = useState('');

  const open = (b?: Brand) => {
    setEditing(b ?? { id: '', companyId: company.id, name: '' });
    setName(b?.name ?? '');
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.brands') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {brands.length ? (
          <Card padded={false}>
            {brands.map((b, i) => (
              <ListRow key={b.id} title={b.name} icon="star-circle-outline" divider={i < brands.length - 1} onPress={() => open(b)} chevron />
            ))}
          </Card>
        ) : (
          <EmptyState icon="star-circle-outline" title={tr('settings:brands.emptyTitle')} message={tr('settings:brands.emptyMessage')} compact />
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:brands.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:brands.editTitle') : tr('settings:brands.add')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id ? (
              <Button
                title={tr('settings:brands.delete')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const b = editing;
                  setEditing(null);
                  setConfirmDelete(b);
                }}
              />
            ) : null}
            <Button
              title={tr('settings:brands.save')}
              onPress={async () => {
                if (!editing || !name.trim()) return;
                const brand: Brand = { ...editing, id: editing.id || uid('brd'), companyId: company.id, name: name.trim() };
                // The sheet stays open until the server has it, so a refusal (a name taken) can be fixed here.
                const res = await serverSave(() => saveBrand(brand), tr('settings:brands.saved'), { icon: 'star-circle-outline' });
                if (res) setEditing(null);
              }}
              loading={saving}
              disabled={!name.trim() || saving}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg }}>
          <TextField label={tr('settings:brands.name')} value={name} onChangeText={setName} placeholder={tr('settings:brands.namePlaceholder')} icon="star-circle-outline" maxLength={100} required />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:brands.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:brands.deleteMessage')}
        confirmLabel={tr('settings:brands.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const b = confirmDelete;
          setConfirmDelete(null);
          if (b) void serverSave(() => removeBrand(b.id), tr('settings:brands.deleted'), { icon: 'star-circle-outline' });
        }}
      />
    </View>
  );
}
