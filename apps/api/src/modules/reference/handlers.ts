import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { PINCODE_RE } from '@esmart/core/domain/ewayBill';
import { isValidGstin, normalizeGstin } from '@esmart/core/domain/gstin';
import { stateNameOf } from '@esmart/core/domain/stateCodes';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { invalid, notFound, unprocessable } from '../../http/errors';
import type { GstinRecord } from '../../providers/gstin';
import { compact } from '../../lib/wire';

/** How long a GST portal answer is trusted before asking again. */
const GSTIN_CACHE_MS = 7 * 24 * 3_600_000;
const SEARCH_LIMIT = 50;

type GstinLookup = typeof schema.gstinLookups.$inferSelect;

/**
 * The table has no registration-date column, so the cache keeps it inside
 * the `address` JSON next to the address fields and splits it out here.
 */
type CachedAddress = Partial<Schema<'Address'>> & { registeredOn?: string };

function gstinToWire(row: GstinLookup) {
  const { registeredOn, ...address } = (row.address ?? {}) as CachedAddress;
  return compact({
    gstin: row.gstin,
    legalName: row.legalName,
    tradeName: row.tradeName,
    status: row.status as GstinRecord['status'] | null,
    registrationType: row.registrationType,
    address: address.line1 ? (address as Schema<'Address'>) : undefined,
    registeredOn,
  });
}

/**
 * Reference data: countries, states, cities, PIN codes, currencies and HSN
 * come from the reference tables; GSTINs and road distances from the GSTIN
 * provider (a GSP in production, the simulator otherwise).
 */
export const referenceHandlers = defineHandlers({
  async listCountries(ctx) {
    const rows = await ctx.db.select().from(schema.countries).orderBy(asc(schema.countries.name));
    return { data: rows.map((r) => ({ code: r.code.trim(), name: r.name, currency: r.currency.trim(), taxRegime: r.taxRegime, taxIdLabel: r.taxIdLabel })) };
  },

  async listStates(ctx) {
    const S = schema.states;
    const rows = await ctx.db.select().from(S).where(eq(S.countryCode, ctx.query.country.toUpperCase())).orderBy(asc(S.name));
    return { data: rows.map((r) => ({ code: r.code, name: r.name })) };
  },

  /** `state` is a GST state code or a state name; `q` matches the start of the city name first. */
  async searchCities(ctx) {
    const C = schema.cities;
    const S = schema.states;
    const country = (ctx.query.country ?? 'IN').toUpperCase();
    const filters = [eq(C.countryCode, country)];
    if (ctx.query.state) filters.push(or(eq(C.stateCode, ctx.query.state), ilike(S.name, ctx.query.state))!);
    const q = ctx.query.q?.trim();
    if (q) filters.push(ilike(C.name, `%${q}%`));
    const rows = await ctx.db
      .select({ name: C.name, stateCode: C.stateCode, state: S.name })
      .from(C)
      .leftJoin(S, and(eq(S.countryCode, C.countryCode), eq(S.code, C.stateCode)))
      .where(and(...filters))
      .orderBy(q ? sql`case when ${C.name} ilike ${`${q}%`} then 0 else 1 end` : asc(C.name), asc(C.name))
      .limit(SEARCH_LIMIT);
    return { data: rows.map((r) => ({ name: r.name, state: r.state ?? stateNameOf(r.stateCode), stateCode: r.stateCode })) };
  },

  /** The India Post directory first, then whatever the provider knows. */
  async lookupPincode(ctx) {
    const pincode = ctx.params.pincode;
    const [row] = await ctx.db.select().from(schema.pincodes).where(eq(schema.pincodes.pincode, pincode));
    const hit = row ? { city: row.city, stateCode: row.stateCode } : await ctx.deps.providers.gstin.pincode(pincode);
    if (!hit) throw notFound('PIN code');
    const [state] = await ctx.db
      .select({ name: schema.states.name })
      .from(schema.states)
      .where(and(eq(schema.states.countryCode, 'IN'), eq(schema.states.code, hit.stateCode)));
    return { pincode, city: hit.city, state: state?.name ?? stateNameOf(hit.stateCode), stateCode: hit.stateCode };
  },

  async getRoadDistance(ctx) {
    const { fromPincode, toPincode } = ctx.query;
    for (const [field, pin] of [['fromPincode', fromPincode], ['toPincode', toPincode]] as const) {
      if (!PINCODE_RE.test(pin)) throw invalid(field, 'A PIN code has six digits and does not start with 0');
    }
    return ctx.deps.providers.gstin.distance(fromPincode, toPincode);
  },

  async listCurrencies(ctx) {
    const rows = await ctx.db.select().from(schema.currencies).orderBy(asc(schema.currencies.code));
    return { data: rows.map((r) => ({ code: r.code.trim(), name: r.name, symbol: r.symbol, precision: r.minorDigits })) };
  },

  /** Digits search by code prefix; words search the description. */
  async searchHsn(ctx) {
    const H = schema.hsnCodes;
    const q = ctx.query.q.trim();
    if (!q) return { data: [] };
    const where = /^\d+$/.test(q) ? ilike(H.code, `${q}%`) : or(ilike(H.description, `%${q}%`), ilike(H.code, `${q}%`));
    const rows = await ctx.db.select().from(H).where(where).orderBy(asc(H.code)).limit(SEARCH_LIMIT);
    return {
      data: rows.map((r) =>
        compact({
          code: r.code,
          description: r.description,
          kind: r.isService || r.code.startsWith('99') ? ('SAC' as const) : ('HSN' as const),
          gstRate: r.defaultGstRate === null ? null : Number(r.defaultGstRate),
        }),
      ),
    };
  },

  /**
   * Check digit first (422 without a portal call), then the week-old cache,
   * then the provider. A GSTIN the portal doesn't know is a 404, and isn't
   * cached, so a new registration shows up as soon as it exists.
   */
  async lookupGstin(ctx) {
    const gstin = normalizeGstin(ctx.params.gstin);
    if (!isValidGstin(gstin)) {
      throw unprocessable([{ field: 'gstin', message: 'This GSTIN is not valid (check digit mismatch)', severity: 'blocking' }], 'INVALID_GSTIN');
    }
    const G = schema.gstinLookups;
    const [cached] = await ctx.db.select().from(G).where(eq(G.gstin, gstin));
    if (cached && ctx.now.getTime() - cached.fetchedAt.getTime() < GSTIN_CACHE_MS) return gstinToWire(cached);

    const found = await ctx.deps.providers.gstin.lookup(gstin);
    if (!found) throw notFound('GSTIN');
    const values = {
      legalName: found.legalName.slice(0, 200),
      tradeName: found.tradeName?.slice(0, 200) ?? null,
      status: found.status,
      registrationType: found.registrationType,
      stateCode: gstin.slice(0, 2),
      address: { ...found.address, registeredOn: found.registeredOn } satisfies CachedAddress,
      fetchedAt: ctx.now,
    };
    const [row] = await ctx.db
      .insert(G)
      .values({ gstin, ...values })
      .onConflictDoUpdate({ target: G.gstin, set: values })
      .returning();
    return gstinToWire(row);
  },
});
