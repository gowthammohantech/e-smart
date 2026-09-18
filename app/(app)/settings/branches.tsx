import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { TextField, SwitchField } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Branch } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBranches, useDocuments } from '@/store/selectors';
import { uid } from '@/lib/id';

export default function BranchSettings() {
  const t = useTheme();
  const toast = useToast();

  const company = useActiveCompany();
  const branches = useBranches();
  const documents = useDocuments();
  const saveBranch = useAppStore((s) => s.saveBranch);
  const removeBranch = useAppStore((s) => s.removeBranch);

  const [editing, setEditing] = useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const open = (branch?: Branch) => {
    setEditing(branch ?? ({ id: '', companyId: company.id, name: '', code: '', address: company.address, isPrimary: false } as Branch));
    setName(branch?.name ?? '');
    setCode(branch?.code ?? '');
    setCity(branch?.address.city ?? company.address.city);
    setPhone(branch?.phone ?? '');
    setIsPrimary(branch?.isPrimary ?? false);
  };

  const save = () => {
    if (!editing || !name.trim()) return;
    saveBranch({
      ...editing,
      id: editing.id || uid('brn'),
      companyId: company.id,
      name: name.trim(),
      code: (code || name.slice(0, 3)).toUpperCase(),
      phone: phone.trim() || undefined,
      isPrimary,
      address: { ...editing.address, city: city.trim() || company.address.city },
    });
    toast.show(editing.id ? 'Branch updated' : 'Branch added', 'success');
    setEditing(null);
  };

  const docCount = (branchId: string) => documents.filter((d) => d.branchId === branchId).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Branches' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg }}>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            Branches let you keep stock and documents separate by location. Every document records which branch it belongs
            to, and reports can be filtered by it.
          </Text>
        </Card>

        <Card padded={false}>
          {branches.length === 0 ? (
            <EmptyState icon="warehouse" title="No branches yet" compact />
          ) : (
            branches.map((b, i) => (
              <ListRow
                key={b.id}
                title={b.name}
                subtitle={`${b.code}${b.address.city ? ` · ${b.address.city}` : ''}`}
                meta={`${docCount(b.id)} documents`}
                icon={b.isPrimary ? 'office-building-outline' : 'warehouse'}
                divider={i < branches.length - 1}
                right={b.isPrimary ? <Badge label="Primary" tone="info" size="sm" /> : undefined}
                onPress={() => open(b)}
                onLongPress={() => (b.isPrimary ? undefined : setConfirmDelete(b))}
                chevron
              />
            ))
          )}
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title="Add branch" icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit branch' : 'Add branch'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id && !editing.isPrimary ? (
              <Button
                title="Delete"
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const b = editing;
                  setEditing(null);
                  setConfirmDelete(b);
                }}
              />
            ) : null}
            <Button title="Save" onPress={save} disabled={!name.trim()} style={{ flex: 2 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label="Branch name" value={name} onChangeText={setName} placeholder="e.g. Pune warehouse" icon="warehouse" required />
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <TextField label="Code" value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 5))} placeholder="PUN" autoCapitalize="characters" containerStyle={{ flex: 1 }} />
            <TextField label="City" value={city} onChangeText={setCity} containerStyle={{ flex: 1 }} />
          </View>
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="phone-outline" />
          <SwitchField label="Primary branch" description="Used as the default on new documents." value={isPrimary} onValueChange={setIsPrimary} />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message="Documents already recorded against this branch keep their reference. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeBranch(confirmDelete.id);
          setConfirmDelete(null);
          toast.show('Branch deleted', 'success');
        }}
      />
    </View>
  );
}
