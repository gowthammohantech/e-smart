import { base64Utf8, sha256Hex } from '@/lib/sha256';

describe('sha256', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('handles input that crosses a block boundary', () => {
    expect(sha256Hex('a'.repeat(1000))).toHaveLength(64);
    expect(sha256Hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });

  it('encodes multi-byte characters', () => {
    expect(sha256Hex('₹')).toHaveLength(64);
    expect(sha256Hex('₹')).not.toBe(sha256Hex('?'));
  });

  it('base64-encodes with padding', () => {
    expect(base64Utf8('a')).toBe('YQ==');
    expect(base64Utf8('ab')).toBe('YWI=');
    expect(base64Utf8('abc')).toBe('YWJj');
  });
});
