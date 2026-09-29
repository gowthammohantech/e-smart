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
