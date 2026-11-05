import { and, asc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, versioned } from '../../lib/wire';
import { audit, firstUse } from './shared';

const V = schema.vehicles;
type VehicleRow = typeof V.$inferSelect;

/** As on the registration certificate, without spaces or dashes: TN09AB1234. */
export const normalizeRegistration = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();
const REGISTRATION = /^[A-Z]{2}[0-9A-Z]{4,10}$/;

export function vehicleToWire(row: VehicleRow): Schema<'Vehicle'> {
  return compact({ id: row.id, companyId: row.companyId, registration: row.registration, name: row.name, status: row.status, ...versioned(row) });
}

/** A vehicle id on an expense or document must be this company's. */
export async function vehicleIssues(db: DbOrTx, companyId: string, id: string | null | undefined): Promise<Issue[]> {
  if (!id) return [];
  const [row] = await db.select({ id: V.id }).from(V).where(and(eq(V.companyId, companyId), eq(V.id, id)));
  return row ? [] : [{ field: 'vehicleId', message: 'No such vehicle in this company', severity: 'blocking' }];
}

async function find(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(V).where(and(eq(V.companyId, companyId), eq(V.id, id)));
  if (!row) throw notFound('Vehicle');
  return row;
}

async function columns(db: DbOrTx, companyId: string, body: Schema<'Vehicle'>, exceptId?: string) {
  const registration = normalizeRegistration(body.registration);
  if (!REGISTRATION.test(registration)) throw invalid('registration', 'A registration starts with the state code, like TN09AB1234');
  const [dupe] = await db.select({ id: V.id }).from(V).where(and(eq(V.companyId, companyId), eq(V.registration, registration), exceptId ? ne(V.id, exceptId) : undefined));
  if (dupe) throw invalid('registration', `${registration} is already on the list`, 'VEHICLE_EXISTS');
  return { registration, name: body.name?.trim() || null, status: body.status ?? ('active' as const) };
}

/** Vehicles: listVehicles, createVehicle, saveVehicle, removeVehicle, summarizeVehicles. */
export const vehicleHandlers = defineHandlers({
  async listVehicles(ctx) {
    const rows = await ctx.db.select().from(V).where(eq(V.companyId, ctx.company.id)).orderBy(asc(V.registration));
    return { data: rows.map(vehicleToWire) };
  },

  async createVehicle(ctx) {
    const cols = await columns(ctx.db, ctx.company.id, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(V).values({ id: newId('veh'), companyId: ctx.company.id, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'vehicle', 'created', created, created.registration, { after: vehicleToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return vehicleToWire(row);
  },

  async saveVehicle(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company.id, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(V).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(V.id, current.id), eq(V.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'vehicle', 'updated', updated, updated.registration, { before: vehicleToWire(current), after: vehicleToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return vehicleToWire(row);
  },

  async removeVehicle(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [
      ['expenses', sql`select 1 from expenses where vehicle_id = ${current.id} limit 1`],
      ['documents', sql`select 1 from documents where vehicle_id = ${current.id} limit 1`],
    ]);
    if (used) throw conflict('VEHICLE_IN_USE', `${current.registration} is on ${used}; mark it inactive instead`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(V).where(eq(V.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'vehicle', 'deleted', current, current.registration, { before: vehicleToWire(current) });
    });
    return undefined;
  },

  /** What each vehicle cost over a period (its expenses, in base currency), and how many documents it carried. */
  async summarizeVehicles(ctx) {
    const { from, to } = ctx.query;
    const E = schema.expenses;
    const D = schema.documents;
    const spent = await ctx.db
      .select({ vehicleId: E.vehicleId, total: sql<number>`coalesce(sum(round(${E.amountMinor} * ${E.exchangeRate})), 0)::bigint`, count: sql<number>`count(*)::int` })
      .from(E)
      .where(and(eq(E.companyId, ctx.company.id), isNotNull(E.vehicleId), from ? gte(E.date, from) : undefined, to ? lte(E.date, to) : undefined))
      .groupBy(E.vehicleId);
    const carried = await ctx.db
      .select({ vehicleId: D.vehicleId, count: sql<number>`count(*)::int` })
      .from(D)
      .where(and(eq(D.companyId, ctx.company.id), isNotNull(D.vehicleId), ne(D.status, 'draft'), from ? gte(D.date, from) : undefined, to ? lte(D.date, to) : undefined))
      .groupBy(D.vehicleId);
    const base = ctx.company.baseCurrency.trim();
    const rows = await ctx.db.select().from(V).where(eq(V.companyId, ctx.company.id)).orderBy(asc(V.registration));
    return {
      data: rows.map((v) => ({
        vehicleId: v.id,
        registration: v.registration,
        name: v.name ?? undefined,
        expenses: { minor: Number(spent.find((s) => s.vehicleId === v.id)?.total ?? 0), currency: base },
        expenseCount: spent.find((s) => s.vehicleId === v.id)?.count ?? 0,
        documentCount: carried.find((c) => c.vehicleId === v.id)?.count ?? 0,
      })),
    };
  },
});
