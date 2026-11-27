import { normalizeGstin } from '@esmart/core/domain/gstin';
import { errorMessage } from './api';
import { ENTITIES, norm, tally, type Entity, type Env, type Parsed, type SendResult } from './entities';
import { partyKey } from './lookups';
import type { Business, PlanResult, SheetPlan } from '../types';

export type Active = { plan: SheetPlan; parsed: Parsed; entity: Entity };

/**
 * Sends a sheet's records. A sheet the business can't use (its plan lacks the feature) or that the
 * server refuses as a whole has every row rejected with the reason, so the other sheets carry on.
 */
export async function sendSheet(entity: Entity, values: unknown[], dryRun: boolean, env: Env): Promise<SendResult> {
  try {
    return await entity.send(values, dryRun, env);
  } catch (err) {
    const message = errorMessage(err);
    return tally(values.map((_, index) => ({ index, status: 'invalid' as const, message })));
  }
}

/** Each sheet read as the kind of data it was said to hold, in the order they must be imported (null for a skipped sheet). */
export function parsePlans(plans: SheetPlan[], business: Pick<Business, 'ctx'>): (Parsed | null)[] {
  return plans.map((p) => ENTITIES.find((e) => e.id === p.entity)?.parse(p.sheet.rows, p.mapping, business.ctx, p.options) ?? null);
}

/** The sheets that are read as something, in import order: contacts and items first, then what refers to them. */
export function activeOf(plans: SheetPlan[], parsed: (Parsed | null)[]): Active[] {
  return plans
    .map((plan, i) => ({ plan, parsed: parsed[i], entity: ENTITIES.find((e) => e.id === plan.entity) }))
    .filter((a): a is Active => !!a.parsed && !!a.entity)
    .sort((a, b) => ENTITIES.indexOf(a.entity) - ENTITIES.indexOf(b.entity));
}

/** The names a contact or an item record adds, which later sheets in the same file may refer to. */
export function addedBy(entityId: string, value: unknown): { set: 'parties' | 'items'; keys: string[] } | undefined {
  if (entityId === 'contacts') {
    const p = value as { name: string; taxId?: string };
    return { set: 'parties', keys: [partyKey(p.name), ...(p.taxId ? [normalizeGstin(p.taxId)] : [])] };
  }
  if (entityId === 'items') {
    const i = value as { name: string; sku?: string };
    return { set: 'items', keys: [norm(i.name), ...(i.sku ? [norm(i.sku)] : [])] };
  }
  return undefined;
}

/** Everything the file's contacts and items would add. */
export function expectedNames(active: Active[]) {
  const sets = { parties: new Set<string>(), items: new Set<string>() };
  for (const a of active) {
    for (const r of a.parsed.records) {
      const added = addedBy(a.entity.id, r.value);
      if (added) for (const k of added.keys) sets[added.set].add(k);
    }
  }
  return sets;
}

/**
 * The check (`dryRun`, nothing saved) or the import, sheet by sheet in order. A contact or item that is
 * refused is not counted on by the sheets after it, and the reason is kept so they can say why.
 */
export async function runPlans(args: { business: Business; active: Active[]; dryRun: boolean; onStep?: (message: string) => void }): Promise<{ results: PlanResult[]; answers: Record<string, SendResult> }> {
  const { business, active, dryRun, onStep } = args;
  const sendable = active.filter((a) => a.parsed.records.length > 0);
  const expected = expectedNames(active);
  const rejected = { parties: new Map<string, string>() };
  const results: PlanResult[] = [];
  const answers: Record<string, SendResult> = {};
  for (const a of sendable) {
    onStep?.(`${dryRun ? 'Checking' : 'Importing'} ${a.entity.title.toLowerCase()} (${a.parsed.records.length})…`);
    const env: Env = { companyId: business.id, ctx: business.ctx, pending: expected, rejected, options: a.plan.options };
    const sent = await sendSheet(a.entity, a.parsed.records.map((r) => r.value), dryRun, env);
    for (const r of sent.results) {
      if (r.status !== 'invalid') continue;
      const added = addedBy(a.entity.id, a.parsed.records[r.index]?.value);
      if (!added) continue;
      for (const k of added.keys) {
        if (dryRun) expected[added.set].delete(k);
        if (added.set === 'parties') rejected.parties.set(k, r.message ?? 'it was refused');
      }
    }
    answers[a.plan.id] = sent;
    results.push({ plan: a.plan, parsed: a.parsed, sent });
  }
  return { results, answers };
}
