import React from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import LixiChat from '@esmart/app/screens/(app)/lixi';
import { LIXI_PANEL_WIDTH, closeLixiPanel, lixiPanelWidth, useLixiPanel } from '../lixiPanel';

/**
 * Lixi as a panel on the right edge of the desktop shell. It sits in the
 * shell's row, so the page beside it narrows as it opens; nothing is covered.
 * The chat stays mounted while the panel is shut, so closing it doesn't lose
 * the conversation.
 */
export function LixiPanel() {
  const t = useTheme();
  const { open, ask, nonce } = useLixiPanel();
  return (
    <Animated.View
      // Shut, the chat is out of reach of the keyboard and screen readers too.
      pointerEvents={open ? 'auto' : 'none'}
      aria-hidden={!open}
      style={{
        width: lixiPanelWidth,
        overflow: 'hidden',
        backgroundColor: t.c.bg,
        borderLeftWidth: open ? 1 : 0,
        borderLeftColor: t.c.line,
      }}
    >
      {/* Fixed width, so the chat slides in rather than reflowing as it opens. */}
      <View style={{ width: LIXI_PANEL_WIDTH, flex: 1 }}>
        <LixiChat key={nonce} onClose={closeLixiPanel} initialAsk={ask} />
      </View>
    </Animated.View>
  );
}
