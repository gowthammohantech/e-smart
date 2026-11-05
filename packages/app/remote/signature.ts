import { Platform } from 'react-native';
import type { Company } from '@esmart/core/types';
import { api } from './api';
import { applyEntity } from './apply';
import { API_BASE_URL } from './config';
import { getTokens } from './tokens';
import { fileBlob } from './keptFiles';
import { LogoError } from './logo';

/**
 * The authorised signatory's signature, uploaded straight away. Unlike the logo
 * there's no offline queue: it is set once, from settings, while online, and the
 * screen says so if there's no connection. Errors are LogoErrors (refused or
 * unreadable) or network errors, as for the logo.
 */
async function send(companyId: string, uri: string): Promise<Response> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    let blob: Blob;
    try {
      blob = await fileBlob(uri);
    } catch {
      throw new LogoError('The picked image is no longer available. Please choose it again.', 0, 'FILE_GONE');
    }
    form.append('file', blob, 'signature');
  } else {
    form.append('file', { uri, name: 'signature.png', type: 'image/png' } as unknown as Blob);
  }
  const tokens = await getTokens();
  return fetch(`${API_BASE_URL}/companies/${encodeURIComponent(companyId)}/signature`, {
    method: 'PUT',
    headers: tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
    body: form,
  });
}

export async function uploadSignature(companyId: string, uri: string): Promise<void> {
  let res = await send(companyId, uri);
  // One retry after the API client has refreshed the session.
  if (res.status === 401) {
    await api.GET('/me').catch(() => undefined);
    res = await send(companyId, uri);
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string; code?: string };
    throw new LogoError(problem.detail ?? problem.title ?? `Upload failed (${res.status})`, res.status, problem.code);
  }
  const company = (await res.json()) as Company;
  applyEntity('company', { ...company, signatureUri: company.signatureUri });
}

export async function removeSignature(companyId: string): Promise<void> {
  await api.DELETE('/companies/{companyId}/signature', { params: { path: { companyId } } });
  // Removing bumped the company's version; pick it up so the next save isn't a conflict.
  const { data } = await api.GET('/companies/{companyId}', { params: { path: { companyId } } });
  if (data) applyEntity('company', { ...data, signatureUri: undefined });
}
