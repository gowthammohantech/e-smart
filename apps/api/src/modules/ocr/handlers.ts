import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { normalizeGstin } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import { defineHandlers, type Deps } from '../../context';
import { enqueue } from '../../jobs/queue';
import { actorFor } from '../webhooks/handlers';
import { ApiError, invalid, notFound } from '../../http/errors';
import { takeAiAction } from '../../lib/aiUsage';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact } from '../../lib/wire';
import type { OcrProvider } from '../../providers/ocr';

const X = schema.ocrExtractions;
const F = schema.ocrFields;
const L = schema.ocrLines;
type ExtractionRow = typeof X.$inferSelect;
type FieldKey = (typeof F.$inferInsert)['key'];
type Extracted = Awaited<ReturnType<OcrProvider['extract']>>;

const FIELD_KEYS: FieldKey[] = ['vendor', 'gstin', 'date', 'amount', 'tax', 'reference', 'category'];
/** What an unconfirmed guess from the text scores: below the 0.75 review line on purpose. */
const CATEGORY_CONFIDENCE = 0.6;

async function findExtraction(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(X).where(and(eq(X.companyId, companyId), eq(X.id, id)));
  if (!row) throw notFound('OCR extraction');
  return row;
}

async function minorDigits(db: DbOrTx, currency: string): Promise<number> {
  const [c] = await db.select({ d: schema.currencies.minorDigits }).from(schema.currencies).where(eq(schema.currencies.code, currency));
  return c?.d ?? 2;
}

async function toWire(db: DbOrTx, row: ExtractionRow, digits: number): Promise<Schema<'OcrExtraction'>> {
  const [fields, lines] = await Promise.all([
    db.select().from(F).where(eq(F.extractionId, row.id)),
    db.select().from(L).where(eq(L.extractionId, row.id)).orderBy(asc(L.position)),
  ]);
  fields.sort((a, b) => FIELD_KEYS.indexOf(a.key) - FIELD_KEYS.indexOf(b.key));
  return compact({
    id: row.id,
    status: row.status,
    attachmentId: row.attachmentId,
    kind: row.kind,
    fields: fields.map((f) => ({ key: f.key, label: f.label, value: f.value ?? '', confidence: Number(f.confidence) })),
    lines: lines.map((l) =>
      compact({
        name: l.name,
        quantity: l.quantity === null ? null : Number(l.quantity),
        unitPrice: l.unitPriceMinor === null ? null : l.unitPriceMinor / 10 ** digits,
        confidence: Number(l.confidence),
        matchedItemId: l.matchedItemId,
      }),
    ),
    matchedPartyId: row.matchedPartyId,
    error: row.error,
  });
}

/** The supplier a bill is from: by GSTIN first, then by name (as the app's matchParty). */
async function matchSupplier(db: DbOrTx, companyId: string, gstin: string | undefined, vendor: string | undefined): Promise<string | null> {
  const P = schema.parties;
  const suppliers = and(eq(P.companyId, companyId), inArray(P.kind, ['supplier', 'both']));
  if (gstin) {
    const [hit] = await db.select({ id: P.id }).from(P).where(and(suppliers, eq(P.taxId, normalizeGstin(gstin))));
    if (hit) return hit.id;
  }
  const name = vendor?.trim();
  if (!name) return null;
  const [exact] = await db.select({ id: P.id }).from(P).where(and(suppliers, ilike(P.name, name)));
  if (exact) return exact.id;
  // The first two significant words, in either order, as matchParty does.
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 2).slice(0, 2);
  if (!words.length) return null;
  const [loose] = await db
    .select({ id: P.id })
    .from(P)
    .where(and(suppliers, ...words.map((w) => sql`${w} = any(regexp_split_to_array(lower(regexp_replace(${P.name}, '[^A-Za-z0-9 ]', '', 'g')), ' '))`)))
    .orderBy(asc(P.name))
    .limit(1);
  return loose?.id ?? null;
}

/** A catalog item with the line's name or SKU. */
async function matchItem(db: DbOrTx, companyId: string, name: string): Promise<string | null> {
  const I = schema.items;
  const [hit] = await db
    .select({ id: I.id })
    .from(I)
    .where(and(eq(I.companyId, companyId), or(ilike(I.name, name), ilike(I.sku, name))))
    .limit(1);
  return hit?.id ?? null;
}

/** An expense category whose name shares a word with the receipt. */
async function suggestCategory(db: DbOrTx, companyId: string, text: string): Promise<string | undefined> {
  const cats = await db.select({ name: schema.expenseCategories.name }).from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, companyId)).orderBy(asc(schema.expenseCategories.name));
  const lower = text.toLowerCase();
  return cats.find((c) => c.name.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 3 && new RegExp(`\\b${w}`).test(lower)))?.name;
}

async function store(tx: DbOrTx, companyId: string, row: ExtractionRow, result: Extracted, digits: number) {
  const fields = result.fields.filter((f): f is typeof f & { key: FieldKey } => FIELD_KEYS.includes(f.key as FieldKey));
  if (row.kind === 'expense' && !fields.some((f) => f.key === 'category')) {
    const category = await suggestCategory(tx, companyId, result.text);
    if (category) fields.push({ key: 'category', label: 'Suggested category', value: category, confidence: CATEGORY_CONFIDENCE });
  }
  if (fields.length) {
    await tx.insert(F).values(fields.map((f) => ({ id: newId('ocf'), extractionId: row.id, key: f.key, label: f.label.slice(0, 60), value: f.value, confidence: f.confidence.toFixed(3) })));
  }
  const lines = await Promise.all(
    result.lines.map(async (l, i) => ({
      id: newId('ocl'),
      extractionId: row.id,
      position: i + 1,
      name: l.name.slice(0, 200),
      quantity: String(l.quantity),
      unitPriceMinor: Math.round(l.unitPrice * 10 ** digits),
      confidence: l.confidence.toFixed(3),
      matchedItemId: await matchItem(tx, companyId, l.name),
    })),
  );
  if (lines.length) await tx.insert(L).values(lines);
  const value = (key: string) => fields.find((f) => f.key === key)?.value || undefined;
  return matchSupplier(tx, companyId, value('gstin'), value('vendor'));
}

/**
 * Reads the attachment and stores what was found: the row goes to completed (or failed). Shared by the
 * request (text read on the device, or a local provider) and the `ocr.extract` job (a network provider).
 * A row already finished is left alone, so the job can run twice.
 */
async function runExtraction(deps: Deps, rowId: string, text: string | undefined): Promise<ExtractionRow | null> {
  const [started] = await deps.db.select().from(X).where(eq(X.id, rowId));
  if (!started || started.status === 'completed' || started.status === 'failed') return started ?? null;
  const [attachment] = await deps.db.select().from(schema.attachments).where(eq(schema.attachments.id, started.attachmentId));
  const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, started.companyId));
  if (!attachment || !company) return null;
  const digits = await minorDigits(deps.db, company.baseCurrency.trim());
  const now = deps.now();
  let result: Extracted | null = null;
  let error: string | null = null;
  try {
    const body = await deps.providers.storage.get(attachment.storageKey);
    result = await deps.providers.ocr.extract({ kind: started.kind, file: body ? { body, mimeType: attachment.mimeType } : null, text });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE') throw err;
    error = (err as Error).message || 'The OCR provider failed';
  }
  const actor = await actorFor(deps.db, started.createdBy, 'OCR');
  return deps.db.transaction(async (tx) => {
    const matchedPartyId = result ? await store(tx, started.companyId, started, result, digits) : null;
    const [finished] = await tx
      .update(X)
      .set({ status: result ? 'completed' : 'failed', matchedPartyId, rawResponse: result, error, completedAt: now })
      .where(eq(X.id, started.id))
      .returning();
    if (actor) {
      await recordChange(tx, actor, { companyId: started.companyId, action: 'created', entityType: 'ocr_extraction', entityId: finished.id, entityLabel: `${started.kind} scan ${attachment.name}`, version: 1 });
    }
    return finished;
  });
}

/** The `ocr.extract` job. */
export async function runQueuedExtraction(deps: Deps, rowId: string) {
  await runExtraction(deps, rowId, undefined);
}

/** Providers that answer in the request: text read on the device needs no network round trip. */
const INLINE_PROVIDERS = new Set(['simulator', 'disabled']);

/**
 * OCR: createOcrExtraction, getOcrExtraction. Text the device already read (ML Kit) is parsed in the
 * request, so the 202 carries a completed extraction, which is what the installed apps expect. An image
 * alone, read by a network provider, is queued: the 202 says `queued` and getOcrExtraction has the result.
 */
export const ocrHandlers = defineHandlers({
  async createOcrExtraction(ctx) {
    const { attachmentId, kind } = ctx.body;
    // Text already read on device (or by a test) skips recognition.
    const text = typeof ctx.body.text === 'string' ? ctx.body.text : undefined;
    const ATT = schema.attachments;
    const [attachment] = await ctx.db.select().from(ATT).where(and(eq(ATT.companyId, ctx.company.id), eq(ATT.id, attachmentId)));
    if (!attachment) throw invalid('attachmentId', 'No such attachment in this company');
    if (attachment.status !== 'ready') throw invalid('attachmentId', 'Finish the upload before extracting', 'ATTACHMENT_NOT_READY');
    const provider = ctx.deps.providers.ocr;
    const digits = await minorDigits(ctx.db, ctx.company.baseCurrency.trim());
    const inline = !!text?.trim() || INLINE_PROVIDERS.has(provider.name);
    // A scan read by the provider comes from the monthly AI allowance; text the phone read is free.
    const giveBack = text?.trim() ? null : await takeAiAction(ctx, 'ocr');

    const started = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(X)
        .values({ id: newId('ocr'), companyId: ctx.company.id, attachmentId, kind, status: inline ? 'processing' : 'queued', provider: provider.name, createdBy: ctx.user.id, createdAt: ctx.now })
        .returning();
      if (!inline) await enqueue(tx, 'ocr.extract', { extractionId: row.id }, { maxAttempts: 3 });
      return row;
    });
    if (!inline) return toWire(ctx.db, started, digits);

    try {
      const row = await runExtraction(ctx.deps, started.id, text);
      return toWire(ctx.db, row ?? started, digits);
    } catch (err) {
      // No recognition on this server: nothing was extracted, so leave no row behind.
      await ctx.db.delete(X).where(eq(X.id, started.id));
      await giveBack?.();
      throw err;
    }
  },

  async getOcrExtraction(ctx) {
    const row = await findExtraction(ctx.db, ctx.company.id, ctx.params.id);
    return toWire(ctx.db, row, await minorDigits(ctx.db, ctx.company.baseCurrency.trim()));
  },
});
