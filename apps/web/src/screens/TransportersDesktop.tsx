import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { PhoneField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '@esmart/app/store/appStore';
import { useTransporters } from '@esmart/app/store/selectors';
import { Transporter } from '@esmart/core/types';
import { formatGstin, isValidTransporterId } from '@esmart/core/domain/gstin';
import { uid } from '@esmart/core/lib/id';
import { useSaveShortcut } from '@esmart/app/components/useSaveShortcut';

const DIALOG_WIDTH = 560;

/**
 * The transporter master on a desktop. The list and the rules are those of
 * the phone screen (`@esmart/app/screens/(app)/settings/transporters`); what
 * differs is the add / edit dialog: a proper dialog with an icon header,
 * fields set out in rows, and buttons that sit at the right instead of
 * stretching edge to edge.
 */
export function TransportersDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings', 'common', 'errors']);
  const toast = useToast();

  const transporters = useTransporters();
  const saveTransporter = useAppStore((s) => s.saveTransporter);
  const removeTransporter = useAppStore((s) => s.removeTransporter);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transporter | null>(null);
  const [name, setName] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const phone = usePhoneInput();
  const [nameError, setNameError] = useState<string | undefined>();
  const [idError, setIdError] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Transporter | null>(null);
  const [fade] = useState(() => new Animated.Value(0));

  const open = (transporter?: Transporter) => {
    setEditing(transporter ?? null);
    setName(transporter?.name ?? '');
    setTransporterId(transporter?.transporterId ?? '');
    phone.reset(transporter?.phone);
    setNameError(undefined);
    setIdError(undefined);
    setPhoneError(undefined);
    fade.setValue(0);
    setSheetOpen(true);
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  };

  const close = () => setSheetOpen(false);

  const save = () => {
    const id = transporterId.trim().toUpperCase();
    const badName = name.trim() ? undefined : tr('errors:validation.required', { field: tr('settings:transporters.name') });
    const badId = !isValidTransporterId(id)
      ? tr('settings:transporters.idInvalid')
      : transporters.some((x) => x.transporterId === id && x.id !== editing?.id)
        ? tr('settings:transporters.idTaken')
        : undefined;
    const badPhone = phone.error();
    setNameError(badName);
    setIdError(badId);
    setPhoneError(badPhone);
    if (badName || badId || badPhone) return;
    saveTransporter({
      id: editing?.id ?? uid('trn'),
      companyId: editing?.companyId ?? activeCompanyId,
      name: name.trim(),
      transporterId: transporterId.trim().toUpperCase(),
      phone: phone.value || undefined,
      status: 'active',
    });
    toast.show(editing ? tr('settings:transporters.updated') : tr('settings:transporters.added'), 'success', { icon: 'truck-outline' });
    close();
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, sheetOpen);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.transporters') }} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 48 }}>
        {transporters.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-contacts"
              icon="truck-outline"
              title={tr('settings:transporters.none')}
              message={tr('settings:transporters.noneBody')}
              actionLabel={tr('settings:transporters.add')}
              onAction={() => open()}
              compact
            />
          </Card>
        ) : (
          <Card padded={false}>
            {transporters.map((transporter, i) => (
              <Pressable
                key={transporter.id}
                onPress={() => open(transporter)}
                accessibilityRole="button"
                accessibilityLabel={transporter.name}
                style={(state) => {
                  const { pressed, hovered, focused } = state as WebPressState;
                  return [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      padding: t.spacing.lg,
                      borderBottomWidth: i < transporters.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
                    },
                    focusRing(t, focused),
                  ];
                }}
              >
                <MaterialCommunityIcons name="truck-outline" size={20} color={t.c.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="600">
                    {transporter.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatGstin(transporter.transporterId)}
                  </Text>
                </View>
                {transporter.status === 'inactive' ? <Badge label={tr('settings:transporters.inactive')} tone="neutral" size="sm" /> : null}
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>

      <Fab icon="plus" label={tr('settings:transporters.add')} onPress={() => open()} />

      <Modal visible={sheetOpen} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay, opacity: fade }]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={tr('common:component.close')}
          />
        </Animated.View>

        <View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }]}
        >
          <Animated.View
            style={[
              {
                width: '100%',
                maxWidth: DIALOG_WIDTH,
                backgroundColor: t.c.paper,
                borderRadius: t.radius.xl,
                borderWidth: t.scheme === 'dark' ? 1 : 0,
                borderColor: t.c.line,
                overflow: 'hidden',
                opacity: fade,
                transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              },
              t.shadow.sheet,
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingHorizontal: t.spacing.xxl,
                paddingTop: t.spacing.xl,
                paddingBottom: t.spacing.lg,
                borderBottomWidth: 1,
                borderBottomColor: t.c.line,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: t.radius.md,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="truck-outline" size={24} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3" weight="700">
                  {editing ? tr('settings:transporters.editTitle') : tr('settings:transporters.add')}
                </Text>
                <Text variant="small" tone="muted">
                  {tr('settings:transporters.dialogBody')}
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={tr('common:component.close')}
                style={(state) => {
                  const { hovered, focused } = state as WebPressState;
                  return [
                    {
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: hovered ? t.c.card2 : 'transparent',
                    },
                    focusRing(t, focused),
                  ];
                }}
              >
                <MaterialCommunityIcons name="close" size={20} color={t.c.muted} />
              </Pressable>
            </View>

            {/* Fields */}
            <View style={{ padding: t.spacing.xxl, gap: t.spacing.lg }}>
              <TextField
                label={tr('settings:transporters.name')}
                required
                icon="domain"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setNameError(undefined);
                }}
                placeholder={tr('settings:transporters.namePlaceholder')}
                error={nameError}
              />
              <View style={{ flexDirection: 'row', gap: t.spacing.lg, alignItems: 'flex-start' }}>
                <View style={{ flex: 3 }}>
                  <TextField
                    label={tr('settings:transporters.id')}
                    required
                    icon="card-account-details-outline"
                    value={transporterId}
                    onChangeText={(v) => {
                      setTransporterId(((v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))(v));
                      setIdError(undefined);
                    }}
                    placeholder="27AABCT5512M1Z6"
                    autoCapitalize="characters"
                    maxLength={15}
                    error={idError}
                    hint={tr('settings:transporters.idHint')}
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <PhoneField
                    label={tr('settings:transporters.phone')}
                    {...phone.field}
                    placeholder="22 6789 1000"
                    error={phoneError}
                  />
                </View>
              </View>
            </View>

            {/* Actions */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                paddingHorizontal: t.spacing.xxl,
                paddingVertical: t.spacing.lg,
                borderTopWidth: 1,
                borderTopColor: t.c.line,
                backgroundColor: t.c.card2,
              }}
            >
              {editing ? (
                <Button
                  title={tr('settings:transporters.delete')}
                  variant="danger"
                  icon="trash-can-outline"
                  onPress={() => {
                    close();
                    setConfirmDelete(editing);
                  }}
                />
              ) : null}
              <View style={{ flex: 1 }} />
              <Button title={tr('common:component.cancel')} variant="ghost" onPress={close} />
              <Button title={tr('settings:transporters.save')} onPress={save} />
            </View>
          </Animated.View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:transporters.deleteTitle', { name: confirmDelete?.name ?? '' })}
        message={tr('settings:transporters.deleteMessage')}
        confirmLabel={tr('settings:transporters.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeTransporter(confirmDelete.id);
          setConfirmDelete(null);
          toast.show(tr('settings:transporters.removed'), 'success', { icon: 'truck-remove-outline' });
        }}
      />
    </View>
  );
}
