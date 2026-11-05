import { defineHandlers } from '../../context';
import { confirmEnrollment, mfaStatus, startEnrollment, verify, type MfaAudit, type MfaCtx } from '../../lib/mfaFlow';
import { recordPlatformAction } from './audit';

/** Operators' events go to the platform audit log, against themselves. */
const platformAudit =
  (ctx: MfaCtx): MfaAudit =>
  (db, action, reason) =>
    recordPlatformAction(db, ctx.user, ctx.req, { action, target: { type: 'user', id: ctx.user.id, label: ctx.user.email }, reason });

/** Platform operators must use an authenticator app (lib/mfaFlow). */
export const mfaHandlers = defineHandlers({
  async getMfaStatus(ctx) {
    return mfaStatus(ctx);
  },
  async startMfaEnrollment(ctx) {
    return startEnrollment(ctx, 'An authenticator is already set up. Reset it from the command line to start again.');
  },
  async confirmMfaEnrollment(ctx) {
    return confirmEnrollment(ctx, platformAudit(ctx), ctx.body.code);
  },
  async verifyMfa(ctx) {
    return verify(ctx, platformAudit(ctx), ctx.body.code);
  },
});
