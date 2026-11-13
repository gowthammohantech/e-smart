import type { Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { onboardingSeries } from '../../store/onboardingStore';
import { DEFAULT_PREFIXES, SERIES_KINDS, defaultSeries } from '@esmart/core/domain/numbering';
import { api } from '../api';
import { installRemote } from '../install';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';

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

describe('queueing', () => {
  it('creates offline entities with their own id, and folds later edits into that create', () => {
    actions().saveParty(party());
    actions().saveParty(party({ name: 'Offline Traders LLP' }));
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'POST', path: `/companies/${BOOK.companyId}/parties`, clientEntityId: 'pty_offline1', status: 'pending' });
    expect((queue()[0].body as Party).name).toBe('Offline Traders LLP');
  });

  it('updates what the server knows with a PUT against its version', () => {
    const existing = actions().parties[0];
    actions().saveParty({ ...existing, name: 'Renamed' });
    actions().saveParty({ ...existing, name: 'Renamed again' });
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'PUT', path: `/companies/${BOOK.companyId}/parties/${existing.id}`, baseVersion: 1 });
    expect((queue()[0].body as Party).name).toBe('Renamed again');
  });

  it('forgets an offline create that is deleted before it syncs', () => {
    actions().saveParty(party());
    actions().removeParty('pty_offline1');
    expect(queue()).toHaveLength(0);
  });

  it('never sends derived statuses, and queues one request for a nested action', () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'issued')!;
    actions().setDocumentStatus(doc.id, 'paid');
    expect(queue()).toHaveLength(0);

    const copyId = actions().duplicateDocument(doc.id);
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ method: 'POST', path: `/companies/${BOOK.companyId}/documents/${doc.id}/duplicate`, clientEntityId: copyId });
  });

  it('passes an accepted credit-limit override to the server, and only then', () => {
    const doc = actions().documents.find((d) => d.kind === 'invoice' && d.status === 'draft')!;
    actions().setDocumentStatus(doc.id, 'issued', { overrideCreditLimit: true });
    actions().setDocumentStatus(doc.id, 'cancelled');
    expect(queue().map((e) => e.body)).toEqual([{ status: 'issued', overrideCreditLimit: true }, { status: 'cancelled' }]);
  });

  it('applies onboarding\'s financial-year choice to every series a new business starts with, each keeping its prefix', () => {
    const made = SERIES_KINDS.map((kind) => defaultSeries('', kind, DEFAULT_PREFIXES[kind]));
    const sent = onboardingSeries(made, { invoicePrefix: 'NF', invoiceNextNumber: '7', includeFiscalYear: false });
    expect(sent).toHaveLength(made.length);
    expect(sent.every((s) => s.includeFiscalYear === false)).toBe(true);
    expect(sent.find((s) => s.kind === 'invoice')).toMatchObject({ prefix: 'NF', nextNumber: 7 });
    expect(sent.find((s) => s.kind === 'quote')).toMatchObject({ prefix: 'QT', nextNumber: 1 });
    // Left on (the default), only the invoice series changes.
    expect(onboardingSeries(made, { invoicePrefix: 'NF', invoiceNextNumber: '7', includeFiscalYear: true }).map((s) => s.kind)).toEqual(['invoice']);
  });
});

