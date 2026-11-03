import type { Expense, Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
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
  it('A1: keeps an edit made while the create is in flight', async () => {
    actions().saveParty(party());
    const release = heldPush();
    const run = syncNow();
    const [create] = queue();

    actions().saveParty(party({ name: 'Edited in flight' }));
    release([{ id: create.id, status: 'applied', entity: { ...party(), id: 'pty_SERVER', version: 1 } }]);
    acceptingServer();
    await run;

    expect(actions().parties.find((p) => p.id === 'pty_SERVER')?.name).toBe('Edited in flight');
    const everySent = POST.mock.calls.flatMap((c) => c[1].body.mutations as Sent[]);
    expect(everySent.some((m) => m.body?.name === 'Edited in flight')).toBe(true);
  });

  it('A1: keeps an edit made while an update is in flight', async () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'First' });
    const release = heldPush();
    const run = syncNow();
    const [entry] = queue();

    actions().saveParty({ ...existing, name: 'Second' });
    release([{ id: entry.id, status: 'applied', entity: { ...existing, name: 'First', version: 2 } }]);
    acceptingServer();
    await run;

    const everySent = POST.mock.calls.flatMap((c) => c[1].body.mutations as Sent[]);
    expect(everySent.some((m) => m.body?.name === 'Second')).toBe(true);
  });

  it('A1: does not bring back a row deleted while its create is in flight', async () => {
    actions().saveParty(party());
    const release = heldPush();
    const run = syncNow();
    const [create] = queue();

    actions().removeParty('pty_offline1');
    release([{ id: create.id, status: 'applied', entity: { ...party(), id: 'pty_SERVER', version: 1 } }]);
    acceptingServer();
    await run;

    expect(actions().parties.some((p) => p.id === 'pty_SERVER' || p.id === 'pty_offline1')).toBe(false);
    const everySent = POST.mock.calls.flatMap((c) => c[1].body.mutations as Sent[]);
    expect(everySent.some((m) => m.method === 'DELETE')).toBe(true);
  });

  it('A2: does not resend an edit under an id the server may already have answered', async () => {
    actions().saveParty(party());
    POST.mockRejectedValueOnce(new TypeError('Network request failed'));
    await syncNow();
    const firstId = sentIn(0)[0].id;

    actions().saveParty(party({ name: 'Edited after a lost response' }));
    acceptingServer();
    await syncNow();

    const edit = POST.mock.calls.slice(1).flatMap((c) => c[1].body.mutations as Sent[]).find((m) => m.body?.name === 'Edited after a lost response');
    expect(edit).toBeDefined();
    expect(edit!.id).not.toBe(firstId);
  });
});

describe('retrying', () => {
  it('A3: leaves an entry that is not failed under its own id', async () => {
    actions().saveParty(party());
    const release = heldPush();
    const run = syncNow();
    const [entry] = queue();

    retrySync(entry.id);
    const idAfterRetry = queue()[0].id;

    // Released before asserting: a push left hanging would stall every later test.
    release([{ id: entry.id, status: 'applied', entity: { ...party(), id: 'pty_SERVER', version: 1 } }]);
    await run;
    expect(idAfterRetry).toBe(entry.id);
    expect(queue()).toHaveLength(0);
  });

  it('A7: "Sync now" does not send a conflicted change over the other device\'s', async () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'Mine' });
    const [entry] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: entry.id, status: 'conflict', entity: { ...existing, name: 'Theirs', version: 3 } }] } });
    await syncNow();

    POST.mockClear();
    acceptingServer();
    await syncAll();

    expect(POST.mock.calls.flatMap((c) => c[1].body.mutations as Sent[])).toHaveLength(0);
    expect(queue()[0].status).toBe('failed');
    expect(queue()[0].conflict).toBeDefined();
  });
});

describe('answers that are not outcomes', () => {
  it('A4: keeps an entry pending under its own id when the server says to send it again', async () => {
    actions().saveParty(party());
    const [entry] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: entry.id, status: 'retry', error: { detail: 'Busy' } }] } });
    await syncNow();

    expect(queue()[0]).toMatchObject({ id: entry.id, status: 'pending', attempts: 1 });
    expect(POST).toHaveBeenCalledTimes(1);

    acceptingServer();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(POST).toHaveBeenCalledTimes(2);
    expect(sentIn(1)[0].id).toBe(entry.id);
    expect(queue()).toHaveLength(0);
  });
});

describe('resilience', () => {
  it('B4: points queued changes at the server\'s defaults when an offline company syncs', async () => {
    const companyId = actions().createCompany({ ...actions().companies[0], name: 'New Co' } as never);
    const localTax = actions().taxCategories.find((x) => x.companyId === companyId && x.rate === 18)!;
    actions().saveItem({ ...actions().items[0], id: 'itm_new', companyId, taxCategoryId: localTax.id } as never);

    const lists: Record<string, unknown[]> = {
      '/companies/{companyId}/tax-categories': [{ id: 'tax_SERVER', companyId: 'cmp_SERVER', rate: 18, version: 1 }],
    };
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
      return { data: { data: lists[path] ?? [], nextCursor: null } };
    });
    POST.mockImplementationOnce(async (_p: string, { body }: { body: { mutations: Sent[] } }) => {
      expect(body.mutations).toHaveLength(1);
      return { data: { results: [{ id: body.mutations[0].id, status: 'applied', entity: { id: 'cmp_SERVER', version: 1 } }] } };
    });
    acceptingServer();
    await syncNow();

    const item = POST.mock.calls[1][1].body.mutations[0] as Sent;
    expect(item.path).toContain('cmp_SERVER');
    expect(item.body).toMatchObject({ taxCategoryId: 'tax_SERVER' });
    expect(actions().taxCategories.some((x) => x.id === localTax.id)).toBe(false);
  });

  it('counts a new company as synced when its plan keeps a defaults list closed', async () => {
    const companyId = actions().createCompany({ ...actions().companies[0], name: 'Free Co' } as never);
    const { ApiError } = jest.requireActual('@esmart/api-client');
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [], cursor: '1', hasMore: false } };
      // Expenses need the pro plan: the server refuses the list on Free.
      if (path === '/companies/{companyId}/expense-categories') throw new ApiError(403, { detail: 'The expenses module needs the pro plan' });
      return { data: { data: [], nextCursor: null } };
    });
    POST.mockImplementation(async (_p: string, { body }: { body: { mutations: Sent[] } }) => ({
      data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { id: 'cmp_FREE', version: 1 } })) },
    }));
    await syncNow();

    expect(queue().filter((e) => e.entityId === companyId || e.entityId === 'cmp_FREE')).toHaveLength(0);
    expect(useRemoteMeta.getState().versions.cmp_FREE).toBe(1);
  });

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

  it('B7: narrows down a refused batch, so one bad entry fails alone', async () => {
    actions().saveParty(party({ id: 'pty_good', name: 'Good' }));
    actions().saveParty(party({ id: 'pty_bad', name: 'Bad' }));
    const { ApiError } = jest.requireActual('@esmart/api-client');
    POST.mockImplementation(async (_p: string, { body }: { body: { mutations: Sent[] } }) => {
      if (body.mutations.some((m) => m.clientEntityId === 'pty_bad')) throw new ApiError(413, { detail: 'Too large' });
      return { data: { results: body.mutations.map((m) => ({ id: m.id, status: 'applied', entity: { id: `srv_${m.clientEntityId}`, version: 1 } })) } };
    });
    await syncNow();

    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ clientEntityId: 'pty_bad', status: 'failed', lastError: 'Too large' });
    expect(useRemoteMeta.getState().cursor).toBe('1');
  });

  it('B7: still pulls when the push fails', async () => {
    actions().saveParty(party());
    const { ApiError } = jest.requireActual('@esmart/api-client');
    POST.mockRejectedValue(new ApiError(500, { detail: 'Boom' }));
    await syncNow();
    expect(useRemoteMeta.getState().cursor).toBe('1');
    expect(useRemoteMeta.getState().lastError).toBe('Boom');
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

  it('B11: uploads a queued receipt once its expense is on the server', async () => {
    const account = actions().paymentAccounts[0];
    const expense = { id: 'exp_1', companyId: BOOK.companyId, branchId: BOOK.branchId, number: 'EXP/1', categoryId: 'cat', date: '2026-09-01', amount: { minor: 100, currency: 'INR' }, currency: 'INR', exchangeRate: 1, accountId: account.id, method: account.type === 'cash' ? 'cash' : 'upi', attachmentIds: [], createdBy: '', createdAt: '2026-09-01T00:00:00Z' } as never as Expense;
    useAppStore.setState({ expenses: [expense] });
    useRemoteMeta.getState().setVersion(expense.id, 1);
    useReceiptQueue.getState().add(expense.id, expense.companyId, 'file:///r.jpg');
    (uploadAttachment as jest.Mock).mockResolvedValueOnce({ id: 'att_1' });
    acceptingServer();
    await syncNow();
    expect(useReceiptQueue.getState().pending).toEqual({});
    expect(actions().expenses.find((e) => e.id === expense.id)?.attachmentIds).toContain('att_1');
  });
});

describe('pulling', () => {
  it('B10: does not overwrite a row with a change still to send', async () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'Mine' });
    const [entry] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: entry.id, status: 'retry' }] } });
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [{ entityType: 'party', entityId: existing.id, op: 'upsert', version: 9, data: { ...existing, name: 'Theirs', version: 9 } }], cursor: '2', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });
    await syncNow();
    expect(actions().parties.find((p) => p.id === existing.id)?.name).toBe('Mine');
  });

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

  it('keeps rows still waiting to send, and the account, when the reload succeeds', async () => {
    actions().saveParty(party());
    const accountId = actions().accountId;
    GET.mockImplementation(async (path: string) => {
      if (path === '/sync/pull') return { data: { changes: [{ op: 'upsert', entityType: 'company', entityId: BOOK.companyId, data: actions().companies[0] }], cursor: '9', hasMore: false } };
      return { data: { data: [], nextCursor: null } };
    });

    await resync();

    expect(actions().parties.map((p) => p.id)).toContain('pty_offline1');
    expect(actions().accountId).toBe(accountId);
    expect(actions().activeCompanyId).toBe(BOOK.companyId);
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
  it('B1: holds a finalise back behind a failed edit of the same document', async () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'draft')!;
    actions().updateDocument(doc.id, { notes: 'Mine' });
    const [edit] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: edit.id, status: 'conflict', entity: { ...doc, notes: 'Theirs', version: 3 } }] } });
    await syncNow();

    POST.mockClear();
    acceptingServer();
    actions().finalizeDocument(doc.id);
    await syncNow();

    const sent = POST.mock.calls.flatMap((c) => c[1].body.mutations as Sent[]);
    expect(sent.some((m) => m.path.endsWith('/finalize'))).toBe(false);
  });

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

  it('B6: deleting a failed create sends nothing', async () => {
    actions().saveParty(party());
    const [create] = queue();
    POST.mockResolvedValueOnce({ data: { results: [{ id: create.id, status: 'rejected', error: { detail: 'No' } }] } });
    await syncNow();

    actions().removeParty('pty_offline1');
    expect(queue()).toHaveLength(0);
  });
});
