import { useWindowDimensions } from 'react-native';

/** At or above this width the web app shows the sidebar instead of the tab bar. */
export const DESKTOP_MIN_WIDTH = 768;

/** Screens were drawn for a phone; past this they stop stretching. */
export const CONTENT_MAX_WIDTH = 1120;

/** The width forms and sign-in stay at on a desktop. */
export const FORM_MAX_WIDTH = 520;

export function useIsDesktop(): boolean {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}
