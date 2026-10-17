import type { FastifyInstance } from 'fastify';
import { injectAs } from '../../lib/internal';

/**
 * How /sync/pull fetches an entity's normal API representation: through the
 * entity's own GET route, so `data` is always exactly what that GET returns.
 * Keys are the `entityType` strings `recordChange` callers use.
 *
 * - `one`: a GET for a single resource.
 * - `list`: no single GET in the contract; the list is fetched once per pull
 *   and the entity picked out by id.
 * - `singleton`: one per company (the entity id is the company id).
 */
type Source =
  | { kind: 'one'; path: (companyId: string, id: string) => string }
  | { kind: 'list'; path: (companyId: string) => string; key: string }
  | { kind: 'singleton'; path: (companyId: string) => string };

const c = (companyId: string) => `/v1/companies/${encodeURIComponent(companyId)}`;
const one = (suffix: string): Source => ({ kind: 'one', path: (companyId, id) => `${c(companyId)}/${suffix}/${encodeURIComponent(id)}` });
const list = (suffix: string): Source => ({ kind: 'list', path: (companyId) => `${c(companyId)}/${suffix}`, key: suffix });
const singleton = (suffix: string): Source => ({ kind: 'singleton', path: (companyId) => `${c(companyId)}/${suffix}` });

export const ENTITY_SOURCES: Record<string, Source> = {
  company: { kind: 'one', path: (_companyId, id) => `/v1/companies/${encodeURIComponent(id)}` },
  party: one('parties'),
  item: one('items'),
  document: one('documents'),
  payment: one('payments'),
  expense: one('expenses'),
  eway_bill: one('eway-bills'),
  attachment: one('attachments'),
  ocr_extraction: one('ocr/extractions'),
  export_job: one('exports'),
  branch: list('branches'),
  tax_category: list('tax-categories'),
  expense_category: list('expense-categories'),
  payment_account: list('payment-accounts'),
  exchange_rate: list('exchange-rates'),
  transporter: list('transporters'),
  numbering_series: list('numbering-series'),
  integration: list('integrations'),
  user: { kind: 'list', path: () => '/v1/users', key: 'users' },
  compliance_settings: singleton('compliance-settings'),
  backup_settings: singleton('backup-settings'),
  subscription: singleton('subscription'),
};

type Want = { companyId: string; entityType: string; entityId: string };

/** Runs `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Fetches the current representation of each wanted entity. Anything the
 * caller can't read (deleted since, gated by plan or role) or whose type is
 * unknown is simply absent from the result.
 */
export async function fetchEntities(server: FastifyInstance, authorization: string | undefined, wants: Want[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  const keyOf = (w: { companyId: string; entityType: string; entityId: string }) => `${w.companyId}:${w.entityType}:${w.entityId}`;
  const lists = new Map<string, Promise<Map<string, unknown>>>();

  const loadList = (url: string) => {
    let p = lists.get(url);
    if (!p) {
      p = (async () => {
        const byId = new Map<string, unknown>();
        let cursor: string | null = null;
        for (let page = 0; page < 50; page++) {
          const res = await injectAs(server, authorization, { method: 'GET', url: cursor ? `${url}?cursor=${encodeURIComponent(cursor)}` : url });
          if (res.status !== 200) break;
          const body = res.body as { data?: { id?: string }[]; nextCursor?: string | null };
          for (const e of body.data ?? []) if (e?.id) byId.set(e.id, e);
          cursor = body.nextCursor ?? null;
          if (!cursor) break;
        }
        return byId;
      })();
      lists.set(url, p);
    }
    return p;
  };

  await pool(wants, 10, async (w) => {
    const source = ENTITY_SOURCES[w.entityType];
    if (!source) return;
    if (source.kind === 'list') {
      const found = (await loadList(source.path(w.companyId))).get(w.entityId);
      if (found !== undefined) out.set(keyOf(w), found);
      return;
    }
    const url = source.kind === 'one' ? source.path(w.companyId, w.entityId) : source.path(w.companyId);
    const res = await injectAs(server, authorization, { method: 'GET', url });
    if (res.status === 200 && res.body && typeof res.body === 'object') out.set(keyOf(w), res.body);
  });
  return out;
}
