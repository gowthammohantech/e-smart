import type { Expense, Party } from '@esmart/core/types';
import { BOOK, buildTestBook } from '../../__fixtures__/book';
import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { installRemote } from '../install';
import { useRemoteMeta } from '../meta';
import * as outbox from '../outbox';
import { uploadAttachment } from '../attachments';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../attachments', () => ({ uploadAttachment: jest.fn() }));
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
  const versions: Record<string, number> = {};
  for (const list of [seed.parties, seed.documents, seed.payments, seed.items, seed.companies]) for (const x of list) versions[x.id] = 1;
  useRemoteMeta.setState({ versions });
});

afterEach(() => jest.useRealTimers());

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

  it('a new document keeps everything the editor sends, and sends it on', () => {
    const inv = actions().documents.find((d) => d.kind === 'invoice')!;
    const id = actions().createDocument({
      kind: 'invoice',
      partyId: inv.partyId,
      date: '2026-09-20',
      currency: inv.currency,
      exchangeRate: inv.exchangeRate,
      lines: inv.lines,
      vehicleId: 'veh_1',
      transporterId: 'trn_1',
      costCentreId: 'cc_1',
      customFields: { cf1: 'LR-9' },
      tdsRate: 2,
    } as never);
    expect(actions().documents.find((d) => d.id === id)).toMatchObject({ vehicleId: 'veh_1', transporterId: 'trn_1', costCentreId: 'cc_1', customFields: { cf1: 'LR-9' }, tdsRate: 2 });
    expect(queue().find((e) => e.clientEntityId === id)?.body).toMatchObject({ vehicleId: 'veh_1', transporterId: 'trn_1', costCentreId: 'cc_1', customFields: { cf1: 'LR-9' } });

    const note = actions().createDocument({ kind: 'creditNote', partyId: inv.partyId, date: '2026-09-21', currency: inv.currency, exchangeRate: inv.exchangeRate, lines: inv.lines, noteReason: 'discount', noteGst: 'withGst', originalNumber: 'SI/1', originalDate: '2026-09-01' } as never);
    expect(actions().documents.find((d) => d.id === note)).toMatchObject({ noteGst: 'withGst', originalNumber: 'SI/1', originalDate: '2026-09-01' });
  });

  it('sales orders merged into one delivery note carry all their lines, and go to the server as alsoFrom', () => {
    const inv = actions().documents.find((d) => d.kind === 'invoice' && d.lines.length > 1)!;
    const order = (line: (typeof inv.lines)[number], date: string) =>
      actions().createDocument({ kind: 'salesOrder', partyId: inv.partyId, date, currency: inv.currency, exchangeRate: inv.exchangeRate, lines: [line], status: 'confirmed' });
    const later = order(inv.lines[1], '2026-09-20');
    const first = order(inv.lines[0], '2026-09-10');
    const id = actions().convertDocument(first, 'delivery', undefined, [later]);
    const copy = actions().documents.find((d) => d.id === id)!;
    expect(copy).toMatchObject({ kind: 'delivery', sourceDocumentId: first, mergedSourceIds: [later] });
    expect(copy.lines.map((l) => l.name)).toEqual([inv.lines[0].name, inv.lines[1].name]);
    // Both are carried forward: neither converts again on its own.
    expect(actions().convertDocument(later, 'delivery')).toBe('');
    const convert = queue().find((e) => e.path.endsWith('/convert'))!;
    expect(convert.body).toMatchObject({ targetKind: 'delivery', alsoFrom: [later] });
    // Only where the conversion merges.
    expect(actions().convertDocument(order(inv.lines[0], '2026-09-21'), 'invoice', undefined, [order(inv.lines[1], '2026-09-22')])).toBe('');
  });

});
