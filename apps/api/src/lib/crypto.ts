import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A URL-safe random secret: refresh tokens, invite and reset tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** AES-256-GCM. Output is iv (12) | tag (16) | ciphertext. */
export function encrypt(plain: string, keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(sealed: Buffer, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8');
}

/** `AB12…9XYZ`: enough to recognise a credential, not enough to use it. */
export function mask(value: string, keep = 4): string {
  if (value.length <= keep * 2) return '•'.repeat(value.length);
  return `${value.slice(0, keep)}${'•'.repeat(Math.max(4, value.length - keep * 2))}${value.slice(-keep)}`;
}
