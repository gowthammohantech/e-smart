import { useAppStore } from '../../store/appStore';
import { api } from '../api';
import { useRemoteMeta } from '../meta';
import { fetchDocumentRecord } from '../queries';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../api', () => ({ api: { GET: jest.fn(), POST: jest.fn() }, isNetworkError: () => false }));

const GET = api.GET as jest.Mock;
const doc = (version: number) => ({
  id: 'doc_1',
  companyId: 'cmp',
  kind: 'invoice',
  number: 'INV/26-27/0001',
  partyId: 'pty_1',
  version,
  party: { id: 'pty_1', companyId: 'cmp', name: 'Sunrise Retail', kind: 'customer', version: 3 },
  payments: [{ id: 'pay_1', companyId: 'cmp', version: 1 }],
});

beforeEach(() => {
  useAppStore.setState({ documents: [], parties: [], payments: [], syncQueue: [] } as never);
  useRemoteMeta.getState().reset();
  GET.mockReset();
});

describe('opening a document from the server', () => {
  it('keeps it, its payments and its party in the store, as sync would', async () => {
    GET.mockResolvedValue({ data: doc(1) });
    await fetchDocumentRecord('cmp', 'doc_1');
    const s = useAppStore.getState();
    expect(s.documents.map((d) => d.id)).toEqual(['doc_1']);
    expect(s.payments.map((p) => p.id)).toEqual(['pay_1']);
    expect(s.parties.map((p) => p.id)).toEqual(['pty_1']);
    expect(useRemoteMeta.getState().versions.doc_1).toBe(1);
  });

  it('leaves the store alone when nothing changed, so no list refetches and nothing loops', async () => {
    GET.mockResolvedValue({ data: doc(1) });
    await fetchDocumentRecord('cmp', 'doc_1');
    const before = useAppStore.getState();
    await fetchDocumentRecord('cmp', 'doc_1');
    const after = useAppStore.getState();
    expect(after.documents).toBe(before.documents);
    expect(after.parties).toBe(before.parties);
    expect(after.payments).toBe(before.payments);
  });

  it('takes a newer version', async () => {
    GET.mockResolvedValue({ data: doc(1) });
    await fetchDocumentRecord('cmp', 'doc_1');
    GET.mockResolvedValue({ data: { ...doc(2), number: 'INV/26-27/0001-R' } });
    await fetchDocumentRecord('cmp', 'doc_1');
    expect(useAppStore.getState().documents[0]).toMatchObject({ version: 2, number: 'INV/26-27/0001-R' });
  });
});
