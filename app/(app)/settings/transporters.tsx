import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/Field';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useTransporters } from '@/store/selectors';
import { Transporter } from '@/types';
import { formatGstin, isValidTransporterId } from '@/domain/gstin';
import { uid } from '@/lib/id';

/** The transporter master, used for Part-B of an e-way bill. */
export default function TransportersSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const toast = useToast();

  const transporters = useTransporters();
  const saveTransporter = useAppStore((s) => s.saveTransporter);
  const removeTransporter = useAppStore((s) => s.removeTransporter);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [editing, setEditing] = useState<Transporter | null>(null);
  const [name, setName] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();

  const open = (transporter?: Transporter) => {
    setEditing(transporter ?? null);
    setName(transporter?.name ?? '');
    setTransporterId(transporter?.transporterId ?? '');
    setPhone(transporter?.phone ?? '');
    setError(undefined);
    setSheetOpen(true);
  };

  const [sheetOpen, setSheetOpen] = useState(false);

  const save = () => {
    if (!name.trim()) return setError('Name is required');
    if (!isValidTransporterId(transporterId)) {
      return setError('Transporter ID must be a valid 15-character GSTIN or TRANSIN');
    }
    saveTransporter({
      id: editing?.id ?? uid('trn'),
      companyId: editing?.companyId ?? activeCompanyId,
      name: name.trim(),
      transporterId: transporterId.trim().toUpperCase(),
      phone: phone.trim() || undefined,
      status: 'active',
    });
    toast.show(editing ? 'Transporter updated' : 'Transporter added', 'success');
    setSheetOpen(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.transporters') }} />
      <Screen bottomInset={80}>
        {transporters.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts"
              icon="truck-outline"
              title="No transporters yet"
              message="Add the carriers you use, so Part-B is a pick rather than a retype."
              actionLabel="Add a transporter"
              onAction={() => open()}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {transporters.map((tr, i) => (
              <Pressable
                key={tr.id}
                onPress={() => open(tr)}
                accessibilityRole="button"
                accessibilityLabel={tr.name}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < transporters.length - 1 ? 0.5 : 0,
                  borderBottomColor: t.c.line,
                  backgroundColor: pressed ? t.c.card2 : 'transparent',
                })}
              >
                <MaterialCommunityIcons name="truck-outline" size={20} color={t.c.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="600">
                    {tr.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatGstin(tr.transporterId)}
                  </Text>
                </View>
                {tr.status === 'inactive' ? <Badge label="Inactive" tone="neutral" size="sm" /> : null}
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        )}
      </Screen>

      <Fab icon="plus" onPress={() => open()} />

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Edit transporter' : 'Add a transporter'}
        footer={
          <View style={{ gap: t.spacing.sm }}>
            <Button title="Save" fullWidth onPress={save} />
            {editing ? (
              <Button
                title="Delete"
                variant="ghost"
                fullWidth
                onPress={() => {
                  removeTransporter(editing.id);
                  setSheetOpen(false);
                  toast.show('Transporter removed', 'success');
                }}
              />
            ) : null}
          </View>
        }
      >
        <View style={{ gap: t.spacing.md }}>
          <TextField label="Name" required value={name} onChangeText={setName} placeholder="Gati Logistics" />
          <TextField
            label="Transporter ID"
            required
            value={transporterId}
            onChangeText={(v) => setTransporterId(v.toUpperCase())}
            placeholder="27AABCT5512M1Z6"
            autoCapitalize="characters"
            error={error}
            hint="A GSTIN, or a TRANSIN if the carrier is not registered."
          />
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 22 6789 1000" />
        </View>
      </Sheet>
    </>
  );
}
