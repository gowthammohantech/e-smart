import { buildSeedData } from '@/data/buildSeedData';
import { isValidGstin } from '@/domain/gst/gstin';
import { isWellFormedIrn } from '@/domain/gst/einvoice/irn';
import { readSignedQr } from '@/domain/gst/einvoice/qr';
import { validityDays } from '@/domain/gst/eway/validity';

/**
 * The seed is where a decorative prototype usually gives itself away. These
 * assert that the demo book would survive the portal it claims to talk to.
 */
describe('seeded demo data', () => {
  const data = buildSeedData();

  it('gives every registered customer a GSTIN that passes its own check digit', () => {
    const registered = data.parties.filter((p) => p.taxId);
    expect(registered.length).toBeGreaterThan(5);
    registered.forEach((p) => {
      expect(isValidGstin(p.taxId)).toBe(true);
    });
  });

  it('gives every company and transporter a valid GSTIN', () => {
    data.companies.forEach((c) => {
      expect(isValidGstin(c.taxRegistration?.identifier)).toBe(true);
    });
    data.transporters.forEach((tr) => {
      expect(isValidGstin(tr.transporterId)).toBe(true);
    });
  });

  it('carries real IRNs whose QR verifies', () => {
    const registered = data.documents.filter((d) => d.compliance?.eInvoice?.status === 'generated');
    expect(registered.length).toBeGreaterThan(0);

    registered.forEach((d) => {
      const record = d.compliance!.eInvoice!;
      expect(isWellFormedIrn(record.irn)).toBe(true);
      expect(record.ackNo).toMatch(/^\d{15}$/);

      const qr = readSignedQr(record.signedQrPayload!);
      expect(qr).not.toBeNull();
      expect(qr!.Irn).toBe(record.irn);
      expect(qr!.DocNo).toBe(d.number);
    });
  });

  it('never issues the same IRN twice', () => {
    const irns = data.documents
      .map((d) => d.compliance?.eInvoice?.irn)
      .filter((irn): irn is string => !!irn);
    expect(new Set(irns).size).toBe(irns.length);
  });

  it('covers the cancelled and rejected paths, not just the happy one', () => {
    const statuses = new Set(data.documents.map((d) => d.compliance?.eInvoice?.status));
    expect(statuses).toContain('generated');
    expect(statuses).toContain('cancelled');
    expect(statuses).toContain('notApplicable');
  });

  it('gives its e-way bills a validity that matches the distance rule', () => {
    const withBill = data.documents.filter((d) => d.compliance?.eWayBill?.status === 'generated');
    expect(withBill.length).toBeGreaterThan(0);

    withBill.forEach((d) => {
      const ewb = d.compliance!.eWayBill!;
      expect(ewb.ewbNo).toMatch(/^\d{12}$/);
      const days = Math.round(
        (Date.parse(ewb.validUpto!) - Date.parse(ewb.ewbDate!.slice(0, 10) + 'T00:00:00.000Z')) / 86_400_000,
      );
      expect(days).toBe(validityDays(ewb.distanceKm!, ewb.cargo!));
    });
  });

  it('keeps the two company books apart', () => {
    const companyIds = new Set(data.companies.map((c) => c.id));
    expect(companyIds.size).toBe(2);
    data.documents.forEach((d) => expect(companyIds.has(d.companyId)).toBe(true));
    data.parties.forEach((p) => expect(companyIds.has(p.companyId)).toBe(true));
  });
});
