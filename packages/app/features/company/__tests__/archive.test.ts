import { BOOK, buildTestBook, company } from '../../../__fixtures__/book';
import { useAppStore } from '../../../store/appStore';
import { canArchiveCompany } from '../archiveRules';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

const OTHER = 'cmp_other';

describe('forgetting an archived business on this device', () => {
  beforeEach(() => {
    const seed = buildTestBook();
    useAppStore.setState({
      ...seed,
      companies: [...seed.companies, company({ id: OTHER, name: 'Other Traders' })],
      branches: [...seed.branches, { ...seed.branches[0], id: 'brn_other', companyId: OTHER }],
      syncQueue: [
        { id: 'q1', label: 'a', entityType: 'party', entityId: 'p', action: 'create', status: 'pending', attempts: 0, queuedAt: '', method: 'POST', path: `/companies/${BOOK.companyId}/parties` },
        { id: 'q2', label: 'b', entityType: 'party', entityId: 'p', action: 'create', status: 'pending', attempts: 0, queuedAt: '', method: 'POST', path: `/companies/${OTHER}/parties` },
      ],
      activeCompanyId: BOOK.companyId,
      activeBranchId: BOOK.branchId,
    });
  });

  it('drops the business and every row of it, keeps the other, and opens it', () => {
    expect(useAppStore.getState().documents.some((d) => d.companyId === BOOK.companyId)).toBe(true);
    useAppStore.getState().forgetCompany(BOOK.companyId);
    const s = useAppStore.getState();
    expect(s.companies.map((c) => c.id)).toEqual([OTHER]);
    for (const key of ['documents', 'parties', 'items', 'payments', 'branches', 'taxCategories'] as const) {
      expect((s[key] as { companyId?: string }[]).some((r) => r.companyId === BOOK.companyId)).toBe(false);
    }
    expect(s.branches.map((b) => b.id)).toEqual(['brn_other']);
    expect(s.syncQueue.map((e) => e.id)).toEqual(['q2']);
    expect(s.activeCompanyId).toBe(OTHER);
    expect(s.activeBranchId).toBe('brn_other');
  });

  it('does nothing for a business it never had', () => {
    const before = useAppStore.getState().companies;
    useAppStore.getState().forgetCompany('cmp_unknown');
    expect(useAppStore.getState().companies).toBe(before);
  });
});

describe('when Archive may be pressed', () => {
  const base = { online: true, name: 'Konkan Exports', typed: ' konkan exports ', byPhone: false, codeRequested: false, code: '', password: 'pw', busy: false };
  it('needs the name, a proof, and the network', () => {
    expect(canArchiveCompany(base)).toBe(true);
    expect(canArchiveCompany({ ...base, typed: 'Konkan' })).toBe(false);
    expect(canArchiveCompany({ ...base, password: '' })).toBe(false);
    expect(canArchiveCompany({ ...base, online: false })).toBe(false);
    expect(canArchiveCompany({ ...base, byPhone: true, codeRequested: true, code: '123456', password: '' })).toBe(true);
    expect(canArchiveCompany({ ...base, byPhone: true, codeRequested: true, code: '123' })).toBe(false);
  });
});
