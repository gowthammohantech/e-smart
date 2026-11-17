import { setSandboxGstinsAllowed } from '../../domain/gstin';
import { validGstin } from '../validators';

describe('validGstin (the form rule)', () => {
  afterEach(() => setSandboxGstinsAllowed(false));

  it('accepts a real GSTIN and rejects a tampered one', () => {
    expect(validGstin('27AAPFU0939F1ZV')).toBeUndefined();
    expect(validGstin('27AAPFU0939F1ZX')).toBeDefined();
  });

  it('rejects a sandbox test GSTIN unless sandboxes are on', () => {
    expect(validGstin('27AMBPG7773M016')).toBeDefined();
    setSandboxGstinsAllowed(true);
    expect(validGstin('27AMBPG7773M016')).toBeUndefined();
    expect(validGstin('29AAGCB1286Q000')).toBeUndefined();
  });

  it('still rejects nonsense when sandboxes are on', () => {
    setSandboxGstinsAllowed(true);
    expect(validGstin('NOTAGSTIN123456')).toBeDefined();
  });
});
