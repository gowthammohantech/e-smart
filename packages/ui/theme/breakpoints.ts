import { Platform, useWindowDimensions } from 'react-native';

/** At or above this width the web app shows the sidebar instead of the tab bar. */
export const DESKTOP_MIN_WIDTH = 768;

/** Past this the sidebar shows labels; below it, icons only. */
export const SIDEBAR_FULL_MIN_WIDTH = 1024;

/** Past this a desktop has room for an extra grid column. */
export const WIDE_MIN_WIDTH = 1440;

/** The desktop content column; wider than this and lines get hard to read. */
export const CONTENT_MAX_WIDTH = 1280;

/** The width forms and sign-in stay at on a desktop. */
export const FORM_MAX_WIDTH = 520;

/** Long multi-section forms (document editor, payments) get a little more. */
export const WIDE_FORM_MAX_WIDTH = 720;

export type Breakpoint = 'phone' | 'tablet' | 'desktop' | 'wide';

/**
 * Where the window sits on the layout scale. Native apps are always 'phone',
 * even on a tablet, so nothing here can change how iOS or Android look.
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < DESKTOP_MIN_WIDTH) return 'phone';
  if (width < SIDEBAR_FULL_MIN_WIDTH) return 'tablet';
  if (width < WIDE_MIN_WIDTH) return 'desktop';
  return 'wide';
}

/** True on a browser window wide enough for the desktop shell. */
export function useIsDesktop(): boolean {
  return useBreakpoint() !== 'phone';
}

/**
 * Whether scroll views show their scrollbar. A phone hides it; a desktop
 * browser user relies on it to see how long a page is and to drag through it.
 */
export const SHOW_SCROLLBAR = Platform.OS === 'web';
