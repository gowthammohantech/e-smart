import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@esmart/api-client';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import { remoteSession, useRemoteMeta } from '../../remote';
import { describeError } from '../../remote/errors';
import { useAppStore } from '../../store/appStore';
import { useCurrentUser } from '../../store/selectors';
import { useOnboardingStore } from '../../store/onboardingStore';
import { canDeleteAccount } from './deleteAccountRules';

/**
 * Deleting the account, as the app stores require it be offered in the app. It needs the network and an
 * the word DELETE, and the password or a code to the phone.
 */
export function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['settings', 'common']);
  const router = useRouter();
  const toast = useToast();
  const user = useCurrentUser();
  const online = useRemoteMeta((m) => m.online);

  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [byPhone, setByPhone] = useState(false);
  const [otp, setOtp] = useState<{ requestId: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTyped('');
    setPassword('');
    setCode('');
    setOtp(null);
    setByPhone(false);
    setError(null);
    setBlockedBy(null);
    onClose();
  };

  // Sending: a second tap while the first request is out would send a second SMS.
  const [sending, setSending] = useState(false);
  const sendCode = async () => {
    if (!user?.phone || sending) return;
    setSending(true);
    setError(null);
    try {
      setOtp(await remoteSession.requestOtp(user.phone));
    } catch (err) {
      setError(describeError(err, tr));
    } finally {
      setSending(false);
    }
  };

  const ready = canDeleteAccount({ online, typed, byPhone, codeRequested: !!otp, code, password, busy });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await remoteSession.deleteAccount(
        byPhone && otp ? { confirm: 'DELETE', otpRequestId: otp.requestId, otpCode: code.trim() } : { confirm: 'DELETE', password },
      );
      useOnboardingStore.getState().reset();
      onClose();
      router.replace('/(auth)/welcome');
      toast.show(tr('settings:deleteAccount.done'), 'info', { icon: 'account-remove-outline' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OWNER_MUST_TRANSFER') {
        const companies = (err.problem as { companies?: { name: string }[] }).companies ?? [];
        setBlockedBy(companies.map((c) => c.name));
      } else if (err instanceof ApiError && err.code === 'REAUTH_FAILED') {
        setError(byPhone ? tr('settings:deleteAccount.wrongCode') : tr('settings:deleteAccount.wrongPassword'));
      } else {
        setError(describeError(err, tr));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={tr('settings:deleteAccount.title')}
      footer={
        <Button title={busy ? tr('settings:deleteAccount.deleting') : tr('settings:deleteAccount.confirm')} variant="danger" onPress={submit} disabled={!ready} fullWidth />
      }
    >
      <View style={{ gap: t.spacing.md }}>
        <Text variant="body">{tr('settings:deleteAccount.what')}</Text>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:deleteAccount.retention')}
        </Text>
        <Button
          title={tr('settings:deleteAccount.backupFirst')}
          variant="secondary"
          icon="cloud-download-outline"
          onPress={() => {
            close();
            router.push('/(app)/settings/backup');
          }}
        />

        {!online ? (
          <Card variant="flat">
            <Text variant="caption" tone="bad">{tr('settings:deleteAccount.offline')}</Text>
          </Card>
        ) : null}
        {blockedBy ? (
          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="bad">{tr('settings:deleteAccount.mustTransfer', { names: blockedBy.join(', ') })}</Text>
            <Button
              title={tr('settings:deleteAccount.openUsers')}
              variant="secondary"
              size="sm"
              onPress={() => {
                close();
                router.push('/(app)/settings/users');
              }}
            />
          </Card>
        ) : null}

        {byPhone ? (
          otp ? (
            <TextField
              label={tr('settings:deleteAccount.code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              textContentType="oneTimeCode"
              autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
              icon="message-processing-outline"
            />
          ) : (
            <Button title={tr('settings:deleteAccount.sendCode', { phone: user?.phone ?? '' })} variant="secondary" onPress={() => void sendCode()} loading={sending} disabled={!online || sending} />
          )
        ) : (
          <TextField label={tr('settings:deleteAccount.password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" icon="lock-outline" />
        )}
        {user?.phone ? (
          <Button
            title={byPhone ? tr('settings:deleteAccount.usePassword') : tr('settings:deleteAccount.usePhone')}
            variant="ghost"
            size="sm"
            onPress={() => {
              setByPhone((b) => !b);
              setError(null);
            }}
          />
        ) : null}

        <TextField label={tr('settings:deleteAccount.typeDelete')} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} icon="alert-outline" />
        {error ? (
          <Text variant="caption" tone="bad" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
