import { useEffect, useState } from 'react';
import type { Company } from '@esmart/core/types';
import { api } from './api';

/**
 * The company logo for documents this device renders (preview, print, the design screen), inline as a
 * data URI. Its `logoUri` is a storage link that expires within the hour and that a page may not be
 * allowed to load from, so the image went missing from invoices; through the API it always arrives.
 * Until it has (or offline) the link is used, as before.
 */

/** Data URIs by company and logo: a new logo has a new link path, so it is fetched again. */
const loaded = new Map<string, string>();
const loading = new Map<string, Promise<string | undefined>>();

/** Which logo a link is for: its path, without the signature that changes on every refresh. */
function logoKey(company: Company): string | null {
  const uri = company.logoUri;
  // A file just picked on this device (or already inline) needs nothing fetched.
  if (!uri || !/^https?:/i.test(uri)) return null;
  return `${company.id}|${uri.split('?')[0]}`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

async function fetchLogo(companyId: string): Promise<string | undefined> {
  const { data, response } = await api.GET('/companies/{companyId}/logo', { params: { path: { companyId } }, parseAs: 'arrayBuffer' });
  if (!data) return undefined;
  const mime = response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
  return `data:${mime};base64,${base64(new Uint8Array(data as unknown as ArrayBuffer))}`;
}

function load(key: string, companyId: string): Promise<string | undefined> {
  let p = loading.get(key);
  if (!p) {
    p = fetchLogo(companyId)
      .then((uri) => {
        if (uri) loaded.set(key, uri);
        return uri;
      })
      .catch(() => undefined)
      // A failure (offline, signed out) is tried again the next time a document opens.
      .finally(() => loading.delete(key));
    loading.set(key, p);
  }
  return p;
}

/** The logo to pass as `logoSrc`: inline once fetched, the company's own `logoUri` until then. */
export function useLogoSrc(company: Company | undefined): string | undefined {
  const key = company ? logoKey(company) : null;
  const [fetched, setFetched] = useState<{ key: string; uri: string } | null>(null);
  const companyId = company?.id;
  useEffect(() => {
    if (!key || !companyId || loaded.has(key)) return;
    let live = true;
    void load(key, companyId).then((uri) => {
      if (live && uri) setFetched({ key, uri });
    });
    return () => {
      live = false;
    };
  }, [key, companyId]);
  if (!company?.logoUri) return undefined;
  if (!key) return company.logoUri;
  return loaded.get(key) ?? (fetched?.key === key ? fetched.uri : undefined) ?? company.logoUri;
}
