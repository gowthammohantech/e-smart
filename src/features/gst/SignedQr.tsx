import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';

/**
 * The signed QR the IRP returns, rendered as a scannable code.
 *
 * The payload is genuine in shape — the ten fields a real QR carries — but it
 * is signed with a demo secret rather than NIC's key, so the caption says so.
 */
export function SignedQr({ payload, size = 148 }: { payload: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
      <View style={{ padding: t.spacing.md, backgroundColor: '#FFFFFF', borderRadius: t.radius.md }}>
        <QRCode value={payload} size={size} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <Text variant="micro" tone="muted" center style={{ maxWidth: 240, lineHeight: 15 }}>
        Signed QR — the structure is the portal&apos;s, the signature is a demo key.
      </Text>
    </View>
  );
}
