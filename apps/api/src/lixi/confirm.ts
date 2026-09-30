import { createHmac, randomBytes } from 'node:crypto';
import { ApiError, badRequest, forbidden } from '../http/errors';
import { safeEqual, sha256 } from '../lib/crypto';
import { call, parseInput, ToolError, toolByName, type InnerRequest, type ToolCtx, type WriteResult, type WriteTool } from './tools';

/**
 * Confirm-before-acting, enforced by the server rather than the prompt.
 *
 * A write tool never writes. It returns a pending action whose token carries
 * the exact request to run, signed and bound to the user, their session and
 * the company, and valid for a few minutes. Only a separate confirmation
 * from the user runs it, as that user, so roles and plan are checked again
 * at that moment. The Idempotency-Key comes from the token, so a double tap
 * runs once.
 */

export const ACTION_TTL_MS = 5 * 60_000;

export type PendingAction = {
  token: string;
  tool: string;
  summary: string;
  preview: Record<string, unknown>;
  expiresAt: string;
};

type Claims = {
  v: 1;
  uid: string;
  sid: string;
  cid: string;
  tool: string;
  summary: string;
  req: InnerRequest;
  exp: number;
  n: string;
};

const keyFor = (secret: string) => sha256(`lixi-action:${secret}`);
const mac = (body: string, secret: string) => createHmac('sha256', keyFor(secret)).update(body).digest('base64url');

function sign(claims: Claims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${mac(body, secret)}`;
}

function verify(token: string, secret: string): Claims {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, mac(body, secret))) {
    throw badRequest('LIXI_ACTION_INVALID', 'This action could not be verified');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims;
}

/** A UUID-shaped key from the token, as the idempotency layer requires. */
function idempotencyKeyFor(token: string): string {
  const h = sha256(`lixi-idem:${token}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Resolves and prices a write, and returns it for the user to confirm. */
export async function propose(tool: WriteTool, input: unknown, ctx: ToolCtx, secret: string): Promise<PendingAction> {
  const proposal = await tool.propose(parseInput(tool, input), ctx);
  const exp = ctx.now.getTime() + ACTION_TTL_MS;
  const token = sign(
    {
      v: 1,
      uid: ctx.user.id,
      sid: ctx.user.sessionId,
      cid: ctx.company.id,
      tool: tool.name,
      summary: proposal.summary,
      req: proposal.request,
      exp,
      n: randomBytes(8).toString('base64url'),
    },
    secret,
  );
  return { token, tool: tool.name, summary: proposal.summary, preview: proposal.preview, expiresAt: new Date(exp).toISOString() };
}

/** Runs a confirmed action as the caller. */
export async function confirm(token: string, ctx: ToolCtx, secret: string): Promise<{ summary: string; tool: string; result: WriteResult }> {
  const claims = verify(token, secret);
  if (claims.v !== 1) throw badRequest('LIXI_ACTION_INVALID', 'This action could not be verified');
  if (claims.uid !== ctx.user.id || claims.sid !== ctx.user.sessionId || claims.cid !== ctx.company.id) {
    throw forbidden('LIXI_ACTION_FORBIDDEN', 'This action was prepared for someone else');
  }
  if (ctx.now.getTime() > claims.exp) throw new ApiError(410, 'LIXI_ACTION_EXPIRED', 'This action expired; ask Lixi again');
  const tool = toolByName(claims.tool);
  if (!tool || tool.kind !== 'write') throw badRequest('LIXI_ACTION_INVALID', 'This action is no longer available');

  try {
    const body = await call(ctx, claims.req, { 'idempotency-key': idempotencyKeyFor(token) });
    return { summary: claims.summary, tool: tool.name, result: tool.result(body, claims.req) };
  } catch (err) {
    if (!(err instanceof ToolError)) throw err;
    // The route refused (role, plan, validation): pass its problem through.
    const { code, detail, issues, requiredPlan } = err.problem as ToolError['problem'] & { issues?: never; requiredPlan?: never };
    throw new ApiError(err.status, code ?? 'LIXI_ACTION_FAILED', detail, { ...(issues ? { issues } : {}), ...(requiredPlan ? { requiredPlan } : {}) });
  }
}
