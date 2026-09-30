import { describe, expect, it } from 'vitest';
import { handlers, webhookHandlers } from '../src/modules';
import { loadOperations } from '../src/openapi/spec';

describe('contract coverage', () => {
  it('has a handler for every operation in openapi.yaml', async () => {
    const { operations } = await loadOperations();
    const missing = operations
      .filter((op) => (op.tag === 'Webhooks' ? !(op.id in webhookHandlers) : !(op.id in handlers)))
      .map((op) => `${op.method} ${op.path} (${op.id})`);
    expect(missing).toEqual([]);
    expect(operations.length).toBe(156);
  });

  it('implements nothing the contract does not declare', async () => {
    const { operations } = await loadOperations();
    const declared = new Set(operations.map((op) => op.id));
    expect(Object.keys(handlers).filter((id) => !declared.has(id as never))).toEqual([]);
  });
});
