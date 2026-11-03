import * as Application from 'expo-application';
import Constants from 'expo-constants';

/**
 * The version people see in About: what the store build really is (`1.0.1 (103)`), read from the
 * installed app on a phone. A browser has no build number, so the web shows its app.json version alone.
 */
export function appVersion(): { version: string; build: string | null; label: string } {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Application.nativeBuildVersion ?? null;
  return { version, build, label: build ? `${version} (${build})` : version };
}
