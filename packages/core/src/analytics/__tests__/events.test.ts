import { routePattern, sanitize, sanitizeCompany, sizeBucket } from '../events';

describe('analytics sanitize', () => {
  it('keeps only catalog keys of the declared type', () => {
    expect(
      sanitize('document_created', { kind: 'invoice', isFirst: true, total: 1180, partyName: 'Acme', template: 'classic' }),
    ).toEqual({ kind: 'invoice', isFirst: true, template: 'classic' });
  });

  it('drops values of the wrong type', () => {
    expect(sanitize('document_created', { kind: 5, isFirst: 'yes' })).toEqual({});
    expect(sanitize('business_created', { branchCount: 2.5 })).toEqual({});
  });

  it('rejects free text, emails, phone numbers, GSTINs and PANs where a token is expected', () => {
    for (const bad of ['Acme Traders', 'a@b.in', '9876543210', '27AAPFU0939F1ZV', 'AAPFU0939F', '']) {
      expect(sanitize('document_sent', { channel: bad })).toEqual({});
    }
  });

  it('enforces enums', () => {
    expect(sanitize('gst_return_action', { action: 'file', returnType: 'gstr3b' })).toEqual({ action: 'file', returnType: 'gstr3b' });
    expect(sanitize('gst_return_action', { action: 'delete' })).toEqual({});
  });

  it('allows the common properties on any event', () => {
    expect(sanitize('signed_up', { platform: 'ios', appVersion: '1.0.6', email: 'x@y.z' })).toEqual({ platform: 'ios', appVersion: '1.0.6' });
  });

  it('sends nothing for an unknown event', () => {
    expect(sanitize('made_up', { kind: 'invoice' })).toEqual({});
  });

  it('sanitizes company group properties', () => {
    expect(sanitizeCompany({ plan: 'pro', name: 'Vertex Traders', gstin: '27AAPFU0939F1ZV', archived: false })).toEqual({ plan: 'pro', archived: false });
  });

  it('buckets sizes and strips route groups', () => {
    expect([0, 1, 10, 11, 500, 5000].map(sizeBucket)).toEqual(['0', '1-10', '1-10', '11-50', '201-1000', '1000+']);
    expect(routePattern(['(app)', 'documents', '[id]'])).toBe('/documents/[id]');
  });
});
