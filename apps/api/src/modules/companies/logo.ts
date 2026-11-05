import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx, type Deps } from '../../context';
import { ApiError, invalid, preconditionFailed } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { companyToWire } from './wire';

// A phone photo picked at reduced quality is a few MB; a logo or signature has no use for more than this.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type CompanyRow = typeof schema.companies.$inferSelect;

/**
 * The company's images: the logo on its documents and screens, and the authorised
 * signatory's signature above that line. Each is an attachment the company row points at.
 */
const SLOTS = {
  logo: { column: 'logoAttachmentId', folder: 'logos', label: 'logo' },
  signature: { column: 'signatureAttachmentId', folder: 'signatures', label: 'signature' },
} as const;
type Slot = keyof typeof SLOTS;

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

/** One of the company's image files, when it has it. */
async function imageAttachmentOf(db: DbOrTx, companyId: string, attachmentId: string | null | undefined) {
  if (!attachmentId) return null;
  const A = schema.attachments;
  const [a] = await db
    .select({ key: A.storageKey, mime: A.mimeType })
    .from(A)
    .where(and(eq(A.id, attachmentId), eq(A.companyId, companyId)));
  return a ?? null;
}

/** The company's logo file, when it has one. */
const logoAttachmentOf = (db: DbOrTx, company: { id: string; logoAttachmentId: string | null }) => imageAttachmentOf(db, company.id, company.logoAttachmentId);

/** The signature inline, as a data URI, for documents the server renders (as the logo is). */
export async function companySignatureDataUri(db: DbOrTx, deps: Deps, company: { id: string; signatureAttachmentId: string | null }): Promise<string | undefined> {
  const sig = await imageAttachmentOf(db, company.id, company.signatureAttachmentId);
  if (!sig) return undefined;
  const bytes = await deps.providers.storage.get(sig.key).catch(() => null);
  return bytes ? `data:${sig.mime};base64,${bytes.toString('base64')}` : undefined;
}

/** Both image keys of a company, for its wire form. */
export async function companyImageKeys(db: DbOrTx, company: CompanyRow): Promise<{ logo: string | null; signature: string | null }> {
  const [logo, signature] = await Promise.all([
    imageAttachmentOf(db, company.id, company.logoAttachmentId),
    imageAttachmentOf(db, company.id, company.signatureAttachmentId),
  ]);
  return { logo: logo?.key ?? null, signature: signature?.key ?? null };
}

/**
 * The logo inline, as a data URI, for documents the server renders: a PDF then
 * never depends on a link that has to load in time. Undefined when there is
 * none or storage can't return it; the document simply goes without.
 */
export async function companyLogoDataUri(db: DbOrTx, deps: Deps, company: { id: string; logoAttachmentId: string | null }): Promise<string | undefined> {
  const logo = await logoAttachmentOf(db, company);
  if (!logo) return undefined;
  const bytes = await deps.providers.storage.get(logo.key).catch(() => null);
  return bytes ? `data:${logo.mime};base64,${bytes.toString('base64')}` : undefined;
}

/**
 * The logo's bytes, to send inside an email as an inline image: a link would
 * have to be public and loaded, and mail apps block or proxy remote images.
 * Undefined when there is none, storage can't return it, or it is too big to carry.
 */
export async function companyLogoFile(db: DbOrTx, deps: Deps, company: { id: string; logoAttachmentId: string | null }, maxBytes: number): Promise<{ mime: string; base64: string } | undefined> {
  const logo = await logoAttachmentOf(db, company);
  if (!logo) return undefined;
  const bytes = await deps.providers.storage.get(logo.key).catch(() => null);
  return bytes && bytes.length <= maxBytes ? { mime: logo.mime, base64: bytes.toString('base64') } : undefined;
}

/** A signed link to the logo, for messages that can't carry it inline. */
export async function companyLogoLink(db: DbOrTx, deps: Deps, company: { id: string; logoAttachmentId: string | null }, ttlSeconds: number): Promise<string | undefined> {
  const logo = await logoAttachmentOf(db, company);
  if (!logo) return undefined;
  return (await deps.providers.storage.downloadUrl(logo.key, { ttlSeconds }).catch(() => undefined))?.url;
}

/** A company's wire form with links to its logo and signature. */
export async function companyWithImages(deps: Deps, db: DbOrTx, row: CompanyRow) {
  const keys = await companyImageKeys(db, row);
  return companyToWire(deps, row, keys.logo, keys.signature);
}

/** Stores an uploaded PNG or JPEG in the slot, replacing (and deleting) what was there. */
function uploadImage(slot: Slot) {
  const { column, folder, label } = SLOTS[slot];
  return async (ctx: Ctx<'uploadCompanyLogo'> | Ctx<'uploadCompanySignature'>) => {
    const file = await ctx.req.file().catch(() => undefined);
    if (!file) throw invalid('file', `Attach the ${label} as the \`file\` part of a multipart form`);
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw invalid('file', `The ${label} must be 5 MB or smaller`, 'FILE_TOO_LARGE');
    }
    if (bytes.length > MAX_IMAGE_BYTES) throw invalid('file', `The ${label} must be 5 MB or smaller`, 'FILE_TOO_LARGE');
    const kind = sniffImage(bytes);
    if (!kind) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', `The ${label} must be a PNG or JPEG image`);

    const current = ctx.company;
    const attachmentId = newId('att');
    const storageKey = `${folder}/${current.id}/${attachmentId}.${kind.ext}`;
    await ctx.deps.providers.storage.put(storageKey, bytes, kind.mime);
    const { row, oldKey } = await ctx.db.transaction(async (tx) => {
      await tx.insert(schema.attachments).values({
        id: attachmentId,
        companyId: current.id,
        name: (file.filename || `${label}.${kind.ext}`).slice(0, 255),
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
        .set({ [column]: attachmentId, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      const oldKey = await dropAttachment(tx, current.id, current[column]);
      await recordChange(tx, ctx.user, {
        companyId: current.id,
        action: `${label} updated`,
        entityType: 'company',
        entityId: current.id,
        entityLabel: updated.name,
        version: updated.version,
      });
      return { row: updated, oldKey };
    });
    await deleteObject(ctx.deps, oldKey);
    return companyWithImages(ctx.deps, ctx.db, row);
  };
}

/** Clears the slot and deletes its file. */
function removeImage(slot: Slot) {
  const { column, label } = SLOTS[slot];
  return async (ctx: Ctx<'removeCompanyLogo'> | Ctx<'removeCompanySignature'>) => {
    const current = ctx.company;
    if (!current[column]) return undefined;
    const oldKey = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.companies)
        .set({ [column]: null, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, current.id), eq(schema.companies.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      const key = await dropAttachment(tx, current.id, current[column]);
      await recordChange(tx, ctx.user, {
        companyId: current.id,
        action: `${label} removed`,
        entityType: 'company',
        entityId: current.id,
        entityLabel: updated.name,
        version: updated.version,
      });
      return key;
    });
    await deleteObject(ctx.deps, oldKey);
    return undefined;
  };
}

/** Company images: the logo, and the authorised signatory's signature. */
export const companyImageHandlers = defineHandlers({
  uploadCompanyLogo: (ctx) => uploadImage('logo')(ctx),
  removeCompanyLogo: (ctx) => removeImage('logo')(ctx),
  uploadCompanySignature: (ctx) => uploadImage('signature')(ctx),
  removeCompanySignature: (ctx) => removeImage('signature')(ctx),
});
