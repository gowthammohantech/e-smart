import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiError } from '@esmart/api-client';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { TextField } from '@esmart/ui/components/Field';
import { useToast } from '@esmart/ui/components/Toast';
import type { Company } from '@esmart/core/types';
import { remoteSession, useRemoteMeta } from '../../remote';
import { archiveCompany } from '../../remote/archive';
import { describeError } from '../../remote/errors';
import { useAppStore } from '../../store/appStore';
import { useCurrentUser } from '../../store/selectors';
import { canArchiveCompany } from './archiveRules';

/**
 * Archiving one business: it needs the network and nothing of it left to send, its name typed, and
 * the password or a code to the phone, as deleting the account does.
 */
export function ArchiveCompanySheet({ company, visible, onClose }: { company: Company; visible: boolean; onClose: () => void }) {
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
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTyped('');
    setPassword('');
    setCode('');
    setOtp(null);
    setByPhone(false);
    setError(null);
    onClose();
  };

  const sendCode = async () => {
    if (!user?.phone) return;
    setError(null);
    try {
      setOtp(await remoteSession.requestOtp(user.phone));
    } catch (err) {
      setError(describeError(err, tr));
    }
  };

  const ready = canArchiveCompany({ online, name: company.name, typed, byPhone, codeRequested: !!otp, code, password, busy });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const proof = byPhone && otp ? { otpRequestId: otp.requestId, otpCode: code.trim() } : { password };
      await archiveCompany(company.id, { confirmName: typed.trim(), ...proof });
      close();
      router.replace('/(app)/(tabs)' as never);
      toast.show(tr('settings:archiveCompany.done'), 'info', { icon: 'archive-outline', detail: company.name });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REAUTH_FAILED') {
        setError(byPhone ? tr('settings:archiveCompany.wrongCode') : tr('settings:archiveCompany.wrongPassword'));
      } else if (err instanceof ApiError && err.code === 'LAST_COMPANY') {
        setError(tr('settings:archiveCompany.lastCompany'));
      } else if (err instanceof ApiError && err.code === 'SUBSCRIPTION_CANCEL_FAILED') {
        setError(tr('settings:archiveCompany.billingFailed'));
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
      title={tr('settings:archiveCompany.title', { name: company.name })}
      footer={
        <Button
          title={busy ? tr('settings:archiveCompany.archiving') : tr('settings:archiveCompany.confirm')}
          variant="danger"
          onPress={submit}
          disabled={!ready}
          fullWidth
        />
      }
    >
      <View style={{ gap: t.spacing.md }}>
        <Text variant="body">{tr('settings:archiveCompany.what')}</Text>
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('settings:archiveCompany.retention')}
        </Text>
        <Button
          title={tr('settings:archiveCompany.backupFirst')}
          variant="secondary"
          icon="cloud-download-outline"
          onPress={() => {
            close();
            router.push('/(app)/settings/backup');
          }}
        />

        {!online ? (
          <Card variant="flat">
            <Text variant="caption" tone="bad">{tr('settings:archiveCompany.offline')}</Text>
          </Card>
        ) : null}

        {byPhone ? (
          otp ? (
            <TextField label={tr('settings:deleteAccount.code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} icon="message-processing-outline" />
          ) : (
            <Button title={tr('settings:deleteAccount.sendCode', { phone: user?.phone ?? '' })} variant="secondary" onPress={() => void sendCode()} disabled={!online} />
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

        <TextField
          label={tr('settings:archiveCompany.typeName', { name: company.name })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          icon="alert-outline"
        />
        {error ? (
          <Text variant="caption" tone="bad" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
