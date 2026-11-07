import type { Expense, Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useConnectivity } from '../connectivity';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { retrySync, syncAll } from '../retry';
import { resync } from '../session';
import { uploadAttachment } from '../attachments';
import { useReceiptQueue } from '../receiptQueue';
import { endSyncSession, syncNow } from '../sync';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../attachments', () => ({ uploadAttachment: jest.fn() }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const POST = api.POST as jest.Mock;
const GET = api.GET as jest.Mock;

installRemote();
const actions = () => useAppStore.getState();
const queue = () => outbox.entries();

type Sent = { id: string; method: string; path: string; body?: Record<string, unknown>; baseVersion?: number; clientEntityId?: string };

function party(over: Partial<Party> = {}): Party {
  return {
    id: 'pty_offline1',
    companyId: BOOK.companyId,
    kind: 'customer',
    name: 'Offline Traders',
    code: 'C-900',
    currency: 'INR',
    billingAddress: { line1: '1 Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' },
    openingBalance: { minor: 0, currency: 'INR' },
    paymentTermsDays: 30,
    status: 'active',
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  } as Party;
}

function quietServer() {
  GET.mockImplementation(async (path: string) => {
    if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
    return { data: { data: [], nextCursor: null } };
  });
}

/** A push whose answer the test releases by hand, to act while it is in flight. */
function heldPush() {
  let release!: (results: unknown[]) => void;
  POST.mockImplementationOnce(() => new Promise((resolve) => (release = (results) => resolve({ data: { results } }))));
  return (results: unknown[]) => release(results);
}

/** Answers every push as applied, giving each create a server id. */
function acceptingServer() {
  POST.mockImplementation(async (_path: string, { body }: { body: { mutations: Sent[] } }) => ({
    data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { ...(m.body ?? {}), id: m.clientEntityId ? `srv_${m.clientEntityId}` : undefined, version: 2 } })) },
  }));
}

const sentIn = (call: number) => POST.mock.calls[call][1].body.mutations as Sent[];

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
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions });
});

afterEach(() => jest.useRealTimers());

describe('changes made after an entry was sent', () => {

});

describe('retrying', () => {

});

describe('resilience', () => {

  it('pulls a business again once its plan changes, for what the old plan could not read', async () => {
    const id = BOOK.companyId;
    useRemoteMeta.getState().patch({ plans: { [id]: 'free' } });
    useAppStore.setState({ companies: actions().companies.map((c) => (c.id === id ? { ...c, plan: 'pro' } : c)) });
    const category = { id: 'exc_SERVER', companyId: id, name: 'Rent', version: 1 };
    GET.mockImplementation(async (path: string, opts?: { params?: { query?: { companyId?: string } } }) => {
      if (path === '/sync/pull') {
        // Only a pull of that business from the start brings what Free kept back.
        const changes = opts?.params?.query?.companyId === id ? [{ op: 'upsert', entityType: 'expense_category', entityId: category.id, data: category }] : [];
        return { data: { changes, cursor: '1', hasMore: false } };
      }
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();

    expect(actions().expenseCategories.some((c) => c.id === category.id)).toBe(true);
    expect(useRemoteMeta.getState().plans[id]).toBe('pro');
  });

  it('B9: drops a late answer from a session that has ended', async () => {
    let answer!: (v: unknown) => void;
    GET.mockImplementation((path: string) =>
      path === '/sync/pull' ? new Promise((resolve) => (answer = resolve)) : Promise.resolve({ data: { data: [], nextCursor: null } }),
    );
    const doc = actions().documents[0];
    const run = syncNow();
    while (!answer) await Promise.resolve();
    endSyncSession();
    answer({ data: { changes: [{ entityType: 'document', entityId: doc.id, op: 'upsert', version: 9, data: { ...doc, number: 'LATE', version: 9 } }], cursor: '99', hasMore: false } });
    await run;
    expect(actions().documents.find((d) => d.id === doc.id)?.number).not.toBe('LATE');
    expect(useRemoteMeta.getState().cursor).not.toBe('99');
  });

});

describe('pulling', () => {

  it('A9c: loads a business joined on another device, whose history is behind the cursor', async () => {
    GET.mockImplementation(async (path: string, opts?: { params?: { query?: { companyId?: string } } }) => {
      if (path === '/me') return { data: { companies: [{ id: 'cmp_joined' }] } };
      if (path === '/sync/pull' && opts?.params?.query?.companyId === 'cmp_joined') {
        return { data: { changes: [{ entityType: 'company', entityId: 'cmp_joined', op: 'upsert', version: 1, data: { ...actions().companies[0], id: 'cmp_joined', version: 1 } }], cursor: '9', hasMore: false } };
      }
      if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();
    expect(actions().companies.some((c) => c.id === 'cmp_joined')).toBe(true);
    expect(useRemoteMeta.getState().cursor).toBe('1');
  });
});

describe('reloading', () => {
  it('A6: keeps the book when the reload cannot reach the server', async () => {
    const before = actions().documents.length;
    expect(before).toBeGreaterThan(0);
    GET.mockRejectedValue(new TypeError('Network request failed'));

    await resync().catch(() => undefined);

    expect(actions().documents).toHaveLength(before);
  });

  it('opens a business that is still there when the active one did not come back', async () => {
    const other = { ...actions().companies[0], id: 'cmp_other' };
    useAppStore.setState({ activeCompanyId: 'cmp_gone' });
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [{ op: 'upsert', entityType: 'company', entityId: other.id, data: other }], cursor: '9', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });

    await resync();

    expect(actions().activeCompanyId).toBe('cmp_other');
  });
});

describe('entries that depend on each other', () => {

  it('B2: keeps the target kind when a converted document is edited before it syncs', () => {
    const source = actions().documents.find((d) => d.kind === 'invoice')!;
    const copy = actions().convertDocument(source.id, 'salesReturn');
    actions().updateDocument(copy, { notes: 'Edited' });
    const convert = queue().find((e) => e.path.endsWith('/convert'))!;
    expect(convert.body).toMatchObject({ targetKind: 'salesReturn' });
  });

  it('B2: keeps the target kind when a converted document is finalised before it syncs', () => {
    const source = actions().documents.find((d) => d.kind === 'invoice')!;
    const copy = actions().convertDocument(source.id, 'salesReturn');
    actions().setDocumentStatus(copy, 'issued');
    const convert = queue().find((e) => e.path.endsWith('/convert'))!;
    expect(convert.body).toMatchObject({ targetKind: 'salesReturn' });
  });

  it('a document converted offline keeps the PO number and supplier bill number', () => {
    const source = actions().documents.find((d) => d.kind === 'invoice')!;
    actions().updateDocument(source.id, { reference: 'PO-4471', supplierDocNumber: 'SB-88' });
    const id = actions().convertDocument(source.id, 'delivery');
    const copy = actions().documents.find((d) => d.id === id)!;
    expect(copy).toMatchObject({ reference: 'PO-4471', supplierDocNumber: 'SB-88', sourceDocumentId: source.id });
  });

  it('a return converted offline starts as requested, so it can be approved and posted', () => {
    const source = actions().documents.find((d) => d.kind === 'invoice')!;
    const id = actions().convertDocument(source.id, 'salesReturn');
    const copy = actions().documents.find((d) => d.id === id)!;
    expect(copy.status).toBe('requested');
  });

  it('a note against some of an invoice\'s lines copies only those, and sends them to the server', () => {
    const source = actions().documents.find((d) => d.kind === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled' && d.lines.length > 1)!;
    const keep = [source.lines[1].id];
    const id = actions().convertDocument(source.id, 'creditNote', keep);
    const copy = actions().documents.find((d) => d.id === id)!;
    expect(copy.lines.map((l) => l.name)).toEqual([source.lines[1].name]);
    const convert = queue().find((e) => e.path.endsWith('/convert'))!;
    expect(convert.body).toMatchObject({ targetKind: 'creditNote', lineIds: keep });
  });

  it('B2: keeps the chosen numbering when a pending company is edited', () => {
    const companyId = actions().createCompany({ ...actions().companies[0], name: 'New Co' } as never);
    const series = actions().numberingSeries.find((s) => s.companyId === companyId && s.kind === 'invoice')!;
    actions().saveNumberingSeries({ ...series, prefix: 'NC', nextNumber: 101 });
    const company = actions().companies.find((c) => c.id === companyId)!;
    actions().saveCompany({ ...company, name: 'Newer Co' });
    expect(queue()[0].body).toMatchObject({ name: 'Newer Co', numberingSeries: [{ kind: 'invoice', prefix: 'NC' }] });
  });

  it('B3: a queued status change does not make the next edit conflict with itself', async () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'draft')!;
    // Behaves as the server does: each write bumps the version, a stale If-Match gets 412.
    let version = 1;
    POST.mockImplementation(async (_path: string, { body }: { body: { mutations: Sent[] } }) => ({
      data: {
        results: body.mutations.map((m) => {
          if (m.baseVersion !== undefined && m.baseVersion !== version) return { id: m.id, status: 'conflict', entity: { ...doc, version } };
          version += 1;
          return { id: m.id, status: 'applied', entity: { ...doc, version } };
        }),
      },
    }));

    actions().setDocumentStatus(doc.id, 'issued');
    actions().updateDocument(doc.id, { notes: 'After issuing' });
    await syncNow();

    expect(queue().filter((e) => e.status === 'failed')).toHaveLength(0);
  });

  it('B5: edits a team member the server already knows instead of inviting them', async () => {
    const user = actions().users[0];
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
      if (path === '/users') return { data: { data: [{ ...user, version: 3 }] } };
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();

    actions().saveUser({ ...user, name: 'Renamed' });
    expect(queue()[0]).toMatchObject({ method: 'PUT', path: `/users/${user.id}`, baseVersion: 3 });
  });

  it('B6: folds an edit into a failed create instead of queuing a second create', async () => {
    actions().saveParty(party());
    const [create] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: create.id, status: 'rejected', error: { detail: 'No' } }] } });
    await syncNow();

    actions().saveParty(party({ name: 'Fixed' }));
    expect(queue().filter((e) => e.method === 'POST' && e.clientEntityId === 'pty_offline1')).toHaveLength(1);
  });
});
