import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { all } from '../refresh';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

/** Writes go out and stay out: what each action sends can be read from the outbox meanwhile. */
const hold = () => new Promise(() => undefined);
const POST = api.POST as jest.Mock;
const GET = api.GET as jest.Mock;

installRemote();
const actions = () => useAppStore.getState();
const queue = () => outbox.entries();

/** A pull that brings nothing, and empty owned lists. */
function quietServer() {
  GET.mockImplementation(async (path: string) => {
    if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
    return { data: { data: [], nextCursor: null } };
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  for (const m of [api.POST, api.PUT, api.PATCH, api.DELETE] as jest.Mock[]) m.mockReset().mockImplementation(hold);
  GET.mockReset();
  quietServer();
  useRemoteMeta.getState().reset();
  const seed = buildTestBook();
  useAppStore.setState({
    ...seed,
    syncQueue: [],
    activeCompanyId: BOOK.companyId,
    activeBranchId: BOOK.branchId,
    session: { userId: seed.users[0].id, authenticated: true, onboardingComplete: true },
  });
  // Everything in the book counts as already on the server, at version 1.
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions });
});

afterEach(() => jest.useRealTimers());

describe('document actions', () => {
  it('sends a finalise against the version this device saw', () => {
    const doc = actions().documents.find((d) => d.status === 'draft') ?? actions().documents[0];
    actions().finalizeDocument(doc.id);
    const entry = queue().find((e) => e.path.endsWith('/finalize'));
    expect(entry).toMatchObject({ baseVersion: 1 });
  });
});

describe('paging lists', () => {
  it('reads past 4,000 rows, and stops a newest-first list at its cut-off', async () => {
    let calls = 0;
    const rows = await all(async (cursor?: string) => {
      calls++;
      const page = Number(cursor ?? 0);
      return { data: Array.from({ length: 200 }, (_, i) => ({ n: page * 200 + i })), nextCursor: page < 29 ? String(page + 1) : null };
    });
    expect(rows).toHaveLength(6000);
    expect(calls).toBe(30);

    const recentOnly = await all(
      async (cursor?: string) => ({ data: cursor ? [{ age: 3 }, { age: 4 }] : [{ age: 1 }, { age: 2 }], nextCursor: cursor ? '2' : '1' }),
      (r) => r.age < 4,
    );
    expect(recentOnly).toEqual([{ age: 1 }, { age: 2 }, { age: 3 }]);
  });
});
