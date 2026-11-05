import { and, eq, sql } from "drizzle-orm";
import { aiLimit } from "@esmart/core/domain/plan";
import { businessDate } from "@esmart/core/lib/date";
import { schema } from "@esmart/db";
import type { PlanTier } from "@esmart/core/types";
import { ApiError } from "../http/errors";
import type { DbOrTx } from "./audit";

const U = schema.aiUsage;
export type AiFeature = (typeof U.$inferInsert)["feature"];

/** The month AI use is counted in, India time. */
export const usageMonth = (now: Date) => businessDate(now).slice(0, 7);

export async function aiUsageOf(
  db: DbOrTx,
  companyId: string,
  month: string,
): Promise<Record<AiFeature, number>> {
  const rows = await db
    .select({ feature: U.feature, count: U.count })
    .from(U)
    .where(and(eq(U.companyId, companyId), eq(U.month, month)));
  const used: Record<AiFeature, number> = { lixi: 0, ocr: 0 };
  for (const r of rows) used[r.feature] = r.count;
  return used;
}

/**
 * Takes one AI action from this month's allowance, or refuses with 429 AI_LIMIT_REACHED. The count goes
 * up first and comes back down when over, so two requests at once can't both take the last one. The
 * returned function gives the action back, for a model call that failed.
 */
export async function takeAiAction(
  ctx: {
    db: DbOrTx;
    now: Date;
    company: { id: string; plan: PlanTier; aiMonthlyLimit?: number | null };
  },
  feature: AiFeature,
): Promise<() => Promise<void>> {
  const month = usageMonth(ctx.now);
  const limit = aiLimit(ctx.company.plan, ctx.company.aiMonthlyLimit);
  const companyId = ctx.company.id;
  await ctx.db
    .insert(U)
    .values({ companyId, month, feature, count: 1 })
    .onConflictDoUpdate({
      target: [U.companyId, U.month, U.feature],
      set: { count: sql`${U.count} + 1` },
    });
  const step = (by: number) =>
    ctx.db
      .update(U)
      .set({ count: sql`greatest(${U.count} + ${by}, 0)` })
      .where(
        and(
          eq(U.companyId, companyId),
          eq(U.month, month),
          eq(U.feature, feature),
        ),
      );
  const used = await aiUsageOf(ctx.db, companyId, month);
  if (used.lixi + used.ocr > limit) {
    await step(-1);
    throw new ApiError(
      429,
      "AI_LIMIT_REACHED",
      `This business has used its ${limit} AI actions for ${month}. It resets on the 1st, or the owner can raise the budget (up to the plan's).`,
      { limit, month },
    );
  }
  return async () => {
    await step(-1);
  };
}
