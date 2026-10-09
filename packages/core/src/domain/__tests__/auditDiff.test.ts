import { auditChanges } from '../auditDiff';

const json = (v: unknown) => JSON.stringify(v);

describe('audit changes', () => {
  it('lists only the fields that changed, nested ones by path', () => {
    const before = { id: 'p1', version: 2, name: 'Acme', phone: '98200', billingAddress: { city: 'Pune', postalCode: '411001' } };
    const after = { id: 'p1', version: 3, name: 'Acme', phone: '98201', billingAddress: { city: 'Pune', postalCode: '411002' } };
    expect(auditChanges(json(before), json(after))).toEqual([
      { field: 'phone', from: '98200', to: '98201' },
      { field: 'billingAddress.postalCode', from: '411001', to: '411002' },
    ]);
  });

  it('shows money as money, and a cleared field as gone', () => {
    const before = { total: { minor: 236000, currency: 'INR' }, notes: 'Deliver by Friday' };
    const after = { total: { minor: 354000, currency: 'INR' } };
    const changes = auditChanges(json(before), json(after));
    expect(changes).toHaveLength(2);
    expect(changes[0].field).toBe('total');
    expect(changes[0].from).toContain('2,360');
    expect(changes[0].to).toContain('3,540');
    expect(changes[1]).toEqual({ field: 'notes', from: 'Deliver by Friday', to: undefined });
  });

  it('reports lines removed and added, not the whole list', () => {
    const before = { lines: ['Rod × 2 NOS @ 1000.00, 18%', 'Bolt × 10 NOS @ 5.00, 18%'] };
    const after = { lines: ['Rod × 3 NOS @ 1000.00, 18%', 'Bolt × 10 NOS @ 5.00, 18%'] };
    expect(auditChanges(json(before), json(after))).toEqual([
      { field: 'lines', from: 'Rod × 2 NOS @ 1000.00, 18%', to: 'Rod × 3 NOS @ 1000.00, 18%' },
    ]);
  });

  it('reads a plain value recorded on the device as one change', () => {
    expect(auditChanges('2026-10-01', '2026-10-05')).toEqual([{ field: 'value', from: '2026-10-01', to: '2026-10-05' }]);
    expect(auditChanges(undefined, 'IRN123')).toEqual([{ field: 'value', from: undefined, to: 'IRN123' }]);
  });

  it('has nothing to compare for a create, a delete or no snapshots', () => {
    expect(auditChanges(undefined, json({ name: 'Acme' }))).toEqual([]);
    expect(auditChanges(json({ name: 'Acme' }), undefined)).toEqual([]);
    expect(auditChanges(undefined, undefined)).toEqual([]);
  });
});
