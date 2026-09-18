import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge } from '@/components/Badge';
import { Text } from '@/components/Text';
import { IrpError } from '@/types';

/**
 * The portal's rejections, code and all. The code is worth showing: it is what
 * a user would search for, and what an accountant would quote.
 */
export function ErrorList({ errors }: { errors?: IrpError[] }) {
  const t = useTheme();
  if (!errors?.length) return null;

  return (
    <View style={{ gap: t.spacing.sm }}>
      {errors.map((e, i) => (
        <View key={`${e.code}-${i}`} style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
          {e.code !== '0' ? <Badge label={e.code} tone="danger" size="sm" /> : null}
          <Text variant="small" tone={e.code === '0' ? 'muted' : 'default'} style={{ flex: 1, lineHeight: 19 }}>
            {e.message}
          </Text>
        </View>
      ))}
    </View>
  );
}
