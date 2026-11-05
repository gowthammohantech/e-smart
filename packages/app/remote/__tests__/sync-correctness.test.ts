import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { all, syncNow } from '../sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

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
  // The outbox at work: changes are kept on the device and sent when the server can be reached.
  useConnectivity.setState({ mode: 'draining', promptOpen: false });
  jest.useFakeTimers();
  POST.mockReset();
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

describe('a payment and an edit of the invoice it pays', () => {
  it('sends the edit after the payment, on the version the payment left', async () => {
    const invoice = actions().documents.find((d) => d.kind === 'invoice')!;
    const template = actions().payments[0];
    actions().savePayment({ ...template, id: 'pay_offline1', number: '', amount: { minor: 100, currency: invoice.currency }, allocations: [{ documentId: invoice.id, amount: { minor: 100, currency: invoice.currency } }] } as never);
    actions().updateDocument(invoice.id, { notes: 'Edited after the payment' });

    const batches: { path: string; baseVersion?: number }[][] = [];
    POST.mockImplementation(async (path: string, opts: { body: { mutations: { id: string; path: string; baseVersion?: number; clientEntityId?: string; body?: unknown }[] } }) => {
      if (path !== '/sync/push') return { data: {} };
      const mutations = opts.body.mutations;
      batches.push(mutations.map((m) => ({ path: m.path, baseVersion: m.baseVersion })));
      return {
        data: {
          results: mutations.map((m) =>
            m.path.endsWith('/payments')
              ? { id: m.id, status: 'applied', entity: { ...(m.body as object), id: 'pay_SERVER', version: 1 } }
              : { id: m.id, status: 'applied', entity: { ...invoice, notes: 'Edited after the payment', version: 6 } },
          ),
        },
      };
    });
    GET.mockImplementation(async (path: string) => {
      if (path === '/companies/{companyId}/documents/{id}') return { data: { ...invoice, version: 5 } };
      if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();

    // The payment went alone; the edit followed, on the version the payment left (5, not 1).
    expect(batches[0].map((m) => m.path)).toEqual([expect.stringMatching(/\/payments$/)]);
    expect(batches[1]).toEqual([{ path: expect.stringContaining(`/documents/${invoice.id}`), baseVersion: 5 }]);
    expect(queue()).toHaveLength(0);
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
