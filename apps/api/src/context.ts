import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { OperationId, operations } from '@esmart/api-contract';
import type { Db, schema } from '@esmart/db';
import type { Config } from './config';
import type { Providers } from './providers';
import type { Operation, PlatformRole, Role } from './openapi/spec';

export type Deps = {
  db: Db;
  pool: pg.Pool;
  config: Config;
  providers: Providers;
  /** The time, injectable so tests can pin it. */
  now: () => Date;
};

/** The signed-in caller, loaded fresh on every request. */
export type AuthUser = {
  id: string;
  accountId: string;
  name: string;
  email: string;
  role: Role;
  /** Platform operator access (`/admin/*`); null for tenant users. */
  platformRole: PlatformRole | null;
  status: 'active' | 'invited' | 'disabled';
  locale: string | null;
  /** Companies the user may open. */
  companyIds: string[];
  /** Branches the user is limited to; empty means every branch. */
  branchIds: string[];
  sessionId: string;
};

export type CompanyRow = typeof schema.companies.$inferSelect;

// ------------------------------------------------------------ contract types

type Op<K extends OperationId> = operations[K];
type Params<K extends OperationId> = Op<K>['parameters'];

export type PathParams<K extends OperationId> = Params<K> extends { path: infer P } ? P : Record<string, never>;
export type QueryParams<K extends OperationId> = Params<K> extends { query?: infer Q } ? NonNullable<Q> : Record<string, never>;
export type RequestBody<K extends OperationId> = Op<K> extends { requestBody?: { content: { 'application/json': infer B } } }
  ? B
  : Op<K> extends { requestBody: { content: { 'application/json': infer B } } }
    ? B
    : undefined;

type SuccessCode = 200 | 201 | 202 | 204;
type ResponseOf<R> = R extends { content: { 'application/json': infer J } } ? J : R extends { content: unknown } ? RawBody : undefined;
export type ResponseBody<K extends OperationId> = {
  [C in keyof Op<K>['responses'] & SuccessCode]: ResponseOf<Op<K>['responses'][C]>;
}[keyof Op<K>['responses'] & SuccessCode];

/** A non-JSON response (PDF, CSV, XLSX). */
export class RawBody {
  constructor(
    readonly body: Buffer | string,
    readonly contentType: string,
    readonly filename?: string,
  ) {}
}

/** What a handler sees. `user` and `company` throw when the route has none. */
export type Ctx<K extends OperationId> = {
  req: FastifyRequest;
  reply: FastifyReply;
  deps: Deps;
  db: Db;
  op: Operation;
  params: PathParams<K>;
  query: QueryParams<K>;
  body: RequestBody<K>;
  /** The signed-in user. Throws 401 on a public route with no token. */
  readonly user: AuthUser;
  /** The caller when a public route received a token, else null. */
  readonly maybeUser: AuthUser | null;
  /** The company in the path, already checked against the caller's access. */
  readonly company: CompanyRow;
  now: Date;
};

export type Handler<K extends OperationId> = (ctx: Ctx<K>) => Promise<ResponseBody<K> | RawBody>;
export type Handlers = { [K in OperationId]?: Handler<K> };

/** Declares a module's handlers, checked against the contract. */
export function defineHandlers<T extends Handlers>(handlers: T): T {
  return handlers;
}

export type WebhookCtx = {
  req: FastifyRequest;
  reply: FastifyReply;
  deps: Deps;
  db: Db;
  rawBody: string;
  body: Record<string, unknown>;
  now: Date;
};
export type WebhookHandlers = {
  razorpayWebhook?: (ctx: WebhookCtx) => Promise<void>;
  whatsappWebhook?: (ctx: WebhookCtx) => Promise<void>;
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
    company: CompanyRow | null;
  }
  interface FastifyContextConfig {
    op?: Operation;
  }
}
