import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { tint, type InvoiceLayout } from '@esmart/core/render/invoiceTemplate';

/** Ink and paper of the drawing: a sheet is white on light and dark themes alike, as printed. */
const PAPER = '#FFFFFF';
const INK = '#C9CED8';
const RULE = '#8E97A8';

const bar = (style: ViewStyle, color = INK) => <View style={[{ height: 3, borderRadius: 1.5, backgroundColor: color }, style]} />;

/**
 * A schematic of a printed layout in its accent: where the parties, the items and the totals
 * sit, so the choice reads at a glance without rendering a page for each.
 */
export function LayoutThumb({ layout, accent, width = 72 }: { layout: InvoiceLayout; accent: string; width?: number }) {
  const height = Math.round(width * 1.38);
  const sheet: ViewStyle = { width, height, backgroundColor: PAPER, borderRadius: 3, padding: 5, gap: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#E3E6EC' };
  const rows = (n: number, fill?: string) =>
    Array.from({ length: n }, (_, i) => <View key={i} style={{ height: 4, backgroundColor: fill, borderBottomWidth: 0.5, borderColor: fill ? 'transparent' : INK }} />);

  if (layout === 'standard') {
    return (
      <View style={sheet}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ gap: 2, width: '45%' }}>{bar({ width: '80%' }, RULE)}{bar({ width: '60%' })}{bar({ width: '70%' })}</View>
          <View style={{ gap: 2, width: '35%', alignItems: 'flex-end' }}>{bar({ width: '100%' }, accent)}{bar({ width: '60%' })}</View>
        </View>
        <View style={{ height: 1.5, backgroundColor: accent }} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1, gap: 2 }}>{bar({ width: '70%' })}{bar({ width: '50%' })}</View>
          <View style={{ flex: 1, gap: 2 }}>{bar({ width: '50%' })}</View>
        </View>
        <View style={{ height: 4, backgroundColor: '#EEF1F6' }} />
        {rows(3)}
        <View style={{ alignSelf: 'flex-end', width: '45%', gap: 2, marginTop: 2 }}>{bar({})}{bar({})}{bar({}, RULE)}</View>
      </View>
    );
  }

  if (layout === 'modern') {
    const fill = tint(accent, 0.16);
    return (
      <View style={sheet}>
        {bar({ width: '40%', alignSelf: 'center' }, accent)}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 14, height: 6, backgroundColor: INK, borderRadius: 1 }} />
          <View style={{ gap: 2, width: '40%' }}>{bar({})}{bar({})}</View>
        </View>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          <View style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: fill }} />
          <View style={{ flex: 1, height: 16, borderRadius: 4, backgroundColor: fill }} />
        </View>
        <View style={{ height: 5, backgroundColor: accent }} />
        {rows(3, fill)}
        <View style={{ height: 4, backgroundColor: accent, opacity: 0.85, marginTop: 2 }} />
        <View style={{ height: 6, backgroundColor: fill }} />
      </View>
    );
  }

  // The boxed layouts: ruled cells, a filled items header, the HSN table under the items.
  const detailed = layout === 'detailed';
  const cell: ViewStyle = { borderWidth: 0.5, borderColor: RULE, padding: 2, gap: 1.5 };
  return (
    <View style={[sheet, { gap: 0 }]}>
      <View style={[cell, { alignItems: 'center' }]}>{bar({ width: '40%' }, RULE)}</View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <View style={cell}>{bar({ width: '80%' }, RULE)}{bar({ width: '55%' })}</View>
          <View style={cell}>{bar({ width: '70%' })}{bar({ width: '50%' })}</View>
          {detailed ? <View style={cell}>{bar({ width: '65%' })}</View> : null}
        </View>
        <View style={{ flex: 1 }}>
          {Array.from({ length: detailed ? 4 : 3 }, (_, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              <View style={[cell, { flex: 1, height: 7 }]} />
              <View style={[cell, { flex: 1, height: 7 }]} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ height: 5, backgroundColor: accent, flexDirection: 'row' }}>
        {Array.from({ length: detailed ? 7 : 4 }, (_, i) => <View key={i} style={{ flex: 1, borderRightWidth: 0.5, borderColor: '#FFFFFF66' }} />)}
      </View>
      <View style={{ borderWidth: 0.5, borderColor: RULE, height: 16, flexDirection: 'row' }}>
        {Array.from({ length: detailed ? 7 : 4 }, (_, i) => <View key={i} style={{ flex: 1, borderRightWidth: 0.5, borderColor: INK }} />)}
      </View>
      <View style={{ height: 4, backgroundColor: accent, marginTop: 2 }} />
      <View style={{ borderWidth: 0.5, borderColor: RULE, height: 7 }} />
      <View style={{ flexDirection: 'row', flex: 1 }}>
        <View style={[cell, { flex: 1 }]}>{bar({ width: '60%' })}</View>
        <View style={[cell, { flex: 1 }]}>{bar({ width: '50%' })}</View>
      </View>
    </View>
  );
}
