/**
 * The signed QR code the IRP returns.
 *
 * The portal signs ten fields with its own private key; a scanner reads them
 * back to confirm the invoice in its hand was actually registered. Here the
 * signature is an HMAC with a demo secret — the structure is faithful, the
 * cryptography is not, and the app says so where it shows the code.
 */

import { base64Utf8, sha256Hex } from '@/lib/sha256';
import { EInvoicePayload } from './schema';

export type QrPayload = {
  SellerGstin: string;
  BuyerGstin: string;
  DocNo: string;
  DocTyp: string;
  DocDt: string;
  TotInvVal: number;
  ItemCnt: number;
  MainHsnCode: string;
  Irn: string;
  IrnDt: string;
};

export const DEMO_SIGNING_SECRET = 'elixir-books-smart-demo-irp';

/** The HSN of the highest-value line, as the portal defines it. */
export function mainHsnCode(payload: EInvoicePayload): string {
  return payload.ItemList.reduce(
    (best, item) => (item.TotItemVal > (best?.TotItemVal ?? -1) ? item : best),
    payload.ItemList[0],
  )?.HsnCd ?? '';
}

export function buildQrPayload(
  payload: EInvoicePayload,
  irn: string,
  irnDate: string,
): QrPayload {
  return {
    SellerGstin: payload.SellerDtls.Gstin,
    BuyerGstin: payload.BuyerDtls.Gstin,
    DocNo: payload.DocDtls.No,
    DocTyp: payload.DocDtls.Typ,
    DocDt: payload.DocDtls.Dt,
    TotInvVal: payload.ValDtls.TotInvVal,
    ItemCnt: payload.ItemList.length,
    MainHsnCode: mainHsnCode(payload),
    Irn: irn,
    IrnDt: irnDate,
  };
}

function base64Url(input: string): string {
  return base64Utf8(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JWS-shaped `header.payload.signature`, so the QR looks like the real thing. */
export function signJws(body: string, secret = DEMO_SIGNING_SECRET): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64Url(body);
  const signature = base64Url(sha256Hex(`${secret}.${header}.${claims}`));
  return `${header}.${claims}.${signature}`;
}

export function signQr(qr: QrPayload, secret = DEMO_SIGNING_SECRET): string {
  return signJws(JSON.stringify(qr), secret);
}

/** Returns the payload only when the signature still matches the body. */
export function readSignedQr(token: string, secret = DEMO_SIGNING_SECRET): QrPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, claims, signature] = parts;
  if (base64Url(sha256Hex(`${secret}.${header}.${claims}`)) !== signature) return null;
  try {
    return JSON.parse(decodeBase64Url(claims)) as QrPayload;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // Decode the UTF-8 bytes back to a string.
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
      } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    } else {
      const code =
        ((b & 0x07) << 18) |
        ((bytes[++i] & 0x3f) << 12) |
        ((bytes[++i] & 0x3f) << 6) |
        (bytes[++i] & 0x3f);
      const offset = code - 0x10000;
      out += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
    }
  }
  return out;
}
