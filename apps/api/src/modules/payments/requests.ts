import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Schema } from "@esmart/api-contract";
import { schema } from "@esmart/db";
import {
  defineHandlers,
  type AuthUser,
  type CompanyRow,
  type Deps,
} from "../../context";
import { ApiError, conflict, notFound } from "../../http/errors";
import { recordChange, type DbOrTx } from "../../lib/audit";
import { newId } from "../../lib/ids";
import { notify, noteMoney } from "../../lib/notify";
import { money } from "../../lib/wire";
import { APPROVERS, type ApprovalRule } from "../documents/approvals";
import { rateToBase } from "../documents/engine";
import {
  linkPaymentAttachments,
  writePayment,
  type PaymentInput,
} from "./engine";
import { paymentsToWire } from "./wire";

const R = schema.paymentRequests;
type RequestRow = typeof R.$inferSelect;
type PaymentBody = Schema<"Payment">;

/**
 * Payment approvals (RULES 6.14). A payment made to a supplier over the company's `payment` rule, by
 * someone who isn't an owner or admin, isn't recorded: it is kept as a request and the owners and
 * admins are told. Approving it records the payment then, as the approver; rejecting it says why.
 * Money received never waits, and nor does a refund.
 */
export function paymentLimit(
  company: CompanyRow,
  user: AuthUser,
  body: Pick<PaymentBody, "direction" | "refundOf" | "currency" | "exchangeRate">,
): number | null {
  if (
    APPROVERS.includes(user.role) ||
    body.direction !== "paid" ||
    body.refundOf
  )
    return null;
  const rule = (
    (company.approvalRules as
      (ApprovalRule | { kind: "payment"; overMinor: number })[] | null) ?? []
  ).find((r) => r.kind === "payment");
  if (!rule) return null;
  // A foreign-currency payment sent without its rate can't be measured against a limit in base
  // currency (its minor units would be read as rupees), so it always waits for an approver.
  if (body.currency !== company.baseCurrency.trim() && !body.exchangeRate) return 0;
  return rule.overMinor;
}

/** In base currency: the amount at the rate given, or as it is when no rate is given. */
export const amountInBase = (
  body: Pick<PaymentBody, "amount" | "exchangeRate">,
) => Math.round(body.amount.minor * (body.exchangeRate ?? 1));

/** What a held request is worth in base currency: at the rate sent, else the day's rate on file. */
async function requestAmountInBase(tx: DbOrTx, company: CompanyRow, body: PaymentBody): Promise<number> {
  const base = company.baseCurrency.trim();
  if (body.currency === base || body.exchangeRate) return amountInBase(body);
  const rate = await rateToBase(tx, company.id, body.currency, base, body.date);
  return Math.round(body.amount.minor * (rate ?? 1));
}

/** Keeps the payment as a request and tells the approvers; the caller answers 409 PAYMENT_HELD. */
export async function holdPayment(
  tx: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  user: AuthUser,
  body: PaymentBody,
  now: Date,
): Promise<RequestRow> {
  const [row] = await tx
    .insert(R)
    .values({
      id: newId("prq"),
      companyId: company.id,
      body,
      partyId: body.partyId,
      direction: body.direction,
      amountBaseMinor: await requestAmountInBase(tx, company, body),
      requestedBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await recordChange(tx, user, {
    companyId: company.id,
    action: "approvalRequested",
    entityType: "payment_request",
    entityId: row.id,
    entityLabel: `Payment of ${(row.amountBaseMinor / 100).toFixed(2)}`,
    version: row.version,
  });
  await notify(tx, deps, {
    companyId: company.id,
    kind: "system",
    title: "A payment is waiting for your approval",
    body: `${user.name} asked to pay ${noteMoney(row.amountBaseMinor, company.baseCurrency)}.`,
    entityType: "payment_request",
    entityId: row.id,
  });
  return row;
}

/**
 * The one gate every new payment made passes (RULES 6.14): the payments screen, a bank-statement
 * line recorded as a payment, and Lixi (which calls createPayment). Over the rule, from someone who
 * isn't an approver, the payment is kept as a request (committed on its own) and 409 PAYMENT_HELD
 * is thrown, so nothing is recorded. Call it before the transaction that would write the payment.
 */
export async function holdIfOverLimit(
  db: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  user: AuthUser,
  body: PaymentBody,
  now: Date,
  detail = "",
): Promise<void> {
  const limit = paymentLimit(company, user, body);
  if (limit === null || amountInBase(body) <= limit) return;
  const held = await db.transaction((tx) => holdPayment(tx, deps, company, user, body, now));
  throw new ApiError(
    409,
    "PAYMENT_HELD",
    `Payments over ${(limit / 100).toFixed(2)} need an owner or admin. This one is waiting for their approval.${detail}`,
    { requestId: held.id },
  );
}

/**
 * Editing a payment made can't take it over the rule either: someone who isn't an approver may
 * not raise one past the limit (or above where it already was, when it is already past it).
 */
export function assertEditWithinLimit(
  company: CompanyRow,
  user: AuthUser,
  body: PaymentBody,
  existing: { amountMinor: number; exchangeRate: string | number },
): void {
  const limit = paymentLimit(company, user, body);
  if (limit === null) return;
  const after = amountInBase(body);
  const before = Math.round(existing.amountMinor * Number(existing.exchangeRate ?? 1));
  if (after > limit && after > before)
    throw conflict(
      "PAYMENT_NEEDS_APPROVER",
      `Payments over ${(limit / 100).toFixed(2)} need an owner or admin. Ask one of them to change this payment.`,
    );
}

async function toWire(
  db: DbOrTx,
  rows: RequestRow[],
  base: string,
): Promise<Schema<"PaymentRequest">[]> {
  if (!rows.length) return [];
  const P = schema.parties;
  const U = schema.users;
  const partyIds = [...new Set(rows.map((r) => r.partyId))];
  const userIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.requestedBy, r.decidedBy].filter((x): x is string => !!x),
      ),
    ),
  ];
  const [parties, users] = await Promise.all([
    db
      .select({ id: P.id, name: P.name })
      .from(P)
      .where(inArray(P.id, partyIds)),
    userIds.length
      ? db
          .select({ id: U.id, name: U.name })
          .from(U)
          .where(inArray(U.id, userIds))
      : Promise.resolve([]),
  ]);
  const party = new Map(parties.map((p) => [p.id, p.name]));
  const user = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    payment: r.body as PaymentBody,
    partyName: party.get(r.partyId) ?? "",
    amount: money(r.amountBaseMinor, base),
    requestedBy: r.requestedBy,
    requestedByName: user.get(r.requestedBy) ?? "",
    requestedAt: r.createdAt.toISOString(),
    ...(r.decidedBy && {
      decidedBy: r.decidedBy,
      decidedByName: user.get(r.decidedBy) ?? "",
    }),
    ...(r.decidedAt && { decidedAt: r.decidedAt.toISOString() }),
    ...(r.note && { note: r.note }),
    ...(r.paymentId && { paymentId: r.paymentId }),
    version: r.version,
  }));
}

async function findPending(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db
    .select()
    .from(R)
    .where(and(eq(R.companyId, companyId), eq(R.id, id)))
    .for("update");
  if (!row) throw notFound("Payment request");
  if (row.status !== "pending")
    throw conflict(
      "NOT_AWAITING_APPROVAL",
      `This payment was already ${row.status}`,
    );
  return row;
}

export function requestInput(body: PaymentBody): PaymentInput {
  return {
    direction: body.direction,
    partyId: body.partyId,
    branchId: body.branchId,
    date: body.date,
    amountMinor: body.amount.minor,
    amountCurrency: body.amount.currency,
    currency: body.currency,
    exchangeRate: body.exchangeRate,
    method: body.method,
    reference: body.reference,
    accountId: body.accountId,
    notes: body.notes,
    advanceTax: body.advanceTax ?? null,
    refundOf: body.refundOf ?? null,
    tdsSection: body.tdsSection ?? null,
    advanceTdsMinor: body.advanceTds?.minor ?? 0,
    allocations: (body.allocations ?? []).map((a) => ({
      documentId: a.documentId,
      amountMinor: a.amount.minor,
      tdsMinor: a.tdsDeducted?.minor,
      discountMinor: a.discount?.minor,
      writeOffMinor: a.writeOff?.minor,
      currency: a.amount.currency,
    })),
  };
}

export const paymentRequestHandlers = defineHandlers({
  async listPaymentRequests(ctx) {
    const status = ctx.query.status ?? "pending";
    const rows = await ctx.db
      .select()
      .from(R)
      .where(
        and(
          eq(R.companyId, ctx.company.id),
          eq(R.status, status),
          ...(APPROVERS.includes(ctx.user.role)
            ? []
            : [eq(R.requestedBy, ctx.user.id)]),
        ),
      )
      .orderBy(status === "pending" ? asc(R.createdAt) : desc(R.decidedAt))
      .limit(200);
    return {
      data: await toWire(ctx.db, rows, ctx.company.baseCurrency.trim()),
    };
  },

  async approvePaymentRequest(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const row = await ctx.db.transaction(async (tx) => {
      const current = await findPending(tx, ctx.company.id, ctx.params.id);
      const body = current.body as PaymentBody;
      // Recorded now, as the approver, and checked as any payment is: an account short of cash still says so.
      const payment = await writePayment(
        tx,
        ctx.deps,
        ctx.company,
        ctx.user,
        requestInput(body),
        { now: ctx.now },
      );
      await linkPaymentAttachments(
        tx,
        ctx.company.id,
        payment.id,
        body.attachmentIds,
      );
      const [updated] = await tx
        .update(R)
        .set({
          status: "approved",
          decidedBy: ctx.user.id,
          decidedAt: ctx.now,
          paymentId: payment.id,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(R.id, current.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: "approved",
        entityType: "payment_request",
        entityId: current.id,
        entityLabel: payment.number,
        version: updated.version,
      });
      await notify(tx, ctx.deps, {
        companyId: ctx.company.id,
        userId: current.requestedBy,
        kind: "system",
        title: "Your payment was approved",
        body: `${payment.number} was recorded by ${ctx.user.name}.`,
        entityType: "payment",
        entityId: payment.id,
      });
      return updated;
    });
    const [wire] = await toWire(ctx.db, [row], base);
    const [payment] = await paymentsToWire(
      ctx.db,
      await ctx.db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, row.paymentId!)),
      base,
    );
    return { ...wire, payment };
  },

  async rejectPaymentRequest(ctx) {
    const row = await ctx.db.transaction(async (tx) => {
      const current = await findPending(tx, ctx.company.id, ctx.params.id);
      const note = ctx.body.note.trim();
      const [updated] = await tx
        .update(R)
        .set({
          status: "rejected",
          decidedBy: ctx.user.id,
          decidedAt: ctx.now,
          note,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(R.id, current.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: "approvalRejected",
        entityType: "payment_request",
        entityId: current.id,
        entityLabel: `Payment of ${(current.amountBaseMinor / 100).toFixed(2)}`,
        version: updated.version,
        after: { note },
      });
      await notify(tx, ctx.deps, {
        companyId: ctx.company.id,
        userId: current.requestedBy,
        kind: "system",
        title: "Your payment was not approved",
        body: note,
        entityType: "payment_request",
        entityId: current.id,
      });
      return updated;
    });
    const [wire] = await toWire(ctx.db, [row], ctx.company.baseCurrency.trim());
    return wire;
  },
});
