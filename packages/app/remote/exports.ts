import type { Schema } from '@esmart/api-client';
import { api } from './api';
import { RemoteError } from './errors';

export type ExportFormat = 'json-backup' | 'csv-zip' | 'tally-xml';
export type BackupSettings = Schema<'BackupSettings'>;

const POLL_MS = 1500;
const GIVE_UP_MS = 120_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the server for an export of the whole company and waits for the job,
 * returning the signed download URL. Throws if the job fails or runs past
 * two minutes.
 */
export async function exportCompany(companyId: string, format: ExportFormat): Promise<string> {
  const { data: job } = await api.POST('/companies/{companyId}/exports', { params: { path: { companyId } }, body: { format } });
  let current = job;
  const started = Date.now();
  while (current?.id && current.status !== 'completed' && current.status !== 'failed') {
    if (Date.now() - started > GIVE_UP_MS) throw new RemoteError('exportSlow', 'The export is taking longer than expected; try again shortly');
    await wait(POLL_MS);
    current = (await api.GET('/companies/{companyId}/exports/{id}', { params: { path: { companyId, id: current.id } } })).data;
  }
  if (current?.status !== 'completed' || !current.downloadUrl) throw new RemoteError('exportFailed', 'The export failed');
  return current.downloadUrl;
}

export async function getBackupSettings(companyId: string): Promise<BackupSettings> {
  const { data } = await api.GET('/companies/{companyId}/backup-settings', { params: { path: { companyId } } });
  return data ?? {};
}

export async function saveBackupSettings(companyId: string, settings: BackupSettings): Promise<BackupSettings> {
  const { lastBackupAt, ...body } = settings;
  void lastBackupAt;
  const { data } = await api.PUT('/companies/{companyId}/backup-settings', { params: { path: { companyId } }, body });
  return data ?? settings;
}

/** GSTR-1 for a month (`MMYYYY`) in the JSON the GST portal's offline tool imports, as bytes. */
/** `gstin`: the registration whose return it is (a branch's own); the company's when left out. */
export async function gstr1Json(companyId: string, period: string, gstin?: string): Promise<Uint8Array> {
  const { data } = await api.GET('/companies/{companyId}/gst/gstr1/export', {
    params: { path: { companyId }, query: { period, format: 'gstn-json', ...(gstin && { gstin }) } },
    parseAs: 'arrayBuffer',
  });
  if (!data) throw new RemoteError('exportFailed', 'The server returned no file');
  return new Uint8Array(data as unknown as ArrayBuffer);
}
