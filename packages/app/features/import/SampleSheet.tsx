import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export type ImportSample = { columns: string[]; row: string[] };

const CELL_WIDTH = 140;

/** The web app hides scrollbars everywhere but here (apps/web/src/hideScrollbars.ts): the sheet is wider than the page. */
const SAMPLE_SHEET_ID = 'import-sample-sheet';

/**
 * What the import file should look like: the column names on its first row and one record under
 * them, drawn as a spreadsheet would, scrolling sideways when the columns don't fit.
 */
export function SampleSheet({ sample }: { sample: ImportSample }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking']);
  const cell = (text: string, i: number, header: boolean) => (
    <View
      key={i}
      style={{
        width: CELL_WIDTH,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: 6,
        borderRightWidth: i < sample.columns.length - 1 ? 0.5 : 0,
        borderRightColor: t.c.line,
        backgroundColor: header ? t.c.card2 : 'transparent',
      }}
    >
      <Text variant="caption" weight={header ? '700' : undefined} tone={header ? undefined : 'muted'} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="caption" tone="muted" weight="600">
        {tr('banking:importFlow.sampleTitle')}
      </Text>
      <ScrollView nativeID={SAMPLE_SHEET_ID} horizontal showsHorizontalScrollIndicator={SHOW_SCROLLBAR} style={{ borderWidth: 0.5, borderColor: t.c.line, borderRadius: t.radius.sm }}>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: t.c.line }}>{sample.columns.map((c, i) => cell(c, i, true))}</View>
          <View style={{ flexDirection: 'row' }}>{sample.columns.map((_, i) => cell(sample.row[i] ?? '', i, false))}</View>
        </View>
      </ScrollView>
      <Text variant="caption" tone="muted">
        {tr('banking:importFlow.sampleHint')}
      </Text>
    </View>
  );
}
