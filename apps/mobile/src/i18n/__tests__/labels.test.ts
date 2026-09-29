import i18n from '@/i18n';
import { LANGUAGE_CODES } from '@/i18n/config';
import {
  documentKindLabel,
  moduleLabel,
  paymentMethodLabel,
  seriesLabel,
  statusLabel,
} from '@/i18n/labels';
import { PURCHASE_KINDS, SALES_KINDS, STATUS_TONE } from '@/domain/documentStates';
import { SERIES_KINDS } from '@/domain/numbering';
import { MODULES } from '@/domain/plan';
import { PAYMENT_METHODS } from '@/data/masters';

/**
 * The label helpers build keys from closed unions, which the typed-key check
 * cannot follow. This is what replaces it: if a union gains a member and the
 * catalogue does not, the key falls through and this fails — in every locale.
 */
const DOC_KINDS = [...SALES_KINDS, ...PURCHASE_KINDS];
const STATUSES = Object.keys(STATUS_TONE) as (keyof typeof STATUS_TONE)[];

describe('domain label helpers', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  describe.each(LANGUAGE_CODES)('in %s', (lang) => {
    beforeEach(async () => {
      await i18n.changeLanguage(lang);
    });

    const resolves = (value: string) => {
      // parseMissingKeyHandler brackets a miss in dev; a bare key means the
      // catalogue has no entry at all.
      expect(value).not.toMatch(/^⟦/);
      expect(value).not.toMatch(/^domain:/);
      expect(value.trim().length).toBeGreaterThan(0);
    };

    it('names every document status', () => {
      for (const s of STATUSES) resolves(statusLabel(i18n.t, s));
    });

    it('names every document kind, singular and plural', () => {
      for (const k of DOC_KINDS) {
        resolves(documentKindLabel(i18n.t, k, 1));
        resolves(documentKindLabel(i18n.t, k, 2));
      }
    });

    it('names every numbering series', () => {
      for (const k of SERIES_KINDS) resolves(seriesLabel(i18n.t, k));
    });

    it('names every plan module', () => {
      for (const m of MODULES) resolves(moduleLabel(i18n.t, m));
    });

    it('names every payment method', () => {
      for (const m of PAYMENT_METHODS) resolves(paymentMethodLabel(i18n.t, m));
    });
  });

  it('uses the plural form only when the count calls for it', async () => {
    await i18n.changeLanguage('en');
    expect(documentKindLabel(i18n.t, 'invoice', 1)).toBe('Invoice');
    expect(documentKindLabel(i18n.t, 'invoice', 2)).toBe('Invoices');

    await i18n.changeLanguage('ta');
    expect(documentKindLabel(i18n.t, 'invoice', 1)).toBe('விலைப்பட்டியல்');
    expect(documentKindLabel(i18n.t, 'invoice', 2)).toBe('விலைப்பட்டியல்கள்');
  });

  it('works with a fake translator, so callers stay unit-testable', () => {
    const fake = (key: string) => `[${key}]`;
    expect(statusLabel(fake, 'overdue')).toBe('[domain:status.overdue]');
  });
});
