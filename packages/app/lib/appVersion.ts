import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * The version people see in About: what the store build really is (`1.0.1 (103)`), read from the
 * installed app on a phone. A browser has no build number of its own: the web shows the one its
 * deploy compiled in (`EXPO_PUBLIC_BUILD`, e.g. the commit), else its app.json version alone.
 */
export function appVersion(): { version: string; build: string | null; label: string } {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Application.nativeBuildVersion ?? process.env.EXPO_PUBLIC_BUILD ?? null;
  return { version, build, label: build ? `${version} (${build})` : version };
}
