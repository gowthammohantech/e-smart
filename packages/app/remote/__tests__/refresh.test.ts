import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { endRefreshSession, loadCompany, refreshNow } from '../refresh';
import { startUp, useStartup } from '../session';
import { getTokens } from '../tokens';
import { takeLegacyBook } from '../../store/legacyBook';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../tokens', () => ({ getTokens: jest.fn(async () => null), setTokens: jest.fn(async () => {}), onTokensChange: () => () => {} }));
jest.mock('../push', () => ({ unregisterPush: async () => {} }));
jest.mock('../../store/legacyBook', () => ({ takeLegacyBook: jest.fn(async () => null) }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const GET = api.GET as jest.Mock;
const PUT = api.PUT as jest.Mock;
const tokens = getTokens as jest.Mock;
const legacy = takeLegacyBook as jest.Mock;

installRemote();
const actions = () => useAppStore.getState();

/** A server with these lists; anything else is empty. */
function server(lists: Record<string, unknown>) {
  GET.mockImplementation(async (path: string) => {
    if (path in lists) return { data: lists[path] };
    return { data: { data: [], nextCursor: null } };
  });
}

const me = (over: Record<string, unknown> = {}) => {
  const seed = buildTestBook();
  return { accountId: 'acc_1', user: seed.users[0], companies: seed.companies, defaultCompanyId: BOOK.companyId, onboardingComplete: true, ...over };
};

beforeEach(() => {
  for (const m of [GET, PUT]) m.mockReset();
  tokens.mockReset().mockResolvedValue(null);
  legacy.mockReset().mockResolvedValue(null);
  useRemoteMeta.getState().reset();
  const seed = buildTestBook();
  useAppStore.setState({ ...seed, syncQueue: [], activeCompanyId: BOOK.companyId, activeBranchId: BOOK.branchId, session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true } });
});

describe("loading a business's setup", () => {
  it("replaces each setup list with the server's, and keeps their versions for edits", async () => {
    server({
      '/companies/{companyId}/tax-categories': { data: [{ id: 'tax_server', companyId: BOOK.companyId, name: 'GST 18%', rate: 18, version: 4 }], nextCursor: null },
    });
    await loadCompany(BOOK.companyId);
    const taxes = actions().taxCategories.filter((x) => x.companyId === BOOK.companyId);
    expect(taxes.map((x) => x.id)).toEqual(['tax_server']);
    expect(useRemoteMeta.getState().versions.tax_server).toBe(4);
  });

  it('leaves the business as it was when a list cannot be reached', async () => {
    const before = actions().taxCategories;
    GET.mockRejectedValue(new TypeError('Network request failed'));
    await expect(loadCompany(BOOK.companyId)).rejects.toThrow(TypeError);
    expect(actions().taxCategories).toBe(before);
  });

  it('edits a team member the refresh brought in, rather than inviting them again', async () => {
    const user = actions().users[0];
    server({ '/me': me(), '/users': { data: [{ ...user, version: 3 }] } });
    await refreshNow();
    let answer!: () => void;
    PUT.mockImplementation(() => new Promise((r) => (answer = () => r({ data: { ...user, name: 'Renamed', version: 4 } }))));
    actions().saveUser({ ...user, name: 'Renamed' });
    expect(outbox.entries()[0]).toMatchObject({ method: 'PUT', path: `/users/${user.id}`, baseVersion: 3 });
    // Saves go one at a time: let this one finish, or the next test's waits behind it.
    await new Promise((r) => setTimeout(r, 0));
    answer();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('forgets a business the server no longer lists for this person', async () => {
    const second = { ...actions().companies[0], id: 'cmp_gone', name: 'Gone Co' };
    useAppStore.setState({ companies: [...actions().companies, second] });
    server({ '/me': me() });
    await refreshNow();
    expect(actions().companies.some((c) => c.id === 'cmp_gone')).toBe(false);
  });

  it('drops a late answer from a session that has ended', async () => {
    let release!: () => void;
    GET.mockImplementation((path: string) =>
      path === '/me' ? new Promise((r) => (release = () => r({ data: me({ companies: [] }) }))) : Promise.resolve({ data: { data: [], nextCursor: null } }),
    );
    const run = refreshNow();
    await new Promise((r) => setTimeout(r, 0));
    endRefreshSession();
    const companies = actions().companies;
    release();
    await run;
    expect(actions().companies).toBe(companies);
  });
});

describe('opening the app', () => {
  beforeEach(() => useAppStore.setState({ hydrated: false, session: { userId: null, authenticated: false, onboardingComplete: false } }));

  it('opens signed out when there is no session on the device', async () => {
    await startUp();
    expect(actions().hydrated).toBe(true);
    expect(actions().session.authenticated).toBe(false);
    expect(useStartup.getState().state).toBe('ready');
  });

  it("loads a signed-in person's business from the server before the first screen", async () => {
    tokens.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    server({ '/me': me(), '/companies/{companyId}/branches': { data: [{ id: 'brn_server', companyId: BOOK.companyId, name: 'Main', isPrimary: true, version: 1 }], nextCursor: null } });
    await startUp();
    expect(actions().session).toMatchObject({ authenticated: true, onboardingComplete: true });
    expect(actions().activeCompanyId).toBe(BOOK.companyId);
    expect(actions().activeBranchId).toBe('brn_server');
    expect(actions().hydrated).toBe(true);
  });

  it('sends what an offline-first build left unsent, for the same person', async () => {
    const user = buildTestBook().users[0];
    const existing = actions().parties[0];
    tokens.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    legacy.mockResolvedValue({
      userId: user.id,
      activeCompanyId: BOOK.companyId,
      syncQueue: [
        { id: '44444444-4444-4444-8444-444444444444', label: 'A', entityType: 'party', entityId: existing.id, action: 'update', status: 'pending', attempts: 0, queuedAt: '2026-11-01T00:00:00Z', method: 'PUT', path: `/companies/${BOOK.companyId}/parties/${existing.id}`, body: { ...existing, name: 'Kept' }, baseVersion: 1 },
      ],
    });
    server({ '/me': me() });
    PUT.mockResolvedValue({ data: { ...existing, name: 'Kept', version: 2 } });
    await startUp();
    await new Promise((r) => setTimeout(r, 0));
    await refreshNow();
    expect(PUT).toHaveBeenCalledWith(`/companies/${BOOK.companyId}/parties/${existing.id}`, expect.objectContaining({ headers: { 'If-Match': '"v1"' } }));
    expect(outbox.entries()).toHaveLength(0);
  });

  // Last: a start that couldn't reach the server keeps what it read of the old book for its retry.
  it('waits on a "no connection" screen instead of guessing, when the server cannot be reached', async () => {
    tokens.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    GET.mockRejectedValue(new TypeError('Network request failed'));
    await startUp();
    expect(useStartup.getState().state).toBe('offline');
    expect(actions().hydrated).toBe(false);
  });
});
