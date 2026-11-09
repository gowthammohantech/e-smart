import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Card } from '@esmart/ui/components/Card';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SwitchField, TextField } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { DIALOG_WIDTH, SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { financialYearOf, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { uid } from '@esmart/core/lib/id';
import type { Money } from '@esmart/core/lib/money';
import type { Vehicle } from '@esmart/core/types';
import { api } from '../../../remote/api';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useVehicles } from '../../../store/selectors';
import { SheetActions } from '../../../features/company/SheetActions';
import { useServerSave } from '../../../components/useServerSave';

type Spend = { vehicleId: string; expenses: Money; expenseCount: number; documentCount: number };

/** The business's vehicles, what each has cost this financial year, and what each carried. */
export default function VehicleSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['settings', 'errors']);
  const { run: serverSave, saving } = useServerSave();
  const company = useActiveCompany();
  const vehicles = useVehicles(true);
  const saveVehicle = useAppStore((s) => s.saveVehicle);
  const removeVehicle = useAppStore((s) => s.removeVehicle);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [regError, setRegError] = useState<string | undefined>();
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
      {/* A short list: kept within reach of its chevrons on a desktop, where the add button sits in the page header. */}
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom, maxWidth: desktop ? 640 : undefined }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
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
        // One or two fields: a small dialog on a desktop.
        desktopWidth={DIALOG_WIDTH.sm}
        title={editing?.id ? editing.registration : tr('settings:vehicles.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:vehicles.save')}
            onSave={async () => {
                if (!editing) return;
                if (!editing.registration.trim()) {
                  setRegError(tr('errors:validation.required', { field: tr('settings:vehicles.registration') }));
                  return;
                }
                const vehicle: Vehicle = { ...editing, id: editing.id || uid('veh'), registration: editing.registration.replace(/[\s-]/g, '').toUpperCase(), name: editing.name?.trim() || undefined };
                const res = await serverSave(() => saveVehicle(vehicle), tr('settings:vehicles.saved'), { icon: 'truck-outline' });
                if (res) setEditing(null);
              }}
            saving={saving}
            deleteLabel={tr('settings:vehicles.delete')}
            onDelete={
              editing?.id
                ? () => {
                  const v = editing;
                  setEditing(null);
                  setConfirmDelete(v);
                }
                : undefined
            }
          />
        }
      >
        {editing ? (
          <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
            <TextField label={tr('settings:vehicles.registration')} value={editing.registration} onChangeText={(registration) => {
                setEditing({ ...editing, registration });
                setRegError(undefined);
              }}
              error={regError} placeholder="TN09AB1234" autoCapitalize="characters" required />
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
