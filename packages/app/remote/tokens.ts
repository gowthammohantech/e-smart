import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Tokens } from '@esmart/api-client';

const KEY = 'ebs.auth.tokens';

/**
 * The session's tokens. Native builds keep them in the Keychain / Keystore
 * (expo-secure-store); the web build has only localStorage. A copy is held in
 * memory so every request doesn't wait on storage.
 */
let cached: Tokens | null | undefined;
const listeners = new Set<(t: Tokens | null) => void>();

async function read(): Promise<Tokens | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

async function write(t: Tokens | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (t) globalThis.localStorage?.setItem(KEY, JSON.stringify(t));
      else globalThis.localStorage?.removeItem(KEY);
    } else if (t) {
      await SecureStore.setItemAsync(KEY, JSON.stringify(t));
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    // Storage unavailable (private browsing): the in-memory copy still works.
  }
}

export async function getTokens(): Promise<Tokens | null> {
  if (cached === undefined) cached = await read();
  return cached;
}

export async function setTokens(t: Tokens | null): Promise<void> {
  cached = t;
  await write(t);
  listeners.forEach((l) => l(t));
}

/** Called when the tokens change; a refresh the server refused sets null. */
export function onTokensChange(listener: (t: Tokens | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
