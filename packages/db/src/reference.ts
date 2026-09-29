import { sql } from 'drizzle-orm';
import { allCities } from '@esmart/core/data/cities';
import { COUNTRIES, INTEGRATIONS, UNITS, WORLD_COUNTRIES } from '@esmart/core/data/masters';
import { GST_STATE_CODES } from '@esmart/core/domain/stateCodes';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { MODULES, PLANS, moduleSetFor } from '@esmart/core/domain/plan';
import type { Db } from './index';
import * as s from './schema';

/** Union territories among the GST state codes. */
const UNION_TERRITORIES = new Set(['01', '04', '07', '26', '31', '34', '35', '38', '97']);

/**
 * A starter HSN / SAC master: the codes the demo catalogue uses plus common
 * ones. Production loads the full CBIC list into the same table; a code a
 * user types that isn't here yet is added by the catalog on first use.
 */
export const HSN_STARTER: { code: string; description: string; isService: boolean; rate: number }[] = [
  { code: '15152900', description: 'Rice bran oil and its fractions', isService: false, rate: 5 },
  { code: '22011010', description: 'Mineral waters and aerated waters', isService: false, rate: 18 },
  { code: '27101980', description: 'Lubricating oils and greases', isService: false, rate: 18 },
  { code: '39172390', description: 'Tubes, pipes and hoses of PVC', isService: false, rate: 18 },
  { code: '39191000', description: 'Self-adhesive plastic tape in rolls', isService: false, rate: 18 },
  { code: '39201019', description: 'Plastic film and sheet of polyethylene', isService: false, rate: 18 },
  { code: '39211900', description: 'Cellular plastic plates and sheets', isService: false, rate: 18 },
  { code: '39231010', description: 'Plastic boxes, cases and ties for packing', isService: false, rate: 18 },
  { code: '40103999', description: 'Transmission belts of vulcanised rubber', isService: false, rate: 18 },
  { code: '48025690', description: 'Uncoated paper for writing and printing', isService: false, rate: 12 },
  { code: '48191010', description: 'Cartons and boxes of corrugated paper', isService: false, rate: 12 },
  { code: '61161010', description: 'Gloves, impregnated or coated', isService: false, rate: 5 },
  { code: '73181500', description: 'Screws and bolts of iron or steel', isService: false, rate: 18 },
  { code: '73182200', description: 'Washers of iron or steel', isService: false, rate: 18 },
  { code: '82060010', description: 'Sets of hand tools for retail sale', isService: false, rate: 18 },
  { code: '84821011', description: 'Ball bearings', isService: false, rate: 18 },
  { code: '85362010', description: 'Miniature circuit breakers', isService: false, rate: 18 },
  { code: '85389000', description: 'Parts for electrical switching apparatus', isService: false, rate: 18 },
  { code: '85444911', description: 'Insulated copper conductors', isService: false, rate: 18 },
  { code: '90049090', description: 'Protective goggles and spectacles', isService: false, rate: 5 },
  { code: '90178010', description: 'Measuring rods and tapes', isService: false, rate: 18 },
  { code: '90303100', description: 'Multimeters without recording device', isService: false, rate: 18 },
  { code: '94054090', description: 'Electric lamps and lighting fittings', isService: false, rate: 12 },
  { code: '995461', description: 'Installation services', isService: true, rate: 18 },
  { code: '996511', description: 'Road transport services of goods', isService: true, rate: 5 },
  { code: '998346', description: 'Technical testing and analysis services', isService: true, rate: 18 },
  { code: '998391', description: 'Specialty design services', isService: true, rate: 18 },
  { code: '998719', description: 'Maintenance and repair of other goods', isService: true, rate: 18 },
  { code: '998311', description: 'Management consulting services', isService: true, rate: 18 },
  { code: '997212', description: 'Rental or leasing of non-residential property', isService: true, rate: 18 },
  { code: '998313', description: 'Information technology consulting', isService: true, rate: 18 },
  { code: '30049099', description: 'Medicaments in measured doses', isService: false, rate: 12 },
  { code: '10063020', description: 'Rice, semi-milled or wholly milled', isService: false, rate: 5 },
  { code: '84713010', description: 'Portable computers (laptops)', isService: false, rate: 18 },
  { code: '85171300', description: 'Smartphones', isService: false, rate: 18 },
];

/**
 * Loads the reference tables every environment needs: countries, currencies,
 * states, cities, units, the starter HSN list, plans and integrations. Safe to
 * run again; each row is upserted by its key.
 */
export async function seedReference(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const currencyCodes = new Map(CURRENCIES.map((c) => [c.code, c]));
    for (const c of WORLD_COUNTRIES) if (!currencyCodes.has(c.currency)) currencyCodes.set(c.currency, { code: c.currency, name: c.currency, symbol: c.currency, precision: 2, grouping: 'western' });
    await tx
      .insert(s.currencies)
      .values([...currencyCodes.values()].map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, minorDigits: c.precision })))
      .onConflictDoUpdate({ target: s.currencies.code, set: { name: sql`excluded.name`, symbol: sql`excluded.symbol`, minorDigits: sql`excluded.minor_digits` } });

    const regimes = new Map(COUNTRIES.map((c) => [c.code, c]));
    await tx
      .insert(s.countries)
      .values(
        WORLD_COUNTRIES.map((c) => {
          const r = regimes.get(c.code);
          return {
            code: c.code,
            name: c.name,
            currency: c.currency,
            taxRegime: r?.regime ?? ('NONE' as const),
            taxIdLabel: r?.taxIdLabel ?? 'Tax ID',
            fiscalYearStartMonth: r?.fiscalYearStartMonth ?? 1,
          };
        }),
      )
      .onConflictDoUpdate({
        target: s.countries.code,
        set: { name: sql`excluded.name`, currency: sql`excluded.currency`, taxRegime: sql`excluded.tax_regime`, taxIdLabel: sql`excluded.tax_id_label`, fiscalYearStartMonth: sql`excluded.fiscal_year_start_month` },
      });

    await tx
      .insert(s.states)
      .values(GST_STATE_CODES.map((st) => ({ countryCode: 'IN', code: st.code, name: st.name, isUnionTerritory: UNION_TERRITORIES.has(st.code) })))
      .onConflictDoUpdate({ target: [s.states.countryCode, s.states.code], set: { name: sql`excluded.name`, isUnionTerritory: sql`excluded.is_union_territory` } });

    // Cities have a serial key, so reload them wholesale.
    await tx.delete(s.cities);
    await tx.insert(s.cities).values(allCities().map((c) => ({ countryCode: 'IN', stateCode: c.stateCode, name: c.name })));

    await tx
      .insert(s.units)
      .values(UNITS.map((u) => ({ code: u.code, name: u.name, decimals: u.decimals })))
      .onConflictDoUpdate({ target: s.units.code, set: { name: sql`excluded.name`, decimals: sql`excluded.decimals` } });

    await tx
      .insert(s.hsnCodes)
      .values(HSN_STARTER.map((h) => ({ code: h.code, description: h.description, isService: h.isService, defaultGstRate: String(h.rate) })))
      .onConflictDoNothing();

    await tx
      .insert(s.plans)
      .values(
        PLANS.map((p, i) => ({
          key: p.key,
          name: p.name,
          monthlyPriceMinor: p.monthly * 100,
          yearlyPriceMinor: p.yearly * 100,
          currency: 'INR',
          features: p.features,
          popular: p.popular ?? false,
          sortOrder: i,
        })),
      )
      .onConflictDoUpdate({
        target: s.plans.key,
        set: { name: sql`excluded.name`, monthlyPriceMinor: sql`excluded.monthly_price_minor`, yearlyPriceMinor: sql`excluded.yearly_price_minor`, features: sql`excluded.features`, popular: sql`excluded.popular`, sortOrder: sql`excluded.sort_order` },
      });
    await tx
      .insert(s.planModules)
      .values(PLANS.filter((p) => moduleSetFor(p.key) === 'full').flatMap((p) => MODULES.map((module) => ({ plan: p.key, module }))))
      .onConflictDoNothing();

    await tx
      .insert(s.integrations)
      .values(
        INTEGRATIONS.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          icon: i.icon,
          category: i.category,
          configRoute: i.configRoute ?? null,
          // Backup to Drive is a Business-plan feature; the rest are on every plan.
          minPlan: i.id === 'int_drive' ? ('business' as const) : ('free' as const),
        })),
      )
      .onConflictDoUpdate({
        target: s.integrations.id,
        set: { name: sql`excluded.name`, description: sql`excluded.description`, icon: sql`excluded.icon`, category: sql`excluded.category`, configRoute: sql`excluded.config_route`, minPlan: sql`excluded.min_plan` },
      });
  });
}
