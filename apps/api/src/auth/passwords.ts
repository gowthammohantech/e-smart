import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the library's defaults (OWASP-aligned). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** A real hash of nothing anyone knows, so a check against it costs what a real one does. */
let dummy: Promise<string> | undefined;

/**
 * `verifyPassword`, but taking as long when there is no stored hash (an unknown email, or a user who
 * only signs in by OTP), so the response time doesn't tell which emails are registered.
 */
export async function verifyPasswordTimed(stored: string | null | undefined, password: string): Promise<boolean> {
  if (stored) return verifyPassword(stored, password);
  await verifyPassword(await (dummy ??= hash('no-such-password')), password);
  return false;
}
