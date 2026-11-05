import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { financialYearOf, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { uid } from '@esmart/core/lib/id';
import type { Money } from '@esmart/core/lib/money';
import type { Vehicle } from '@esmart/core/types';
import { api } from '../../../remote/api';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useVehicles } from '../../../store/selectors';
import { useServerSave } from '../../../components/useServerSave';

type Spend = { vehicleId: string; expenses: Money; expenseCount: number; documentCount: number };

/** The business's vehicles, what each has cost this financial year, and what each carried. */
export default function VehicleSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['settings']);
  const { run: serverSave, saving } = useServerSave();
  const company = useActiveCompany();
  const vehicles = useVehicles(true);
  const saveVehicle = useAppStore((s) => s.saveVehicle);
  const removeVehicle = useAppStore((s) => s.removeVehicle);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);
  const fy = financialYearOf(today(), company.fiscalYearStartMonth);
  const spend = useQuery({
    queryKey: ['vehicleSpend', company.id, fy.start],
    queryFn: async () => ((await api.GET('/companies/{companyId}/vehicles/summary', { params: { path: { companyId: company.id }, query: { from: fy.start, to: fy.end } } })).data?.data ?? []) as Spend[],
  });
  const spendOf = (id: string) => spend.data?.find((s) => s.vehicleId === id);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('settings:vehicles.title') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Text variant="small" tone="muted">
          {tr('settings:vehicles.hint', { fy: fy.label })}
        </Text>
        {vehicles.length ? (
          <Card padded={false}>
            {vehicles.map((v, i) => {
              const s = spendOf(v.id);
              return (
                <ListRow
                  key={v.id}
                  title={v.registration}
                  subtitle={[v.name, s ? tr('settings:vehicles.spend', { amount: formatMoney(s.expenses), count: s.expenseCount, docs: s.documentCount }) : ''].filter(Boolean).join(' · ')}
                  icon="truck-outline"
                  right={v.status === 'inactive' ? <Badge label={tr('settings:vehicles.inactive')} tone="neutral" size="sm" /> : undefined}
                  divider={i < vehicles.length - 1}
                  onPress={() => setEditing(v)}
                  chevron
                />
              );
            })}
          </Card>
        ) : (
          <EmptyState icon="truck-outline" title={tr('settings:vehicles.empty')} message={tr('settings:vehicles.emptyBody')} compact />
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:vehicles.add')} icon="plus" onPress={() => setEditing({ id: '', companyId: company.id, registration: '', status: 'active' })} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? editing.registration : tr('settings:vehicles.add')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id ? (
              <Button
                title={tr('settings:vehicles.delete')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const v = editing;
                  setEditing(null);
                  setConfirmDelete(v);
                }}
              />
            ) : null}
            <Button
              title={tr('settings:vehicles.save')}
              onPress={async () => {
                if (!editing || !editing.registration.trim()) return;
                const vehicle: Vehicle = { ...editing, id: editing.id || uid('veh'), registration: editing.registration.replace(/[\s-]/g, '').toUpperCase(), name: editing.name?.trim() || undefined };
                const res = await serverSave(() => saveVehicle(vehicle), tr('settings:vehicles.saved'), { icon: 'truck-outline' });
                if (res) setEditing(null);
              }}
              loading={saving}
              disabled={!editing?.registration.trim() || saving}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        {editing ? (
          <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
            <TextField label={tr('settings:vehicles.registration')} value={editing.registration} onChangeText={(registration) => setEditing({ ...editing, registration })} placeholder="TN09AB1234" autoCapitalize="characters" required />
            <TextField label={tr('settings:vehicles.name')} value={editing.name ?? ''} onChangeText={(name) => setEditing({ ...editing, name })} maxLength={100} />
            {editing.id ? <SwitchField label={tr('settings:vehicles.active')} value={editing.status !== 'inactive'} onValueChange={(on) => setEditing({ ...editing, status: on ? 'active' : 'inactive' })} /> : null}
          </View>
        ) : null}
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:vehicles.deleteTitle', { registration: confirmDelete?.registration })}
        message={tr('settings:vehicles.deleteMessage')}
        confirmLabel={tr('settings:vehicles.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const v = confirmDelete;
          setConfirmDelete(null);
          if (v) void serverSave(() => removeVehicle(v.id), tr('settings:vehicles.deleted'), { icon: 'truck-outline' });
        }}
      />
    </View>
  );
}
