import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { initialsOf } from '@esmart/core/lib/format';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/**
 * A business's logo, or its initials when it has none (or the image can't be
 * loaded, e.g. an expired link or no connection).
 */
export function CompanyLogo({ uri, name, size = 84 }: { uri?: string; name: string; size?: number }) {
  const t = useTheme();
  // Remember which uri failed (not just "failed") so a new uri gets a fresh try.
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const failed = failedUri === uri;
  const radius = Math.round(size * 0.2);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.c.card2 }}
        contentFit="cover"
        onError={() => setFailedUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.c.primary, fontSize: size * 0.36, fontWeight: '700' }}>{initialsOf(name)}</Text>
    </View>
  );
}
