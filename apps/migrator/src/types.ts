import type { Ctx, EntityId, Mapping, Outcome, Parsed, SendResult } from './lib/entities';
import type { Sheet } from './lib/sheets';

export type { EntityId, Outcome, Parsed, SendResult };

export type Account = { name: string; email: string };

export type Business = { id: string; name: string; ctx: Ctx; plan?: string };

/** One sheet of an uploaded file, and what we think it holds. */
export type SheetPlan = {
  id: string;
  fileName: string;
  sheet: Sheet;
  /** What the sheet holds; 'skip' leaves it out. */
  entity: EntityId | 'skip';
  mapping: Mapping;
  /** The person's choices for this sheet, such as saving documents as drafts. */
  options: Record<string, string>;
  /** Made-up records from the demo tools, not the person's own file. */
  demo?: boolean;
};

/** What happened to one sheet's rows. */
export type PlanResult = { plan: SheetPlan; parsed: Parsed; sent: SendResult };

export type Step = 'source' | 'account' | 'company' | 'data' | 'review' | 'done';
