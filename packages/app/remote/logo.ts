import { Platform } from 'react-native';
import type { Company } from '@esmart/core/types';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { applyEntity } from './apply';
import { API_BASE_URL } from './config';
import { getTokens } from './tokens';
import { fileBlob } from './keptFiles';

/** The server refused the logo, or it can't be read. `status` also keeps it from being taken for a lost connection. */
export class LogoError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = 'LogoError';
    this.status = status;
    this.code = code;
  }
}

/** After this many failed attempts with the server reachable, the picked file is given up on. */

async function formFor(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    let blob: Blob;
    try {
      blob = await fileBlob(uri);
    } catch {
      throw new LogoError('The picked image is no longer available. Please choose it again.', 0, 'FILE_GONE');
    }
    form.append('file', blob, 'logo');
  } else {
    // React Native reads the file itself from this descriptor; the server reads the real type from the bytes.
    form.append('file', { uri, name: 'logo.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  return form;
}

async function send(companyId: string, uri: string): Promise<Response> {
  const tokens = await getTokens();
  return fetch(`${API_BASE_URL}/companies/${encodeURIComponent(companyId)}/logo`, {
    method: 'PUT',
    headers: tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
    body: await formFor(uri),
  });
}

/** Sends the image. A 401 gets one retry after the API client has refreshed the session. */
async function putLogo(companyId: string, uri: string): Promise<Company> {
  let res = await send(companyId, uri);
  if (res.status === 401) {
    await api.GET('/me').catch(() => undefined);
    res = await send(companyId, uri);
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string; code?: string };
    throw new LogoError(problem.detail ?? problem.title ?? `Upload failed (${res.status})`, res.status, problem.code);
  }
  return (await res.json()) as Company;
}

/** What shows for the company on this device: the picked file right away, the server's link once it has the logo. */
export function setLocalLogo(companyId: string, logoUri: string | undefined) {
  const { companies } = useAppStore.getState();
  useAppStore.setState({ companies: companies.map((c) => (c.id === companyId ? { ...c, logoUri } : c)) });
}

/**
 * Puts a logo on a company the server already knows. Throws a LogoError when
 * the server refuses it, and a network error when there is no connection.
 */
export async function uploadLogo(companyId: string, uri: string): Promise<void> {
  const company = await putLogo(companyId, uri);
  // An explicit undefined clears a stale link if the server somehow sent none.
  applyEntity('company', { ...company, logoUri: company.logoUri });
}

export async function removeLogo(companyId: string): Promise<void> {
  await api.DELETE('/companies/{companyId}/logo', { params: { path: { companyId } } });
  // Removing bumped the company's version; pick it up so the next save isn't a conflict.
  const { data } = await api.GET('/companies/{companyId}', { params: { path: { companyId } } });
  if (data) applyEntity('company', { ...data, logoUri: undefined });
  else setLocalLogo(companyId, undefined);
}

let linksRefreshedAt = 0;
/** The server's download links last an hour. */
const LINK_REFRESH_MS = 30 * 60_000;

/**
 * Keeps each company's logo and signature links fresh, and picks up either
 * changed on another device.
 */
export async function refreshLogoLinks(): Promise<void> {
  const { data } = await api.GET('/companies');
  const server = new Map((data?.data ?? []).map((c) => [c.id, c.logoUri as string | undefined]));
  const signatures = new Map((data?.data ?? []).map((c) => [c.id, c.signatureUri as string | undefined]));
  const stale = Date.now() - linksRefreshedAt > LINK_REFRESH_MS;
  const { companies } = useAppStore.getState();
  let changed = false;
  const next = companies.map((c) => {
    if (!server.has(c.id)) return c;
    let out = c;
    const sig = signatures.get(c.id);
    if (!(!!sig === !!c.signatureUri && !(sig && stale))) out = { ...out, signatureUri: sig };
    const link = server.get(c.id);
    // A new link every time would re-render every logo each refresh, so only swap when it matters.
    if (!(!!link === !!c.logoUri && !(link && stale))) out = { ...out, logoUri: link };
    if (out !== c) changed = true;
    return out;
  });
  if (changed) useAppStore.setState({ companies: next });
  if (stale) linksRefreshedAt = Date.now();
}
