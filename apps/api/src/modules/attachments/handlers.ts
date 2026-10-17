import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type Deps } from '../../context';
import { conflict, invalid, notFound } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, iso } from '../../lib/wire';
import { storageKeyFor } from './keys';

const ATT = schema.attachments;
type AttachmentRow = typeof ATT.$inferSelect;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 900;

/**
 * What an attachment can hang off (`attachments.entity_type`), and the table
 * that entity lives in, so a link to a record in another company is refused.
 */
const ENTITY_TABLES: Record<string, string> = {
  document: 'documents',
  payment: 'payments',
  expense: 'expenses',
  party: 'parties',
  item: 'items',
};

export async function attachmentToWire(deps: Deps, row: AttachmentRow): Promise<Schema<'Attachment'>> {
  const uri = row.status === 'ready' ? (await deps.providers.storage.downloadUrl(row.storageKey, { ttlSeconds: UPLOAD_TTL_SECONDS, filename: row.name })).url : undefined;
  return compact({
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    mimeType: row.mimeType,
    size: row.sizeBytes,
    uri,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId,
    uploadedAt: iso(row.uploadedAt),
  });
}

export async function findAttachment(db: DbOrTx, companyId: string, id: string): Promise<AttachmentRow> {
  const [row] = await db.select().from(ATT).where(and(eq(ATT.companyId, companyId), eq(ATT.id, id)));
  if (!row) throw notFound('Attachment');
  return row;
}

async function assertEntity(db: DbOrTx, companyId: string, entityType?: string, entityId?: string) {
  if (!entityType && !entityId) return;
  if (!entityType || !entityId) throw invalid(entityType ? 'entityId' : 'entityType', 'entityType and entityId go together');
  if (entityType === 'company') {
    if (entityId !== companyId) throw invalid('entityId', 'Not this company');
    return;
  }
  const table = ENTITY_TABLES[entityType];
  if (!table) throw invalid('entityType', `One of ${[...Object.keys(ENTITY_TABLES), 'company'].join(', ')}`);
  const res = await db.execute(sql`select 1 from ${sql.identifier(table)} where company_id = ${companyId} and id = ${entityId} limit 1`);
  if (!res.rows.length) throw invalid('entityId', `No such ${entityType} in this company`);
}

async function audit(tx: DbOrTx, user: AuthUser, row: AttachmentRow, action: 'created' | 'updated' | 'deleted', version: number) {
  await recordChange(tx, user, {
    companyId: row.companyId,
    action,
    entityType: 'attachment',
    entityId: row.id,
    entityLabel: row.name,
    version,
    deleted: action === 'deleted',
  });
}

/**
 * Attachments: listAttachments, createAttachmentUpload, completeAttachmentUpload, getAttachment, removeAttachment.
 *
 * The bytes never pass through the API: the client PUTs them to a pre-signed
 * URL, then calls complete, which checks the object really landed.
 */
export const attachmentsHandlers = defineHandlers({
  async listAttachments(ctx) {
    const filters = [eq(ATT.companyId, ctx.company.id)];
    if (ctx.query.entityType) filters.push(eq(ATT.entityType, ctx.query.entityType));
    if (ctx.query.entityId) filters.push(eq(ATT.entityId, ctx.query.entityId));
    const rows = await ctx.db.select().from(ATT).where(and(...filters)).orderBy(asc(ATT.uploadedAt), asc(ATT.id)).limit(500);
    return { data: await Promise.all(rows.map((r) => attachmentToWire(ctx.deps, r))) };
  },

  async createAttachmentUpload(ctx) {
    const { name, mimeType, size, entityType, entityId } = ctx.body;
    if (size <= 0 || size > MAX_ATTACHMENT_BYTES) throw invalid('size', 'Attachments are up to 10 MB');
    const clean = name.replace(/[\\/]+/g, '_').trim().slice(0, 255);
    if (!clean) throw invalid('name', 'Name is required');
    await assertEntity(ctx.db, ctx.company.id, entityType, entityId);
    const id = newId('att');
    const key = storageKeyFor(ctx.company.id, id);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(ATT)
        .values({ id, companyId: ctx.company.id, name: clean, mimeType, sizeBytes: size, storageKey: key, status: 'pending', entityType: entityType ?? null, entityId: entityId ?? null, uploadedBy: ctx.user.id, uploadedAt: ctx.now })
        .returning();
      await audit(tx, ctx.user, created, 'created', 1);
      return created;
    });
    const signed = await ctx.deps.providers.storage.uploadUrl(key, mimeType, UPLOAD_TTL_SECONDS);
    return { attachment: await attachmentToWire(ctx.deps, row), uploadUrl: signed.url, uploadHeaders: signed.headers, expiresAt: signed.expiresAt.toISOString() };
  },

  /** Idempotent: completing a ready attachment returns it unchanged. */
  async completeAttachmentUpload(ctx) {
    const current = await findAttachment(ctx.db, ctx.company.id, ctx.params.id);
    if (current.status === 'ready') return attachmentToWire(ctx.deps, current);
    const storage = ctx.deps.providers.storage;
    const stored = await storage.head(current.storageKey);
    if (!stored) throw invalid('file', 'Nothing was uploaded to the upload URL yet', 'UPLOAD_MISSING');
    if (stored.size > MAX_ATTACHMENT_BYTES) {
      await storage.delete(current.storageKey);
      throw invalid('file', 'Attachments are up to 10 MB', 'UPLOAD_TOO_LARGE');
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(ATT).set({ status: 'ready', sizeBytes: stored.size, uploadedAt: ctx.now }).where(eq(ATT.id, current.id)).returning();
      await audit(tx, ctx.user, updated, 'updated', 2);
      return updated;
    });
    return attachmentToWire(ctx.deps, row);
  },

  async getAttachment(ctx) {
    return attachmentToWire(ctx.deps, await findAttachment(ctx.db, ctx.company.id, ctx.params.id));
  },

  /**
   * An item image or company logo goes with its attachment; an OCR
   * extraction keeps its source file, so that one is refused.
   */
  async removeAttachment(ctx) {
    const current = await findAttachment(ctx.db, ctx.company.id, ctx.params.id);
    const ocr: SQL = sql`select 1 from ocr_extractions where attachment_id = ${current.id} limit 1`;
    if ((await ctx.db.execute(ocr)).rows.length) throw conflict('ATTACHMENT_IN_USE', 'An OCR extraction was made from this file');
    await ctx.db.transaction(async (tx) => {
      const items = await tx
        .update(schema.items)
        .set({ imageAttachmentId: null, version: sql`${schema.items.version} + 1`, updatedAt: ctx.now })
        .where(and(eq(schema.items.companyId, ctx.company.id), eq(schema.items.imageAttachmentId, current.id)))
        .returning();
      for (const it of items) {
        await recordChange(tx, ctx.user, { companyId: it.companyId, action: 'updated', entityType: 'item', entityId: it.id, entityLabel: it.name, version: it.version });
      }
      const companies = await tx
        .update(schema.companies)
        .set({ logoAttachmentId: null, version: sql`${schema.companies.version} + 1`, updatedAt: ctx.now })
        .where(and(eq(schema.companies.id, ctx.company.id), eq(schema.companies.logoAttachmentId, current.id)))
        .returning();
      for (const co of companies) {
        await recordChange(tx, ctx.user, { companyId: co.id, action: 'updated', entityType: 'company', entityId: co.id, entityLabel: co.name, version: co.version });
      }
      await tx.delete(ATT).where(eq(ATT.id, current.id));
      await audit(tx, ctx.user, current, 'deleted', current.status === 'ready' ? 3 : 2);
    });
    await ctx.deps.providers.storage.delete(current.storageKey);
    return undefined;
  },
});
