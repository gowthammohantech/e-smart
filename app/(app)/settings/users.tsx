import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { PickerField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { User, UserRole } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useCurrentUser } from '@/store/selectors';
import { Errors, hasErrors, required, validEmail } from '@/lib/validators';
import { formatRelative } from '@/lib/date';
import { uid } from '@/lib/id';

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full access, including billing and deleting the business.' },
  { value: 'admin', label: 'Admin', description: 'Everything except billing and deleting the business.' },
  { value: 'accountant', label: 'Accountant', description: 'Invoices, bills, payments, expenses and reports.' },
  { value: 'sales', label: 'Sales', description: 'Quotes, invoices, customers and payments received.' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to documents and reports.' },
];

export default function UserSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [roleOpen, setRoleOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'email'>>({});

  const open = (u?: User) => {
    setEditing(u ?? ({ id: '', accountId: '', name: '', email: '', role: 'sales', companyIds: [company.id], branchIds: [], avatarColor: '#007AFF', status: 'invited' } as User));
    setName(u?.name ?? '');
    setEmail(u?.email ?? '');
    setRole(u?.role ?? 'sales');
    setErrors({});
  };

  const save = () => {
    const next: Errors<'name' | 'email'> = { name: required(name, 'Name'), email: required(email, 'Email') ?? validEmail(email) };
    setErrors(next);
    if (hasErrors(next) || !editing) return;

    saveUser({
      ...editing,
      id: editing.id || uid('usr'),
      accountId: editing.accountId || currentUser.accountId,
      name: name.trim(),
      email: email.trim(),
      role,
      companyIds: editing.companyIds.includes(company.id) ? editing.companyIds : [...editing.companyIds, company.id],
      status: editing.id ? editing.status : 'invited',
    });
    toast.show(editing.id ? 'User updated' : 'Invitation sent', 'success');
    setEditing(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.usersAndRoles') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {users.map((u, i) => (
            <ListRow
              key={u.id}
              title={u.name}
              subtitle={u.email}
              meta={u.lastActiveAt ? `Last active ${formatRelative(u.lastActiveAt.slice(0, 10))}` : 'Invitation pending'}
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
        <Button title={tr('settings:users.invite')} icon="account-plus-outline" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit user' : 'Invite someone'}
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
            <Button title={editing?.id ? 'Save' : 'Send invitation'} onPress={save} style={{ flex: 2 }} />
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
        visible={!!confirmRemove}
        title={`Remove ${confirmRemove?.name}?`}
        message={tr('settings:users.removeMessage')}
        confirmLabel={tr('settings:users.remove')}
        destructive
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) removeUser(confirmRemove.id);
          setConfirmRemove(null);
          toast.show(tr('settings:users.removed'), 'success');
        }}
      />
    </View>
  );
}
