import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { QrEcc, qrMatrix, qrSvgPath } from '@/lib/qr';

type Props = {
  value: string;
  size?: number;
  ecc?: QrEcc;
  quietZone?: number;
  accessibilityLabel?: string;
};

/**
 * A QR code (FRD 16).
 *
 * Two deliberate choices. The modules are drawn as a single `Path` rather than
 * a grid of rectangles — a signed e-invoice QR runs to version 21, which is
 * over nine hundred dark modules, and that many native views visibly stutters
 * a document screen. And the colours are fixed black on white rather than
 * taken from the theme: a QR has to stay high-contrast and the right way round
 * to scan, so dark mode must not invert it. The white plate around it is part
 * of the code, not decoration.
 */
export function QrCode({
  value,
  size = 132,
  ecc = 'M',
  quietZone = 4,
  accessibilityLabel = 'Signed QR code',
}: Props) {
  const matrix = useMemo(() => {
    try {
      return qrMatrix(value, ecc);
    } catch {
      // An oversized payload should not take a document screen down with it.
      return null;
    }
  }, [value, ecc]);

  if (!matrix) return null;

  const extent = matrix.length + quietZone * 2;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      /* flexShrink 0 matters: a squashed symbol still looks like a QR code and
         no longer scans, and a sheet or a row will happily compress it. */
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 4, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${extent} ${extent}`}>
        <Rect x={0} y={0} width={extent} height={extent} fill="#FFFFFF" />
        <G x={quietZone} y={quietZone}>
          <Path d={qrSvgPath(matrix)} fill="#000000" />
        </G>
      </Svg>
    </View>
  );
}
