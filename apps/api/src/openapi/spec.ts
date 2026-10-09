import { dereference } from '@apidevtools/json-schema-ref-parser';
import { loadSpec } from '@esmart/api-contract/spec';
import type { OperationId } from '@esmart/api-contract';
import type { Module } from '@esmart/core/domain/plan';

export type Role = 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';
export type PlatformRole = 'superadmin' | 'support';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type JsonSchema = Record<string, unknown>;

/** One operation from the contract, with what the router and guards need. */
export type Operation = {
  id: OperationId | 'razorpayWebhook' | 'whatsappWebhook';
  method: HttpMethod;
  /** The OpenAPI path, e.g. `/companies/{companyId}/parties`. */
  path: string;
  /** The Fastify path, e.g. `/companies/:companyId/parties`. */
  url: string;
  tag: string;
  /** Roles allowed to call it; null means every signed-in role. */
  roles: Role[] | null;
  /** Set on `/admin/*`: the platform roles allowed. Tenant roles never apply. */
  platformRoles: PlatformRole[] | null;
  planModule: Module | null;
  /** False for `security: []` operations (auth, plans, most reference data). */
  secured: boolean;
  successStatus: number;
  /** Array query params sent comma-separated (`style: form, explode: false`). */
  commaArrays: string[];
  requestContentType: string | null;
  schema: {
    params?: JsonSchema;
    querystring?: JsonSchema;
    body?: JsonSchema;
  };
  /** Response schemas by status and content type, for contract tests. */
  responses: Record<string, Record<string, JsonSchema | undefined>>;
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * OpenAPI marks server-owned fields `readOnly` and still lists some as
 * `required`: they are required in responses only. Drop them from request
 * schemas (and `writeOnly` from response schemas) so validation follows the
 * spec's intent rather than rejecting a client that leaves `id` out.
 */
function stripDirectional(schema: unknown, drop: 'readOnly' | 'writeOnly', seen = new Map<unknown, unknown>()): unknown {
  if (Array.isArray(schema)) return schema.map((s) => stripDirectional(s, drop, seen));
  if (!schema || typeof schema !== 'object') return schema;
  if (seen.has(schema)) return seen.get(schema);
  const out: Record<string, unknown> = {};
  seen.set(schema, out);
  for (const [k, v] of Object.entries(schema)) out[k] = stripDirectional(v, drop, seen);
  const props = out.properties as Record<string, Record<string, unknown>> | undefined;
  if (props) {
    const dropped = Object.keys(props).filter((k) => props[k]?.[drop] === true);
    if (Array.isArray(out.required)) out.required = (out.required as string[]).filter((r) => !dropped.includes(r));
    if (drop === 'readOnly') for (const k of dropped) delete props[k];
  }
  // Keywords Ajv doesn't know and strict mode would complain about.
  delete out.example;
  delete out.discriminator;
  delete out.xml;
  delete out.externalDocs;
  return out;
}

function objectOf(params: Record<string, unknown>[], location: string): JsonSchema | undefined {
  const list = params.filter((p) => p.in === location);
  if (!list.length) return undefined;
  return {
    type: 'object',
    properties: Object.fromEntries(list.map((p) => [p.name, stripDirectional(p.schema ?? {}, 'readOnly')])),
    required: list.filter((p) => p.required).map((p) => p.name as string),
  };
}

let cached: Promise<{ spec: Record<string, unknown>; operations: Operation[] }> | null = null;

/** The dereferenced contract and its operations. Loaded once per process. */
export function loadOperations() {
  cached ??= (async () => {
    const spec = (await dereference(loadSpec(), { dereference: { circular: 'ignore' } })) as Record<string, any>;
    const operations: Operation[] = [];

    const add = (path: string, item: Record<string, any>, isWebhook: boolean) => {
      for (const m of METHODS) {
        const op = item[m];
        if (!op) continue;
        const params: Record<string, unknown>[] = [...(item.parameters ?? []), ...(op.parameters ?? [])];
        const content: Record<string, { schema?: JsonSchema }> = op.requestBody?.content ?? {};
        const requestContentType = Object.keys(content)[0] ?? null;
        const successStatus = Number(Object.keys(op.responses).find((c) => /^2\d\d$/.test(c)) ?? 200);
        const responses: Operation['responses'] = {};
        for (const [code, res] of Object.entries<Record<string, any>>(op.responses)) {
          responses[code] = {};
          for (const [type, media] of Object.entries<Record<string, any>>(res.content ?? {})) {
            responses[code][type] = media.schema ? (stripDirectional(media.schema, 'writeOnly') as JsonSchema) : undefined;
          }
        }
        operations.push({
          id: op.operationId,
          method: m.toUpperCase() as HttpMethod,
          path,
          url: path.replace(/\{([^}]+)\}/g, ':$1'),
          tag: op.tags?.[0] ?? (isWebhook ? 'Webhooks' : 'Other'),
          roles: op['x-roles'] ?? null,
          platformRoles: op['x-platform-roles'] ?? null,
          planModule: op['x-plan-module'] ?? null,
          secured: isWebhook ? false : !(Array.isArray(op.security) && op.security.length === 0),
          successStatus,
          commaArrays: params
            .filter((p) => p.in === 'query' && p.explode === false && (p.schema as { type?: string } | undefined)?.type === 'array')
            .map((p) => p.name as string),
          requestContentType,
          schema: {
            params: objectOf(params, 'path'),
            querystring: objectOf(params, 'query'),
            body:
              requestContentType === 'application/json' && content[requestContentType]?.schema && !isWebhook
                ? (stripDirectional(content[requestContentType].schema, 'readOnly') as JsonSchema)
                : undefined,
          },
          responses,
        });
      }
    };

    for (const [path, item] of Object.entries<Record<string, any>>(spec.paths)) add(path, item, false);
    // Inbound webhooks are documented under `webhooks`; they are served at
    // /webhooks/<source> (see the README's endpoint list).
    const webhookPaths: Record<string, string> = { razorpayEvent: '/webhooks/razorpay', whatsappStatus: '/webhooks/whatsapp' };
    for (const [name, item] of Object.entries<Record<string, any>>(spec.webhooks ?? {})) {
      add(webhookPaths[name] ?? `/webhooks/${name}`, item, true);
    }
    return { spec, operations };
  })();
  return cached;
}
