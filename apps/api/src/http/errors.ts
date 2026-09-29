import type { FastifyError, FastifyInstance } from 'fastify';
import type { Schema } from '@esmart/api-contract';

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
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
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
export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, detail?: string) => new ApiError(409, code, detail);
export const preconditionFailed = (detail = 'The resource changed since you read it') =>
  new ApiError(412, 'VERSION_MISMATCH', detail);
export const unprocessable = (issues: Issue[], code = 'VALIDATION_FAILED', detail?: string) =>
  new ApiError(422, code, detail ?? issues[0]?.message ?? 'Validation failed', { issues });
export const tooManyRequests = (detail?: string) => new ApiError(429, 'RATE_LIMITED', detail);
export const upstream = (code: string, detail?: string, issues?: Issue[]) =>
  new ApiError(502, code, detail, issues ? { issues } : {});
export const planUpgradeRequired = (requiredPlan: PlanTier, module: string) =>
  new ApiError(403, 'PLAN_UPGRADE_REQUIRED', `The ${module} module needs the ${requiredPlan} plan`, { requiredPlan });

/** One blocking issue, for the common single-field case. */
export const invalid = (field: string, message: string, code = 'VALIDATION_FAILED') =>
  unprocessable([{ field, message, severity: 'blocking' }], code);

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
      const issues: Issue[] = err.validation.map((v) => ({
        field: [err.validationContext, v.instancePath.replace(/^\//, '').replace(/\//g, '.')].filter(Boolean).join('.') ||
          String((v.params as { missingProperty?: string }).missingProperty ?? ''),
        message: v.message ?? 'Invalid',
        severity: 'blocking',
      }));
      body = { code: 'VALIDATION_FAILED', detail: err.message, issues };
    } else if (err.statusCode && err.statusCode < 500) {
      status = err.statusCode;
      body = { code: err.code ?? 'BAD_REQUEST', detail: err.message };
    } else {
      status = 500;
      req.log.error({ err }, 'unhandled error');
      body = { code: 'INTERNAL', detail: 'Something went wrong on our side' };
    }
    void reply
      .status(status)
      .type('application/problem+json')
      .send({ type: 'about:blank', title: TITLES[status] ?? 'Error', status, ...body, traceId: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    void reply
      .status(404)
      .type('application/problem+json')
      .send({ type: 'about:blank', title: 'Not Found', status: 404, code: 'ROUTE_NOT_FOUND', detail: `${req.method} ${req.url}`, traceId: req.id });
  });
}
