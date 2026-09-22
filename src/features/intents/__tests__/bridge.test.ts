import { consumePendingAction, parsePendingAction, syncIntentEntities } from '../bridge';

describe('App Intents bridge', () => {
  it('reads a complete create-invoice action', () => {
    const json = JSON.stringify({ action: 'createInvoice', partyId: 'pty_1', itemId: 'itm_2', quantity: 3 });
    expect(parsePendingAction(json)).toEqual({
      action: 'createInvoice',
      partyId: 'pty_1',
      itemId: 'itm_2',
      quantity: 3,
    });
  });

  it('drops a missing item and falls back to a quantity of one', () => {
    const json = JSON.stringify({ action: 'createInvoice', partyId: 'pty_1', quantity: 0 });
    expect(parsePendingAction(json)).toEqual({
      action: 'createInvoice',
      partyId: 'pty_1',
      itemId: undefined,
      quantity: 1,
    });
  });

  it('ignores nothing, malformed JSON and unknown actions', () => {
    expect(parsePendingAction(null)).toBeNull();
    expect(parsePendingAction('{not json')).toBeNull();
    expect(parsePendingAction('null')).toBeNull();
    expect(parsePendingAction(JSON.stringify({ action: 'deleteAll', partyId: 'pty_1' }))).toBeNull();
    expect(parsePendingAction(JSON.stringify({ action: 'createInvoice' }))).toBeNull();
  });

  it('is a no-op where the native module does not exist', () => {
    expect(() => syncIntentEntities([], [])).not.toThrow();
    expect(consumePendingAction()).toBeNull();
  });
});
