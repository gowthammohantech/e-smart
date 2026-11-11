import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import LixiChat from '@esmart/app/screens/(app)/lixi';
import { LIXI_PANEL_WIDTH, closeLixiPanel, lixiPanelProgress, useLixiPanel } from '../lixiPanel';

/**
 * Lixi as a drawer over the right edge of the desktop shell. It slides in on top
 * of the page, which keeps its width; a click on the dimmed page or Escape shuts
 * it. The chat stays mounted while the panel is shut, so closing it doesn't lose
 * the conversation.
 */
export function LixiPanel() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav', 'common']);
  const { open, ask, nonce } = useLixiPanel();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeLixiPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    // Clipped, so the shut panel parked past the right edge never scrolls the page sideways.
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', zIndex: 50 }]}>
      {/* A click target for the mouse only: the panel's own close button and Escape serve the keyboard and
          screen readers, so the scrim is neither labelled nor in the Tab order. */}
      <Animated.View aria-hidden pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay, opacity: lixiPanelProgress }]}>
        <Pressable style={{ flex: 1, cursor: 'default' } as object} onPress={closeLixiPanel} focusable={false} accessible={false} />
      </Animated.View>
      <Animated.View
        // Shut, the chat is out of reach of the keyboard and screen readers too.
        pointerEvents={open ? 'auto' : 'none'}
        aria-hidden={!open}
        role="complementary"
        aria-label={tr('nav:shell.assistant')}
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: LIXI_PANEL_WIDTH,
            backgroundColor: t.c.bg,
            borderLeftWidth: 1,
            borderLeftColor: t.c.line,
            transform: [{ translateX: lixiPanelProgress.interpolate({ inputRange: [0, 1], outputRange: [LIXI_PANEL_WIDTH + 40, 0] }) }],
          },
          t.shadow.sheet,
        ]}
      >
        <LixiChat key={nonce} onClose={closeLixiPanel} initialAsk={ask} />
      </Animated.View>
    </View>
  );
}
