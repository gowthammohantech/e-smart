import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

/** Wide enough for three tiles to a row; narrower keeps two. */
const THREE_MIN = 1000;

/**
 * Settings cards in rows on a desktop, so a switch sits near its label instead of across the
 * page. Two to a row, or `per="auto"` for three when the grid is 1000px and wider (option tiles).
 * Cards in a row share its height; a short last row keeps empty slots so every tile is one width.
 * A phone stacks them with no wrapper, in the parent column's spacing.
 */
export function CardGrid({ children, per = 2 }: { children: React.ReactNode; per?: 2 | 3 | 'auto' }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const [width, setWidth] = React.useState(0);
  const shown = React.Children.toArray(children).filter(Boolean);
  if (!desktop) return <>{shown}</>;
  const n = per === 'auto' ? (width >= THREE_MIN ? 3 : 2) : per;
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < shown.length; i += n) rows.push(shown.slice(i, i + n));
  return (
    <View style={{ gap: t.spacing.lg }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', alignItems: 'stretch', gap: t.spacing.lg }}>
          {Array.from({ length: n }, (_, c) => (
            <View key={c} style={{ flex: 1, minWidth: 0 }}>
              {row[c] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
