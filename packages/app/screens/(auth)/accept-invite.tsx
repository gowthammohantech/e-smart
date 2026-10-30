import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Schema } from '@esmart/api-client';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useToast } from '@esmart/ui/components/Toast';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { TextField } from '@esmart/ui/components/Field';
import { Button } from '@esmart/ui/components/Button';
import { Errors, hasErrors, minLength, required } from '@esmart/core/lib/validators';
import { ApiError } from '@esmart/api-client';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { onMobileBrowser, openInApp as openAppAt } from '../../navigation/openInApp';

type Invite = Schema<'InviteDetails'>;

/**
 * Opened from an invitation email: `/accept-invite?token=…`.
 *
 *   1. Shows who invited you to which business and asks whether to join.
 *   2. On accept, asks for a new password (the account is created without
 *      one when the invitation is sent), then signs in; the root layout
 *      takes the new member to the app.
 *
 * Someone who already has an account skips the password: accepting adds the
 * business to their account and signs them in.
 *
 * In a phone's browser the page first offers the installed app by its custom
 * scheme. If the app isn't there nothing happens and the web page carries on.
 */
export default function AcceptInvite() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const toast = useToast();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const inviteToken = token ? String(token) : undefined;

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(!!inviteToken);
  const [failed, setFailed] = useState(!inviteToken);
  const [step, setStep] = useState<'confirm' | 'password'>('confirm');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors<'password' | 'confirm'>>({});
  const [busy, setBusy] = useState(false);

  const openInApp = () => {
    if (inviteToken) openAppAt(`accept-invite?token=${encodeURIComponent(inviteToken)}`);
  };

  useEffect(() => {
    if (!inviteToken) return;
    let live = true;
    remoteSession
      .getInvite(inviteToken)
      .then((d) => {
        if (!live) return;
        setInvite(d);
        if (onMobileBrowser()) openInApp();
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  // Someone with an account already: accepting is the whole job, no new password.
  const joinExisting = () => {
    if (!inviteToken || !invite) return;
    setBusy(true);
    remoteSession
      .acceptInvite(inviteToken, undefined, invite.companyIds[0])
      .then(() => toast.show(tr('auth:invite.joined', { business: invite.businesses.join(', ') }), 'success', { icon: 'account-group-outline' }))
      .catch((err: unknown) => {
      setBusy(false);
      setErrors({ password: err instanceof ApiError && err.status === 400 ? tr('auth:invite.invalid') : describeError(err, tr) });
    });
  };

  const submit = () => {
    const next: Errors<'password' | 'confirm'> = {
      password: required(password, tr('errors:field.password')) ?? minLength(password, 8, tr('errors:field.password')),
      confirm: password !== confirm ? tr('auth:invite.mismatch') : undefined,
    };
    setErrors(next);
    if (hasErrors(next) || !inviteToken) return;
    setBusy(true);
    remoteSession
      .acceptInvite(inviteToken, password)
      .then(() => {
        if (invite) toast.show(tr('auth:invite.joined', { business: invite.businesses.join(', ') }), 'success', { icon: 'account-group-outline' });
      })
      .catch((err: unknown) => {
      setBusy(false);
      setErrors({ password: err instanceof ApiError && (err.status === 404 || err.status === 410 || err.status === 400) ? tr('auth:invite.invalid') : describeError(err, tr) });
    });
  };

  if (loading) {
    return (
      <AuthShell title={tr('auth:invite.title')} hideBack>
        <ActivityIndicator color={t.c.primary} />
      </AuthShell>
    );
  }

  if (failed || !invite) {
    return (
      <AuthShell title={tr('auth:invite.invalidTitle')} subtitle={tr('auth:invite.invalid')} hideBack>
        <View />
      </AuthShell>
    );
  }

  const business = invite.businesses.join(', ');

  if (step === 'confirm') {
    return (
      <AuthShell title={tr('auth:invite.joinTitle', { business })} subtitle={tr('auth:invite.joinSubtitle', { inviter: invite.inviterName })} hideBack>
        <Card style={{ gap: t.spacing.sm }}>
          <Row label={tr('auth:invite.business')} value={business} />
          <Row label={tr('auth:invite.role')} value={tr(`auth:invite.roles.${invite.role}`)} />
          <Row label={tr('auth:invite.account')} value={invite.email} />
        </Card>
        <Button
          title={tr('auth:invite.accept')}
          onPress={invite.existingUser ? joinExisting : () => setStep('password')}
          loading={busy}
          fullWidth
          size="lg"
        />
        {errors.password ? <Text variant="small" tone="bad">{errors.password}</Text> : null}
        {onMobileBrowser() ? <Button title={tr('auth:invite.openApp')} variant="secondary" onPress={openInApp} fullWidth size="lg" /> : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={tr('auth:invite.title')} subtitle={tr('auth:invite.subtitle')} hideBack>
      <TextField
        label={tr('auth:invite.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('auth:signUp.passwordHint')}
        secureTextEntry
        icon="lock-outline"
        error={errors.password}
        required
      />
      <TextField label={tr('auth:invite.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry icon="lock-check-outline" error={errors.confirm} required />
      <Button title={tr('auth:invite.submit')} onPress={submit} loading={busy} fullWidth size="lg" />
    </AuthShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
