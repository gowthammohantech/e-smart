import type { Attachment } from '@esmart/core/types';
import { useAppStore } from '../store/appStore';
import { api } from './api';
import { applyEntity } from './apply';

type Mime = 'image/jpeg' | 'image/png' | 'image/heic' | 'application/pdf';
const MIMES: Mime[] = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];

function mimeOf(type: string | undefined, uri: string): Mime {
  if (type && (MIMES as string[]).includes(type)) return type as Mime;
  if (/\.png$/i.test(uri)) return 'image/png';
  if (/\.heic$/i.test(uri)) return 'image/heic';
  if (/\.pdf$/i.test(uri)) return 'application/pdf';
  return 'image/jpeg';
}

/**
 * Uploads a local file (a photo URI on the phone, a blob URL in a browser)
 * as an attachment: reserve it, PUT the bytes to the signed URL, then
 * complete it. Needs a connection; throws when there is none. The finished
 * attachment is added to the store and returned.
 */
export async function uploadAttachment(input: { companyId: string; uri: string; name: string; entityType?: string; entityId?: string }): Promise<Attachment> {
  const blob = await (await fetch(input.uri)).blob();
  const mimeType = mimeOf(blob.type, input.uri);
  const { data: reserved } = await api.POST('/companies/{companyId}/attachments', {
    params: { path: { companyId: input.companyId } },
    body: { name: input.name, mimeType, size: blob.size, entityType: input.entityType, entityId: input.entityId },
  });
  if (!reserved?.attachment?.id || !reserved.uploadUrl) throw new Error('The server did not return an upload URL');
  const put = await fetch(reserved.uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType, ...(reserved.uploadHeaders ?? {}) }, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  const { data: done } = await api.POST('/companies/{companyId}/attachments/{id}/complete', {
    params: { path: { companyId: input.companyId, id: reserved.attachment.id } },
  });
  const attachment = (done ?? reserved.attachment) as Attachment;
  applyEntity('attachment', attachment);
  return attachment;
}

/** Deletes an attachment on the server, then from the store. */
export async function deleteAttachment(companyId: string, id: string): Promise<void> {
  await api.DELETE('/companies/{companyId}/attachments/{id}', { params: { path: { companyId, id } } });
  useAppStore.setState({ attachments: useAppStore.getState().attachments.filter((a) => a.id !== id) });
}
