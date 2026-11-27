import { detectEntity, isInstructions, type Ctx } from './entities';
import { defaultOptions } from './options';
import type { Sheet } from './sheets';
import type { SheetPlan } from '../types';

/** What each sheet of a file (or of the demo sample) most looks like, with its columns matched and choices set. */
export function plansFromSheets(fileName: string, sheets: Sheet[], ctx: Ctx, demo = false): SheetPlan[] {
  return sheets
    .filter((sheet) => !isInstructions(sheet.name))
    .map((sheet) => {
      const entity = detectEntity(sheet);
      return {
        id: `${fileName}:${sheet.name}`,
        fileName,
        sheet,
        entity: entity?.id ?? 'skip',
        mapping: entity ? entity.guess(sheet.rows[0] ?? []) : {},
        options: defaultOptions(entity, ctx),
        ...(demo && { demo: true }),
      };
    });
}
