import type { FastifyError, FastifyInstance } from 'fastify';
import type { Schema } from '@esmart/api-contract';
import { dayFirst } from '@esmart/core/lib/date';
import { reportError } from '../lib/reporter';
import { moduleName } from '../lib/names';
import { friendlyDetail, friendlyIssues } from './friendlyValidation';

export type Issue = Schema<'ComplianceIssue'>;
type PlanTier = Schema<'PlanTier'>;

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  412: 'Precondition Failed',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Every error the API returns on purpose. The handler turns it into
 * application/problem+json with a stable `code` the apps can switch on.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail?: string,
    readonly extra: { issues?: Issue[]; requiredPlan?: PlanTier; [key: string]: unknown } = {},
  ) {
    super(detail ?? code);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: string, detail?: string) => new ApiError(400, code, detail);
export const unauthorized = (code = 'UNAUTHORIZED', detail?: string) => new ApiError(401, code, detail);
export const forbidden = (code = 'FORBIDDEN', detail?: string) => new ApiError(403, code, detail);
export const notFound = (what?: string) =>
  new ApiError(404, 'NOT_FOUND', what ? `We couldn't find that ${what.toLowerCase()}. It may have been deleted.` : "We couldn't find that. It may have been deleted.");
export const conflict = (code: string, detail?: string) => new ApiError(409, code, detail);
export const preconditionFailed = (detail = 'Someone else changed this just now. Reload to see the latest, then try again.') =>
  new ApiError(412, 'VERSION_MISMATCH', detail);
export const unprocessable = (issues: Issue[], code = 'VALIDATION_FAILED', detail?: string) =>
  new ApiError(422, code, detail ?? issues[0]?.message ?? 'Validation failed', { issues });
export const tooManyRequests = (detail?: string) => new ApiError(429, 'RATE_LIMITED', detail);
export const upstream = (code: string, detail?: string, issues?: Issue[]) =>
  new ApiError(502, code, detail, issues ? { issues } : {});
/** A feature this server has no provider for (GSTIN_PROVIDER or OCR_PROVIDER=disabled). */
export const featureUnavailable = (detail?: string) => new ApiError(503, 'FEATURE_UNAVAILABLE', detail);
export const planUpgradeRequired = (requiredPlan: PlanTier, module: string) =>
  new ApiError(403, 'PLAN_UPGRADE_REQUIRED', `${moduleName(module)} is available on the ${requiredPlan} plan. Upgrade your plan to use it.`, { requiredPlan });

/** The plan's monthly invoices are used up. */
export const invoiceLimitReached = (plan: PlanTier, limit: number, requiredPlan: PlanTier | null) =>
  new ApiError(403, 'PLAN_LIMIT_REACHED', `Your ${plan} plan includes ${limit} invoices a month. Upgrade your plan to issue more.`, { plan, limit, ...(requiredPlan ? { requiredPlan } : {}) });

/** The plan's user limit is used up; `requiredPlan` is the next tier that allows more people (absent when none does). */
export const planLimitReached = (plan: PlanTier, limit: number, requiredPlan: PlanTier | null) =>
  new ApiError(
    403,
    'PLAN_LIMIT_REACHED',
    `Your ${plan} plan includes ${limit} ${limit === 1 ? 'user' : 'users'}. Upgrade your plan to add more people.`,
    requiredPlan ? { requiredPlan } : {},
  );

/** One blocking issue, for the common single-field case. */
export const invalid = (field: string, message: string, code = 'VALIDATION_FAILED') =>
  unprocessable([{ field, message, severity: 'blocking' }], code);

/** Postgres refused a duplicate (23505), raw or wrapped by the query builder. */
export function uniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Fastify's own 4xx messages ("Body is not valid JSON") mean nothing to a user. */
function plainFrameworkMessage(status: number, message: string): string {
  if (status === 413) return 'That file or request is too large. Use a smaller one and try again.';
  if (status === 415) return "That kind of file isn't accepted. Choose a different file and try again.";
  if (status === 429) return message;
  return "We couldn't read that request. Please try again.";
}

export function problemHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    let status: number;
    let body: Record<string, unknown>;
    if (err instanceof ApiError) {
      status = err.status;
      body = { code: err.code, detail: err.message, ...err.extra };
    } else if (err.validation) {
      // Request didn't match the contract's schema.
      status = 422;
      const found = friendlyIssues(err.validation, err.validationContext);
      const issues: Issue[] = found.map((i) => ({ ...i, severity: 'blocking' as const }));
      body = { code: 'VALIDATION_FAILED', detail: friendlyDetail(found), issues };
    } else if (uniqueViolation(err)) {
      // Two requests raced for the same unique record (a double submit, two devices): the
      // second is a conflict, not a fault. 4xx also keeps its Idempotency-Key's answer.
      status = 409;
      body = { code: 'ALREADY_EXISTS', detail: 'This was already saved; refresh to see it' };
    } else if (err.statusCode && err.statusCode < 500) {
      status = err.statusCode;
      body = { code: err.code ?? 'BAD_REQUEST', detail: plainFrameworkMessage(err.statusCode, err.message) };
    } else {
      status = 500;
      reportError(req.log, err, {
        requestId: req.id,
        userId: req.authUser?.id,
        companyId: req.company?.id,
        route: req.routeOptions?.url,
      });
      body = { code: 'INTERNAL', detail: 'Something went wrong on our side. Please try again in a few minutes. If it keeps happening, contact support.' };
    }
    // What the user reads: a date in figures day first (2026-09-29 → 29-09-2026). Fields and codes stay as they are.
    if (typeof body.detail === 'string') body.detail = dayFirst(body.detail);
    if (Array.isArray(body.issues)) body.issues = (body.issues as Issue[]).map((i) => ({ ...i, message: i.message && dayFirst(i.message) }));
    void reply
      .status(status)
      .type('application/problem+json')
      .send({ type: 'about:blank', title: TITLES[status] ?? 'Error', status, ...body, traceId: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    void reply
      .status(404)
      .type('application/problem+json')
      .send({ type: 'about:blank', title: 'Not Found', status: 404, code: 'ROUTE_NOT_FOUND', detail: "That page or action isn't available. Update the app and try again.", traceId: req.id });
  });
}
