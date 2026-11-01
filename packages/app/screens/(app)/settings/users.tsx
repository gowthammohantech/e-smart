import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { Avatar } from '@esmart/ui/components/Avatar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { User, UserRole } from '@esmart/core/types';
import { nextUserPlan, planInfo, userLimit } from '@esmart/core/domain/plan';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useCurrentUser } from '../../../store/selectors';
import { remoteUsers } from '../../../remote';
import { describeError } from '../../../remote/errors';
import { Errors, hasErrors, required, validEmail } from '@esmart/core/lib/validators';
import { formatRelative } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

const ROLE_KEYS = [
  { value: 'owner', label: 'auth:invite.roles.owner', description: 'settings:users.roleHint.owner' },
  { value: 'admin', label: 'auth:invite.roles.admin', description: 'settings:users.roleHint.admin' },
  { value: 'accountant', label: 'auth:invite.roles.accountant', description: 'settings:users.roleHint.accountant' },
  { value: 'sales', label: 'auth:invite.roles.sales', description: 'settings:users.roleHint.sales' },
  { value: 'viewer', label: 'auth:invite.roles.viewer', description: 'settings:users.roleHint.viewer' },
] as const satisfies readonly { value: UserRole; label: string; description: string }[];

export default function UserSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'auth', 'common']);
  const toast = useToast();
  const ROLES = ROLE_KEYS.map((r) => ({ value: r.value as UserRole, label: tr(r.label), description: tr(r.description) }));
  const router = useRouter();

  const company = useActiveCompany();
  const currentUser = useCurrentUser();
  // Select the raw array and narrow with useMemo — filtering inside the
  // selector returns a fresh array each render and loops forever.
  const allUsers = useAppStore((s) => s.users);
  const users = useMemo(
    () => allUsers.filter((u) => u.companyIds.includes(company.id)),
    [allUsers, company.id],
  );
  const saveUser = useAppStore((s) => s.saveUser);
  const removeUser = useAppStore((s) => s.removeUser);

  const [editing, setEditing] = useState<User | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [roleOpen, setRoleOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email'>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // A pending invitation holds its seat, as it does on the server.
  const limit = userLimit(company.plan);
  const seatsUsed = users.filter((u) => u.status !== 'disabled').length;
  const atLimit = limit !== null && seatsUsed >= limit;

  const open = (u?: User) => {
    if (!u && atLimit) {
      setLimitOpen(true);
      return;
    }
    setEditing(u ?? ({ id: '', accountId: '', name: '', email: '', role: 'sales', companyIds: [company.id], branchIds: [], avatarColor: '#007AFF', status: 'invited' } as User));
    setName(u?.name ?? '');
    setEmail(u?.email ?? '');
    setRole(u?.role ?? 'sales');
    setErrors({});
    setServerError(null);
  };

  // Someone from another account: managed by removing and inviting again, not edited here.
  const isGuest = !!editing?.id && !!editing.accountId && editing.accountId !== currentUser.accountId;

  const save = () => {
    const next: Errors<'name' | 'email'> = { name: required(name, tr('settings:users.name')), email: required(email, tr('settings:users.email')) ?? validEmail(email) };
    setErrors(next);
    if (hasErrors(next) || !editing) return;

    if (editing.id) {
      saveUser({ ...editing, name: name.trim(), role });
      toast.show(tr('settings:users.updated'), 'success', { icon: 'account-check-outline', detail: name.trim() });
      setEditing(null);
      return;
    }

    // A new invitation goes to the server now, so its answer (plan limit, address in use,
    // email not sent) is shown here rather than a row that appears and then disappears.
    setBusy(true);
    setServerError(null);
    remoteUsers
      .inviteUser({ name, email, role, companyIds: [company.id] })
      .then(() => {
        toast.show(tr('settings:users.inviteSent'), 'success', { icon: 'email-fast-outline', detail: email.trim().toLowerCase() });
        setEditing(null);
      })
      .catch((err: unknown) => setServerError(describeError(err, tr)))
      .finally(() => setBusy(false));
  };

  const resend = () => {
    if (!editing?.id) return;
    setBusy(true);
    setServerError(null);
    remoteUsers
      .resendInvite(editing.id)
      .then(() => {
        toast.show(tr('settings:users.inviteResent'), 'success', { icon: 'email-sync-outline', detail: editing.email });
        setEditing(null);
      })
      .catch((err: unknown) => setServerError(describeError(err, tr)))
      .finally(() => setBusy(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.usersAndRoles') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {users.map((u, i) => (
            <ListRow
              key={u.id}
              title={u.name}
              subtitle={u.email}
              meta={u.lastActiveAt ? tr('settings:users.lastActive', { when: formatRelative(u.lastActiveAt.slice(0, 10)) }) : u.status === 'invited' ? tr('settings:users.invitePending') : undefined}
              left={<Avatar name={u.name} size={40} color={u.avatarColor} />}
              divider={i < users.length - 1}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={ROLES.find((r) => r.value === u.role)?.label ?? u.role} tone={u.role === 'owner' ? 'info' : 'neutral'} size="sm" />
                  {u.status === 'invited' ? <Badge label={tr('settings:users.invited')} tone="warning" size="sm" /> : null}
                </View>
              }
              onPress={() => open(u)}
              chevron
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>{tr('settings:users.rolesHeading')}</Text>
        <Card style={{ gap: t.spacing.md }}>
          {ROLES.map((r) => (
            <View key={r.value} style={{ gap: 3 }}>
              <Text variant="small" weight="600">
                {r.label}
              </Text>
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                {r.description}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>

      <PrimaryActionBar title={tr('settings:users.invite')} icon="account-plus-outline" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:users.editTitle') : tr('settings:users.invite')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id && editing.role !== 'owner' ? (
              <Button
                title={tr('settings:users.remove')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const u = editing;
                  setEditing(null);
                  setConfirmRemove(u);
                }}
              />
            ) : null}
            {editing?.id && editing.status === 'invited' ? (
              <Button title={tr('settings:users.resend')} variant="secondary" loading={busy} onPress={resend} style={{ flex: 2 }} />
            ) : null}
            {isGuest ? null : <Button title={editing?.id ? tr('common:action.save') : tr('settings:users.sendInvite')} onPress={save} loading={busy} style={{ flex: 2 }} />}
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('settings:users.name')} value={name} onChangeText={setName} icon="account-outline" error={errors.name} required />
          <TextField
            label={tr('settings:users.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            icon="email-outline"
            error={errors.email}
            required
            editable={!editing?.id}
          />
          <PickerField
            label={tr('settings:users.role')}
            value={ROLES.find((r) => r.value === role)?.label}
            onPress={() => setRoleOpen(true)}
            icon="shield-account-outline"
            hint={ROLES.find((r) => r.value === role)?.description}
          />
          {isGuest ? (
            <Text variant="small" tone="muted">
              {tr('settings:users.guestNote')}
            </Text>
          ) : null}
          {serverError ? (
            <Text variant="small" tone="bad">
              {serverError}
            </Text>
          ) : null}
        </View>
      </Sheet>

      <SelectSheet
        visible={roleOpen}
        onClose={() => setRoleOpen(false)}
        title={tr('settings:users.role')}
        options={ROLES.map((r) => ({ value: r.value, label: r.label, description: r.description }))}
        value={role}
        onSelect={(v) => setRole(v as UserRole)}
        searchable={false}
      />

      <ConfirmDialog
        visible={limitOpen}
        title={tr('settings:users.limitTitle')}
        message={tr('settings:users.limitMessage', { plan: planInfo(company.plan).name, count: limit ?? 0, next: nextUserPlan(company.plan) ? planInfo(nextUserPlan(company.plan)!).name : '' })}
        confirmLabel={tr('settings:users.seePlans')}
        onCancel={() => setLimitOpen(false)}
        onConfirm={() => {
          setLimitOpen(false);
          router.push('/(app)/settings/plan');
        }}
      />

      <ConfirmDialog
        visible={!!confirmRemove}
        title={tr('settings:users.removeTitle', { name: confirmRemove?.name })}
        message={tr('settings:users.removeMessage')}
        confirmLabel={tr('settings:users.remove')}
        destructive
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) removeUser(confirmRemove.id);
          setConfirmRemove(null);
          toast.show(tr('settings:users.removed'), 'success', { icon: 'account-remove-outline', detail: confirmRemove?.name });
        }}
      />
    </View>
  );
}
