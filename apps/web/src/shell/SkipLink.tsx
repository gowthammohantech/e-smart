import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';

/** The id of the shell's main content region, which the skip link jumps to. */
export const MAIN_ID = 'main';

/**
 * "Skip to content": the first stop for the Tab key, so a keyboard user can
 * pass the sidebar and top bar in one keystroke. Off-screen until focused.
 * A real link, since that is what screen readers list and expect here.
 */
export function SkipLink() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const [focused, setFocused] = useState(false);
  return (
    <a
      href={`#${MAIN_ID}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={(e) => {
        // Moving focus by hand keeps the router from seeing a hash change.
        e.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: 8,
        left: focused ? 8 : -9999,
        padding: '8px 14px',
        borderRadius: t.radius.md,
        background: t.c.primary,
        color: t.c.onPrimary,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize.small,
        fontWeight: 600,
        textDecoration: 'none',
        outline: `2px solid ${t.c.text}`,
        outlineOffset: 2,
      }}
    >
      {tr('nav:shell.skipToContent')}
    </a>
  );
}
