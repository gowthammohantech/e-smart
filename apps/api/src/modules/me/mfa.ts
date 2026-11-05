import { defineHandlers } from '../../context';
import { confirmEnrollment, disable, mfaStatus, startEnrollment, verify, type MfaAudit, type MfaCtx } from '../../lib/mfaFlow';

/** A business user's own events go to the request log; they belong to the person, not to any one business. */
const selfAudit =
  (ctx: MfaCtx): MfaAudit =>
  async (_db, action, reason) => {
    ctx.req.log.info({ userId: ctx.user.id, action, reason }, 'mfa');
  };

/** Business users may turn on an authenticator app for their own sign-in (lib/mfaFlow). */
export const myMfaHandlers = defineHandlers({
  async getMyMfa(ctx) {
    return mfaStatus(ctx);
  },
  async startMyMfaEnrollment(ctx) {
    return startEnrollment(ctx, 'An authenticator is already set up; turn it off first to set up another');
  },
  async confirmMyMfaEnrollment(ctx) {
    return confirmEnrollment(ctx, selfAudit(ctx), ctx.body.code);
  },
  async verifyMyMfa(ctx) {
    return verify(ctx, selfAudit(ctx), ctx.body.code);
  },
  async disableMyMfa(ctx) {
    await disable(ctx, selfAudit(ctx), ctx.body.code);
    return undefined;
  },
});
