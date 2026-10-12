import type { Schema } from '@esmart/api-client';
import { api } from './api';

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
    if (Date.now() - started > GIVE_UP_MS) throw new Error('The export is taking longer than expected; try again shortly');
    await wait(POLL_MS);
    current = (await api.GET('/companies/{companyId}/exports/{id}', { params: { path: { companyId, id: current.id } } })).data;
  }
  if (current?.status !== 'completed' || !current.downloadUrl) throw new Error('The export failed');
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
