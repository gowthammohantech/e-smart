import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { useAppStore } from '../../store/appStore';
import { isRemote, remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { toE164 } from '../../remote/phone';

const LENGTH = 6;
/** Fixed code so the prototype can be demonstrated without a real gateway. */
const DEMO_CODE = '123456';

export default function Otp() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const signInWithOtp = useAppStore((s) => s.signInWithOtp);

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [error, setError] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Remote mode sends a real code, on arrival and on every resend.
  const request = React.useCallback(() => {
    if (!isRemote()) return;
    remoteSession
      .requestOtp(toE164(String(phone ?? '')))
      .then((r) => {
        setRequestId(r.requestId);
        setSeconds(r.resendAfterSeconds);
      })
      .catch((err: unknown) => setError(describeError(err, tr)));
  }, [phone, tr]);
  useEffect(request, [request]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setError(undefined);
    if (clean && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const code = digits.join('');

  const verify = () => {
    if (code.length < LENGTH) {
      setError(tr('auth:otp.enterAllDigits'));
      return;
    }
    if (isRemote()) {
      if (!requestId) return;
      setBusy(true);
      remoteSession.verifyOtp(requestId, code).catch((err: unknown) => {
        setBusy(false);
        setError(describeError(err, tr));
      });
      return;
    }
    if (code !== DEMO_CODE) {
      setError(`Incorrect code. Use ${DEMO_CODE} in this prototype.`);
      return;
    }
    signInWithOtp(String(phone ?? ''));
    router.replace('/(app)/(tabs)');
  };

  return (
    <AuthShell title={tr('auth:otp.title')} subtitle={`We sent a 6-digit code to ${phone ?? 'your phone'}.`}>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, justifyContent: 'space-between' }}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChangeText={(v) => setDigit(i, v)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === tr('auth:otp.backspace') && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
            }}
            keyboardType="number-pad"
            maxLength={1}
            accessibilityLabel={`Digit ${i + 1}`}
            style={{
              flex: 1,
              height: 58,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: error ? t.c.bad : d ? t.c.primary : t.c.line,
              backgroundColor: t.c.card2,
              color: t.c.text,
              fontSize: t.fontSize.h3,
              fontWeight: '700',
              textAlign: 'center',
            }}
          />
        ))}
      </View>

      {error ? (
        <Text variant="caption" tone="bad">
          {error}
        </Text>
      ) : isRemote() ? null : (
        <Text variant="caption" tone="muted">
          Prototype code: {DEMO_CODE}
        </Text>
      )}

      <Button title={tr('auth:otp.submit')} onPress={verify} loading={busy} fullWidth size="lg" />

      <View style={{ alignItems: 'center' }}>
        {seconds > 0 ? (
          <Text variant="small" tone="muted">
            Resend code in {seconds}s
          </Text>
        ) : (
          <Pressable
            onPress={() => {
              setSeconds(30);
              request();
            }}
            accessibilityRole="button"
          >
            <Text variant="small" tone="primary" weight="600">{tr('auth:otp.resend')}</Text>
          </Pressable>
        )}
      </View>
    </AuthShell>
  );
}
