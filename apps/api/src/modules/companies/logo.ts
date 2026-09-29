import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers, type Deps } from '../../context';
import { ApiError, invalid, preconditionFailed } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { companyToWire } from './wire';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** PNG and JPEG by their magic bytes, not the client's word for it. */
function sniffImage(bytes: Buffer): { mime: 'image/png' | 'image/jpeg'; ext: string } | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

/** Drops an attachment row, returning its object key to delete once the write commits. */
async function dropAttachment(tx: DbOrTx, companyId: string, attachmentId: string | null): Promise<string | null> {
  if (!attachmentId) return null;
  const A = schema.attachments;
  const [old] = await tx.delete(A).where(and(eq(A.id, attachmentId), eq(A.companyId, companyId))).returning();
  return old?.storageKey ?? null;
}

/** Best effort: an orphaned object costs storage, not correctness. */
async function deleteObject(deps: Deps, key: string | null) {
  if (key) await deps.providers.storage.delete(key).catch(() => undefined);
}

/** Company logo: uploadCompanyLogo, removeCompanyLogo. */
export const logoHandlers = defineHandlers({
  async uploadCompanyLogo(ctx) {
    const file = await ctx.req.file().catch(() => undefined);
    if (!file) throw invalid('file', 'Attach the logo as the `file` part of a multipart form');
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw invalid('file', 'The logo must be 2 MB or smaller', 'FILE_TOO_LARGE');
    }
    if (bytes.length > MAX_LOGO_BYTES) throw invalid('file', 'The logo must be 2 MB or smaller', 'FILE_TOO_LARGE');
    const kind = sniffImage(bytes);
    if (!kind) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The logo must be a PNG or JPEG image');

    const current = ctx.company;
    const attachmentId = newId('att');
    const storageKey = `logos/${current.id}/${attachmentId}.${kind.ext}`;
    await ctx.deps.providers.storage.put(storageKey, bytes, kind.mime);
    const { row, oldKey } = await ctx.db.transaction(async (tx) => {
      await tx.insert(schema.attachments).values({
        id: attachmentId,
        companyId: current.id,
        name: (file.filename || `logo.${kind.ext}`).slice(0, 255),
        mimeType: kind.mime,
        sizeBytes: bytes.length,
        storageKey,
        checksumSha256: sha256(bytes),
        status: 'ready',
        entityType: 'company',
        entityId: current.id,
        uploadedBy: ctx.user.id,
        uploadedAt: ctx.now,
      });
      const [updated] = await tx
        .update(schema.companies)
        .set({ logoAttachmentId: attachmentId, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      const oldKey = await dropAttachment(tx, current.id, current.logoAttachmentId);
      await recordChange(tx, ctx.user, {
        companyId: current.id,
        action: 'logo updated',
        entityType: 'company',
        entityId: current.id,
        entityLabel: updated.name,
        version: updated.version,
      });
      return { row: updated, oldKey };
    });
    await deleteObject(ctx.deps, oldKey);
    return companyToWire(ctx.deps, row, storageKey);
  },

  async removeCompanyLogo(ctx) {
    const current = ctx.company;
    if (!current.logoAttachmentId) return undefined;
    const oldKey = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.companies)
        .set({ logoAttachmentId: null, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      const key = await dropAttachment(tx, current.id, current.logoAttachmentId);
      await recordChange(tx, ctx.user, {
        companyId: current.id,
        action: 'logo removed',
        entityType: 'company',
        entityId: current.id,
        entityLabel: updated.name,
        version: updated.version,
      });
      return key;
    });
    await deleteObject(ctx.deps, oldKey);
    return undefined;
  },
});
