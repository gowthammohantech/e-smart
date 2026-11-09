import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Sheet } from '@esmart/ui/components/Sheet';
import { latencyTone, summarise, useLatency, useRemoteMeta } from '../remote';

const ms = (n: number) => `${Math.round(n)} ms`;

/**
 * The phone header's server-speed readout, the twin of the web top bar's: a small pill with a
 * coloured dot (green fast, amber sluggish, red slow) and the median round trip. Tapping it opens a
 * sheet that splits the time into the server's share and the network's. It shares the header slot
 * with the connection badge and never shows alongside it: hidden while offline or while the books
 * are first loading, and before the first request has come back.
 */
export function LatencyChip() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const online = useRemoteMeta((s) => s.online);
  const firstLoad = useRemoteMeta((s) => s.syncing && !s.lastSyncAt);
  const samples = useLatency((s) => s.samples);
  const [open, setOpen] = useState(false);

  const summary = summarise(samples);
  if (!online || firstLoad || !summary) return null;

  const tone = latencyTone(summary.ms);
  const dot = tone === 'good' ? t.c.good : tone === 'fair' ? t.c.warn : t.c.bad;
  const label = tr(`common:latency.tone.${tone}`);

  const row = (name: string, value: string) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
    >
      <Text variant="body" tone="muted" style={{ flex: 1 }}>
        {name}
      </Text>
      <Text variant="mono">{value}</Text>
    </View>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tr('common:latency.a11y', { ms: Math.round(summary.ms), tone: label })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          height: 28,
          paddingHorizontal: 9,
          borderRadius: 14,
          backgroundColor: t.c.card,
          borderWidth: t.scheme === 'dark' ? 1 : 0,
          borderColor: t.c.line,
          flexShrink: 0,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
        <Text variant="mono" tone="muted" style={{ fontSize: t.fontSize.caption }}>
          {ms(summary.ms)}
        </Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={tr('common:latency.title', { tone: label })}
        subtitle={tr('common:latency.basis', { count: summary.count })}
        scroll={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.lg }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} />
          <Text variant="h1" weight="700">
            {ms(summary.ms)}
          </Text>
        </View>
        {row(tr('common:latency.roundTrip'), ms(summary.ms))}
        {summary.serverMs !== undefined ? row(tr('common:latency.server'), ms(summary.serverMs)) : null}
        {summary.networkMs !== undefined ? row(tr('common:latency.network'), ms(summary.networkMs)) : null}
        {row(tr('common:latency.slowest'), ms(summary.slowestMs))}
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.lg }}>
          {tr('common:latency.updated', { when: new Date(summary.lastAt).toLocaleTimeString() })}
        </Text>
      </Sheet>
    </>
  );
}
