import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { Theme } from './ThemeProvider';

/** react-native-web adds pointer and keyboard state that RN's types leave out. */
export type WebPressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

// Whether the last input was the keyboard, like CSS :focus-visible. A click
// focuses a button too, but only someone tabbing around needs the outline.
let keyboardModality = false;
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboardModality = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    keyboardModality = false;
  }, true);
}

/**
 * The keyboard focus outline for a pressable. Native never reports `focused`
 * for these, and a mouse click doesn't count, so this only draws in a browser
 * for someone using the keyboard.
 */
export function focusRing(t: Theme, focused?: boolean): ViewStyle {
  const show = !!focused && keyboardModality;
  return {
    outlineColor: t.c.primary,
    outlineStyle: show ? 'solid' : undefined,
    outlineWidth: show ? 2 : 0,
    outlineOffset: show ? 1 : 0,
  };
}
