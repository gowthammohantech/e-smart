import en from '@/i18n/locales/en';
import ta from '@/i18n/locales/ta';
import { NAMESPACES } from '@/i18n/config';

type Tree = { [k: string]: string | string[] | Tree };

/** Every leaf path in a namespace, e.g. `action.save`. */
function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && !Array.isArray(v) ? leaves(v as Tree, path) : [path];
  });
}

function leafAt(tree: Tree, path: string): string | string[] | undefined {
  return path.split('.').reduce<unknown>((acc, k) => (acc as Tree)?.[k], tree) as
    | string
    | string[]
    | undefined;
}

function entries(tree: Tree): [string, string][] {
  return leaves(tree)
    .map((p) => [p, leafAt(tree, p)] as const)
    .filter((e): e is readonly [string, string] => typeof e[1] === 'string')
    .map(([p, v]) => [p, v]);
}

const catalogues = { en: en as unknown as Record<string, Tree>, ta: ta as unknown as Record<string, Tree> };

/** `{{name}}` placeholders, ignoring i18next formatting suffixes. */
function params(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

/**
 * Latin runs allowed inside a Tamil value: statutory identifiers, brand names
 * and unit tokens that deliberately stay in the Latin script. Anything else
 * Latin in a `ta` value means the key was never translated — key parity cannot
 * catch that, because a copy-pasted English value has a perfectly valid key.
 */
const TA_LATIN_ALLOWLIST =
  /^(GST|GSTIN|GSTR|HSN|SAC|UQC|IRN|IRP|PAN|TRN|CGST|SGST|IGST|VAT|B2B|B2C|FY|PDF|OTP|CSV|QR|UPI|OCR|AI|Google|WhatsApp|Lixi|Elixir|Books|Smart|ERP|Basic|Pro|Business|Free|K|L|Cr|M|B|AM|PM|e|E)$/;

function suspiciousLatin(value: string): string[] {
  const withoutParams = value
    // `{{count}}` is Latin by definition.
    .replace(/\{\{[^}]*\}\}/g, ' ')
    // Identifiers and format examples mix letters and digits — a GSTIN sample
    // like 27AABCV1234F1ZO must stay verbatim. Prose words do not do this.
    .replace(/\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]+\b/g, ' ');
  return [...withoutParams.matchAll(/[A-Za-z][A-Za-z.'-]*/g)]
    .map((m) => m[0].replace(/[.'-]+$/, ''))
    .filter((w) => w && !TA_LATIN_ALLOWLIST.test(w));
}

describe('i18n catalogues', () => {
  it('ships the same namespaces in both locales', () => {
    expect(Object.keys(catalogues.en).sort()).toEqual([...NAMESPACES].sort());
    expect(Object.keys(catalogues.ta).sort()).toEqual([...NAMESPACES].sort());
  });

  describe.each([...NAMESPACES])('%s', (ns) => {
    const enNs = catalogues.en[ns];
    const taNs = catalogues.ta[ns];

    it('has identical key sets', () => {
      expect(leaves(taNs).sort()).toEqual(leaves(enNs).sort());
    });

    it('has no empty values', () => {
      for (const [locale, tree] of [['en', enNs], ['ta', taNs]] as const) {
        for (const [key, value] of entries(tree)) {
          expect(`${locale}:${ns}:${key}=${JSON.stringify(value)}`).toBe(
            `${locale}:${ns}:${key}=${JSON.stringify(value)}`,
          );
          expect(value.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('keeps the same interpolation params in both locales', () => {
      for (const [key, enValue] of entries(enNs)) {
        const taValue = leafAt(taNs, key);
        if (typeof taValue !== 'string') continue;
        expect({ key, params: params(taValue) }).toEqual({ key, params: params(enValue) });
      }
    });

    it('pairs every _one with an _other, and uses no other plural suffix', () => {
      for (const [locale, tree] of [['en', enNs], ['ta', taNs]] as const) {
        const keys = leaves(tree);
        for (const key of keys) {
          const suffix = /_(\w+)$/.exec(key)?.[1];
          if (!suffix) continue;
          // Both locales are CLDR two-category (one/other).
          expect({ locale, key, suffix }).toEqual({ locale, key, suffix: expect.stringMatching(/^(one|other)$/) });
          const sibling = suffix === 'one' ? key.replace(/_one$/, '_other') : key.replace(/_other$/, '_one');
          expect(`${locale}:${ns}:${sibling}`).toBe(
            keys.includes(sibling) ? `${locale}:${ns}:${sibling}` : `${locale}:${ns}:${sibling} (missing)`,
          );
        }
      }
    });

    it('has no untranslated English left in the Tamil values', () => {
      for (const [key, value] of entries(taNs)) {
        expect({ key, latin: suspiciousLatin(value) }).toEqual({ key, latin: [] });
      }
    });
  });

  /**
   * The tab bar renders at fontSize 10 with up to seven tabs, and
   * `adjustsFontSizeToFit` is iOS-only — so on Android the labels have to fit
   * on their own. Tamil runs 30-40% longer than English, so the budget is
   * enforced rather than hoped for.
   */
  it('keeps every tab label within the 9-grapheme budget', () => {
    for (const [locale, cat] of Object.entries(catalogues)) {
      const tabs = (cat.nav as Tree)?.tab;
      if (!tabs) continue;
      for (const [key, value] of entries(tabs as Tree)) {
        expect({ locale, key, len: [...value].length }).toEqual({
          locale,
          key,
          len: expect.any(Number),
        });
        expect([...value].length).toBeLessThanOrEqual(9);
      }
    }
  });
});
