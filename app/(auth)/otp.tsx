import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAppStore } from '@/store/appStore';

const LENGTH = 6;
/** Fixed code so the prototype can be demonstrated without a real gateway. */
const DEMO_CODE = '123456';

export default function Otp() {
  const t = useTheme();
  const { t: tr } = useTranslation(['auth', 'errors']);
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const signInWithOtp = useAppStore((s) => s.signInWithOtp);

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [error, setError] = useState<string | undefined>();
  const [seconds, setSeconds] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);

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
      ) : (
        <Text variant="caption" tone="muted">
          Prototype code: {DEMO_CODE}
        </Text>
      )}

      <Button title={tr('auth:otp.submit')} onPress={verify} fullWidth size="lg" />

      <View style={{ alignItems: 'center' }}>
        {seconds > 0 ? (
          <Text variant="small" tone="muted">
            Resend code in {seconds}s
          </Text>
        ) : (
          <Pressable onPress={() => setSeconds(30)} accessibilityRole="button">
            <Text variant="small" tone="primary" weight="600">
              Resend code
            </Text>
          </Pressable>
        )}
      </View>
    </AuthShell>
  );
}
