import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { Text } from '@esmart/ui/components/Text';
import { Menu, MenuDivider, useMenuAnchor } from '@esmart/ui/components/Menu';
import { latencyTone, summarise, useLatency, useRemoteMeta } from '@esmart/app/remote';

const ms = (n: number) => `${Math.round(n)} ms`;

/**
 * How quickly the server is answering, in the top bar: the median round trip of the last requests
 * this app made, with a dot that is green when fast, amber when sluggish and red when slow. Opening
 * it splits the time into the server's share and the network's. Hidden while offline (the
 * connection badge says so) and before the first request has come back.
 */
export function LatencyBadge() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common']);
  const online = useRemoteMeta((s) => s.online);
  const samples = useLatency((s) => s.samples);
  const { setAnchor, rect, open, close } = useMenuAnchor();

  const summary = summarise(samples);
  if (!online || !summary) return null;

  const tone = latencyTone(summary.ms);
  const dot = tone === 'good' ? t.c.good : tone === 'fair' ? t.c.warn : t.c.bad;
  const label = tr(`common:latency.tone.${tone}`);

  const row = (name: string, value: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.lg, paddingVertical: 6 }}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>
        {name}
      </Text>
      <Text variant="mono">{value}</Text>
    </View>
  );

  return (
    <>
      <Pressable
        ref={setAnchor}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={tr('common:latency.a11y', { ms: Math.round(summary.ms), tone: label })}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressState;
          return [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 28,
              paddingHorizontal: 8,
              borderRadius: t.radius.md,
              backgroundColor: pressed || hovered ? t.c.card2 : 'transparent',
              flexShrink: 0,
            },
            focusRing(t, focused),
          ];
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text variant="mono" tone="muted" style={{ fontSize: t.fontSize.caption }}>
          {ms(summary.ms)}
        </Text>
      </Pressable>

      <Menu anchor={rect} onClose={close} align="right" width={280}>
        <View style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            <Text variant="small" weight="600">
              {tr('common:latency.title', { tone: label })}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {tr('common:latency.basis', { count: summary.count })}
          </Text>
        </View>
        <MenuDivider />
        {row(tr('common:latency.roundTrip'), ms(summary.ms))}
        {summary.serverMs !== undefined ? row(tr('common:latency.server'), ms(summary.serverMs)) : null}
        {summary.networkMs !== undefined ? row(tr('common:latency.network'), ms(summary.networkMs)) : null}
        {row(tr('common:latency.slowest'), ms(summary.slowestMs))}
        <MenuDivider />
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm }}>
          {tr('common:latency.updated', { when: new Date(summary.lastAt).toLocaleTimeString() })}
        </Text>
      </Menu>
    </>
  );
}
