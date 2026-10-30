import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ApiError } from '@esmart/api-client';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useToast } from '@esmart/ui/components/Toast';
import { AuthShell } from '@esmart/ui/components/AuthShell';
import { Button } from '@esmart/ui/components/Button';
import { Text } from '@esmart/ui/components/Text';
import { WEB_INPUT_RESET, webFocusHalo } from '@esmart/ui/components/Field';
import { remoteSession } from '../../remote';
import { describeError } from '../../remote/errors';
import { useWelcomeToast } from '../../features/session/useWelcomeToast';
import { toE164 } from '../../remote/phone';

const LENGTH = 6;

export default function Otp() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth']);
  const toast = useToast();
  const welcome = useWelcomeToast();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [error, setError] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);
  // Which box has focus; only a browser shows it, the phone keeps its look.
  const [focusedBox, setFocusedBox] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The server sends a code on arrival and on every resend.
  const request = React.useCallback(
    (resend?: boolean) => {
      remoteSession
        .requestOtp(toE164(String(phone ?? '')))
        .then((r) => {
          setRequestId(r.requestId);
          setSeconds(r.resendAfterSeconds);
          // Only a resend is news; the first code is what the screen is already waiting for.
          if (resend) toast.show(tr('auth:otp.resent'), 'success', { icon: 'message-processing-outline', detail: String(phone ?? '') });
        })
        .catch((err: unknown) => setError(describeError(err, tr)));
    },
    [phone, tr, toast],
  );
  useEffect(() => request(), [request]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const setDigit = (index: number, value: string) => {
    const typed = value.replace(/[^0-9]/g, '');
    const next = [...digits];
    // Typing over a filled box gives its old digit plus the new one; more
    // than that is a pasted code, spread across the boxes from here on.
    const isPaste = typed.length > 1 && !(typed.length === 2 && typed[0] === digits[index]);
    if (isPaste) {
      const pasted = typed.slice(0, LENGTH - index).split('');
      pasted.forEach((d, k) => {
        next[index + k] = d;
      });
      setDigits(next);
      setError(undefined);
      inputs.current[Math.min(index + pasted.length, LENGTH - 1)]?.focus();
      return;
    }
    const clean = typed.slice(-1);
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
    if (!requestId) return;
    setBusy(true);
    // The root layout routes on once the session and its data are in.
    remoteSession.verifyOtp(requestId, code).then(welcome, (err: unknown) => {
      setBusy(false);
      // A correct code for a number with no account: the number is now proven, so carry on to sign-up.
      if (err instanceof ApiError && err.code === 'PHONE_NOT_REGISTERED') {
        router.replace({ pathname: '/(auth)/sign-up', params: { phone: toE164(String(phone ?? '')), verificationId: requestId } });
        return;
      }
      setError(describeError(err, tr));
    });
  };

  return (
    <AuthShell title={tr('auth:otp.title')} subtitle={phone ? tr('auth:otp.sentTo', { phone }) : tr('auth:otp.sentToFallback')}>
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
              // The key name is fixed; it is not the translated label.
              if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
            }}
            onSubmitEditing={verify}
            onFocus={() => setFocusedBox(i)}
            onBlur={() => setFocusedBox((f) => (f === i ? null : f))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            accessibilityLabel={tr('auth:otp.digit', { n: i + 1 })}
            style={{
              flex: 1,
              // A browser input has an intrinsic width; let the row share it out.
              minWidth: 0,
              height: 58,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: error ? t.c.bad : d || (Platform.OS === 'web' && focusedBox === i) ? t.c.primary : t.c.line,
              ...webFocusHalo(t, focusedBox === i && !error),
              ...WEB_INPUT_RESET,
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
      ) : null}

      <Button title={tr('auth:otp.submit')} onPress={verify} loading={busy} fullWidth size="lg" />

      <View style={{ alignItems: 'center' }}>
        {seconds > 0 ? (
          <Text variant="small" tone="muted">
            {tr('auth:otp.resendIn', { seconds })}
          </Text>
        ) : (
          <Pressable
            onPress={() => {
              setSeconds(30);
              request(true);
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
