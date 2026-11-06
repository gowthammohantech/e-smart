import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Avatar } from '@esmart/ui/components/Avatar';
import { CompanyLogo } from '@esmart/ui/components/CompanyLogo';
import { PhoneField, TextField, usePhoneInput } from '@esmart/ui/components/Field';
import { ListRow } from '@esmart/ui/components/ListRow';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '../../../store/appStore';
import { useCompanies, useCurrentUser } from '../../../store/selectors';
import { Errors, hasErrors, required, validEmail } from '@esmart/core/lib/validators';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import type { UserRole } from '@esmart/core/types';
import { useGoBack } from '../../../navigation/useGoBack';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useServerSave } from '../../../components/useServerSave';
import { DeleteAccountSheet } from '../../../features/session/DeleteAccountSheet';

const ROLE_LABELS = {
  owner: 'auth:invite.roles.owner',
  admin: 'auth:invite.roles.admin',
  accountant: 'auth:invite.roles.accountant',
  sales: 'auth:invite.roles.sales',
  viewer: 'auth:invite.roles.viewer',
} as const satisfies Record<UserRole, string>;

export default function Profile() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings', 'auth', 'onboarding']);
  const goBack = useGoBack();
  const toast = useToast();
  const { run: serverSave, saving } = useServerSave();

  const user = useCurrentUser();
  const companies = useCompanies();
  const saveUser = useAppStore((s) => s.saveUser);
  const setActiveCompany = useAppStore((s) => s.setActiveCompany);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const phone = usePhoneInput(user?.phone);
  const [errors, setErrors] = useState<Errors<'name' | 'email' | 'phone'>>({});
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const next: Errors<'name' | 'email' | 'phone'> = {
      name: required(name, tr('settings:profile.name')),
      email: required(email, tr('settings:profile.email')) ?? validEmail(email),
      phone: phone.error(),
    };
    setErrors(next);
    if (hasErrors(next) || !user) return;
    const updated = { ...user, name: name.trim(), email: email.trim(), phone: phone.value || undefined };
    // Stay on the form until the server has it, so a refusal can be fixed here.
    const res = await serverSave(() => saveUser(updated), tr('settings:profile.saved'), { icon: 'account-check-outline' });
    if (res) goBack('/(app)/(tabs)/more');
  };

  // Ctrl+S (⌘+S) does what Save does.
  useSaveShortcut(save);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.yourProfile') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xl }}>
          <Avatar name={user?.name ?? tr('settings:profile.you')} size={72} color={user?.avatarColor} />
          <Text variant="title" weight="700">
            {user?.name}
          </Text>
          <Badge label={tr(ROLE_LABELS[user?.role ?? 'owner'])} tone="info" />
        </Card>

        <TextField label={tr('settings:profile.name')} value={name} onChangeText={setName} icon="account-outline" error={errors.name} required />
        <TextField label={tr('settings:profile.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" error={errors.email} required />
        <PhoneField label={tr('settings:profile.phone')} {...phone.field} icon="cellphone" error={errors.phone} />

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:profile.yourBusinesses')}</Text>
        <Card padded={false}>
          {companies.map((c, i) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={`${tr(`onboarding:businessType.${c.businessType}` as 'onboarding:businessType.other')} · ${c.baseCurrency}`}
              left={<CompanyLogo uri={c.logoUri} name={c.name} size={36} />}
              divider={i < companies.length - 1}
              right={c.id === activeCompanyId ? <Badge label={tr('settings:profile.active')} tone="success" size="sm" /> : undefined}
              onPress={() => {
                // Already the active business: nothing switched, so no message.
                if (c.id === activeCompanyId) return;
                setActiveCompany(c.id);
                toast.show(tr('settings:profile.switched', { name: c.name }), 'info', { icon: 'swap-horizontal', detail: c.baseCurrency, varies: true });
              }}
            />
          ))}
        </Card>

        <Card padded={false}>
          <ListRow title={tr('settings:deleteAccount.row')} icon="account-remove-outline" destructive divider={false} onPress={() => setDeleting(true)} />
        </Card>
      </ScrollView>
      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />

      <FormActions>
        <Button shortcut="S" title={tr('settings:profile.save')} onPress={save} loading={saving} disabled={saving} fullWidth size="lg" />
      </FormActions>
    </KeyboardAvoidingView>
  );
}
