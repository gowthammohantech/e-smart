import { Platform } from 'react-native';

const APP_SCHEME = 'elixirsmart';

/** A phone's browser, where an installed app might be able to take a link over. */
export const onMobileBrowser = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Asks the phone to open the installed app at `path` (for example
 * `accept-invite?token=…`). If the app isn't installed nothing happens and the
 * web page the person is on carries on.
 */
export function openInApp(path: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = `${APP_SCHEME}://${path}`;
}
