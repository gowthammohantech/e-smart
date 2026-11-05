import { getTokens, onTokensChange, setTokens, takeTokensFromOtherTab } from '../tokens';

// Hoisted above the import by jest.
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));


describe('tokens from another tab', () => {
  it('takes a rotated pair, so this tab refreshes with the live token', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });
    takeTokensFromOtherTab('ebs.auth.tokens', JSON.stringify({ accessToken: 'a2', refreshToken: 'r2' }));
    expect(await getTokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('signs this tab out when another one did, or cleared storage', async () => {
    const seen: unknown[] = [];
    const off = onTokensChange((t) => seen.push(t));
    await setTokens({ accessToken: 'a', refreshToken: 'r' });
    takeTokensFromOtherTab('ebs.auth.tokens', null);
    expect(await getTokens()).toBeNull();
    await setTokens({ accessToken: 'a', refreshToken: 'r' });
    takeTokensFromOtherTab(null, null);
    expect(await getTokens()).toBeNull();
    expect(seen.filter((t) => t === null)).toHaveLength(2);
    off();
  });

  it('ignores other keys and garbage', async () => {
    await setTokens({ accessToken: 'a', refreshToken: 'r' });
    takeTokensFromOtherTab('ebs.remote.v1', '{}');
    takeTokensFromOtherTab('ebs.auth.tokens', '{not json');
    expect(await getTokens()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
});
