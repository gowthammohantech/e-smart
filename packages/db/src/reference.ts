import { readFileSync } from 'node:fs';
import { notInArray, sql } from 'drizzle-orm';
import { allCities } from '@esmart/core/data/cities';
import { COUNTRIES, INTEGRATIONS, UNITS, WORLD_COUNTRIES } from '@esmart/core/data/masters';
import { GST_STATE_CODES } from '@esmart/core/domain/stateCodes';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { GATED_MODULES, PLANS, moduleSetFor } from '@esmart/core/domain/plan';
import type { Db } from './index';
import * as s from './schema';

/** Union territories among the GST state codes. */
const UNION_TERRITORIES = new Set(['01', '04', '07', '26', '31', '34', '35', '38', '97']);

/**
 * The HSN / SAC master: every code a business searches (Find HSN / SAC code), from the GST HSN and
 * SAC lists (src/data/hsn_sac.json, built from the HSN_SAC workbook: 4, 6 and 8 digit codes, chapters
 * left out). Each entry is [code, description, isService]. No default rates: the list carries none.
 */
export function hsnMaster(): { code: string; description: string; isService: boolean }[] {
  const rows = JSON.parse(readFileSync(new URL('./data/hsn_sac.json', import.meta.url), 'utf8')) as [string, string, 0 | 1][];
  return rows.map(([code, description, isService]) => ({ code, description, isService: isService === 1 }));
}

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
      .values(UNITS.map((u) => ({ code: u.code, name: u.name, shortName: u.shortName ?? null, decimals: u.decimals })))
      .onConflictDoUpdate({
        target: s.units.code,
        set: { name: sql`excluded.name`, shortName: sql`excluded.short_name`, decimals: sql`excluded.decimals` },
      });

    // The HSN / SAC search list is the master file, exactly: its codes added or updated, and any
    // other code (an older starter list's, or one typed on an item before 0079) taken out. Items keep
    // their own codes whatever is here.
    const hsn = hsnMaster();
    for (let i = 0; i < hsn.length; i += 1000) {
      await tx
        .insert(s.hsnCodes)
        .values(hsn.slice(i, i + 1000).map((h) => ({ code: h.code, description: h.description, isService: h.isService, defaultGstRate: null })))
        .onConflictDoUpdate({ target: s.hsnCodes.code, set: { description: sql`excluded.description`, isService: sql`excluded.is_service`, defaultGstRate: null } });
    }
    await tx.delete(s.hsnCodes).where(notInArray(s.hsnCodes.code, hsn.map((h) => h.code)));

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
      .values(PLANS.filter((p) => moduleSetFor(p.key) === 'full').flatMap((p) => GATED_MODULES.map((module) => ({ plan: p.key, module }))))
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
