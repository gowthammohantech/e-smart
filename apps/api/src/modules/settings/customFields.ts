import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { checkCustomValues, type CustomField, type CustomFieldEntity, type CustomValues } from '@esmart/core/domain/customFields';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { invalid, notFound, preconditionFailed, unprocessable } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, versioned } from '../../lib/wire';
import { audit } from './shared';

const F = schema.customFields;
type FieldRow = typeof F.$inferSelect;
/** No record type needs more than this many of its own fields. */
const MAX_PER_ENTITY = 30;

export function customFieldToWire(row: FieldRow): Schema<'CustomField'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    entity: row.entity,
    label: row.label,
    kind: row.kind,
    options: row.options as string[],
    required: row.required,
    showOnPdf: row.showOnPdf,
    position: row.position,
    status: row.status,
    ...versioned(row),
  });
}

/** The company's fields as core reads them. */
export async function loadCustomFields(db: DbOrTx, companyId: string, entity?: CustomFieldEntity): Promise<CustomField[]> {
  const rows = await db.select().from(F).where(and(eq(F.companyId, companyId), entity ? eq(F.entity, entity) : undefined));
  return rows.map((r) => ({ id: r.id, entity: r.entity, label: r.label, kind: r.kind, options: r.options as string[], required: r.required, showOnPdf: r.showOnPdf, position: r.position, status: r.status }));
}

/**
 * The custom values a record may keep, checked against the company's fields (422 on the first
 * record field that is wrong, as `customFields.<fieldId>`). Left out on a save, the record keeps what it had.
 */
export async function cleanCustomValues(db: DbOrTx, companyId: string, entity: CustomFieldEntity, values: CustomValues | undefined, current?: unknown): Promise<CustomValues> {
  // A save that leaves them out keeps the record's; a new record that leaves them out has none (so required ones are missing).
  if (values === undefined && current !== undefined) return current as CustomValues;
  const fields = await loadCustomFields(db, companyId, entity);
  if (!fields.length) return {};
  const { values: clean, problems } = checkCustomValues(fields, entity, values ?? {});
  if (problems.length) throw unprocessable(problems.map((p) => ({ field: `customFields.${p.fieldId}`, message: p.message, severity: 'blocking' as const })));
  return clean;
}

function columns(body: Schema<'CustomField'>) {
  const label = body.label.trim();
  if (!label) throw invalid('label', 'Give the field a name');
  const options = body.kind === 'select' ? [...new Set((body.options ?? []).map((o) => o.trim()).filter(Boolean))] : [];
  if (body.kind === 'select' && options.length < 2) throw invalid('options', 'A list needs at least two choices');
  if (options.some((o) => o.length > 60)) throw invalid('options', 'Each choice is at most 60 characters');
  return { label, options, required: body.required ?? false, showOnPdf: body.showOnPdf ?? false, position: body.position ?? 0, status: body.status ?? ('active' as const) };
}

async function assertLabelFree(db: DbOrTx, companyId: string, entity: CustomFieldEntity, label: string, exceptId?: string) {
  const [dupe] = await db
    .select({ id: F.id })
    .from(F)
    .where(and(eq(F.companyId, companyId), eq(F.entity, entity), sql`lower(${F.label}) = lower(${label})`, exceptId ? ne(F.id, exceptId) : undefined));
  if (dupe) throw invalid('label', `There is already a field called ${label}`, 'CUSTOM_FIELD_EXISTS');
}

/** The table that holds the values of an entity's fields. */
const VALUES_TABLE: Record<CustomFieldEntity, string> = { party: 'parties', item: 'items', document: 'documents' };

async function find(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(F).where(and(eq(F.companyId, companyId), eq(F.id, id)));
  if (!row) throw notFound('Custom field');
  return row;
}

/** Custom fields: listCustomFields, createCustomField, saveCustomField, removeCustomField. */
export const customFieldHandlers = defineHandlers({
  async listCustomFields(ctx) {
    const rows = await ctx.db.select().from(F).where(eq(F.companyId, ctx.company.id)).orderBy(asc(F.entity), asc(F.position), asc(F.label));
    return { data: rows.map(customFieldToWire) };
  },

  async createCustomField(ctx) {
    const cols = columns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertLabelFree(tx, ctx.company.id, ctx.body.entity, cols.label);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(F).where(and(eq(F.companyId, ctx.company.id), eq(F.entity, ctx.body.entity)));
      if (n >= MAX_PER_ENTITY) throw invalid('entity', `Up to ${MAX_PER_ENTITY} fields for each kind of record`);
      const [created] = await tx.insert(F).values({ id: newId('cfd'), companyId: ctx.company.id, entity: ctx.body.entity, kind: ctx.body.kind, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'custom_field', 'created', created, created.label, { after: customFieldToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return customFieldToWire(row);
  },

  async saveCustomField(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    if (ctx.body.entity !== current.entity || ctx.body.kind !== current.kind) throw invalid('kind', 'A field keeps its record type and kind; add another field instead');
    const cols = columns(ctx.body);
    // A choice can go only if no record holds it.
    const dropped = (current.options as string[]).filter((o) => !cols.options.includes(o));
    for (const o of dropped) {
      const res = await ctx.db.execute(sql`select 1 from ${sql.identifier(VALUES_TABLE[current.entity])} where company_id = ${ctx.company.id} and custom_fields ->> ${current.id} = ${o} limit 1`);
      if (res.rows.length) throw invalid('options', `Records hold "${o}"; change them first, or keep the choice`, 'CUSTOM_FIELD_OPTION_IN_USE');
    }
    const row = await ctx.db.transaction(async (tx) => {
      await assertLabelFree(tx, ctx.company.id, current.entity, cols.label, current.id);
      const [updated] = await tx.update(F).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(F.id, current.id), eq(F.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'custom_field', 'updated', updated, updated.label, { before: customFieldToWire(current), after: customFieldToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return customFieldToWire(row);
  },

  async removeCustomField(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(F).where(eq(F.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'custom_field', 'deleted', current, current.label, { before: customFieldToWire(current) });
    });
    return undefined;
  },
});
