import { ApiError } from '@esmart/api-client';
import { api } from '../../../remote/api';
import { askRemote, confirmRemote, toReply } from '../remote';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../remote/config', () => ({ isRemote: () => true, DATA_SOURCE: 'remote', API_BASE_URL: 'http://api.test/v1' }));
jest.mock('../../../remote/api', () => ({
  api: { POST: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const POST = api.POST as jest.Mock;
const turns = [{ role: 'user' as const, text: 'who owes me?' }];

beforeEach(() => POST.mockReset());

describe('remote Lixi', () => {
  it('maps the server reply onto the chat', async () => {
    POST.mockResolvedValue({
      data: {
        reply: {
          text: 'Sunrise owes ₹1,180.',
          stats: [{ label: 'Outstanding', value: '₹1,180' }],
          actions: [
            { type: 'route', label: 'Receivables', route: '/(app)/receivables' },
            { type: 'document', label: 'INV-7', id: 'doc_7', kind: 'invoice' },
            { type: 'ask', label: 'Top customers?', question: 'Who are my top customers?' },
            { type: 'route', label: 'Broken' },
          ],
        },
      },
    });
    const res = await askRemote(turns, 'en');
    expect(POST).toHaveBeenCalledWith('/companies/{companyId}/lixi/messages', expect.objectContaining({ body: { messages: turns, locale: 'en' } }));
    expect(res?.reply).toEqual({
      text: 'Sunrise owes ₹1,180.',
      stats: [{ label: 'Outstanding', value: '₹1,180' }],
      actions: [
        { type: 'route', label: 'Receivables', route: '/(app)/receivables' },
        { type: 'document', label: 'INV-7', id: 'doc_7', kind: 'invoice' },
        { type: 'ask', label: 'Top customers?', question: 'Who are my top customers?' },
      ],
    });
  });

  it('hands back to the local brain when offline or the model is down', async () => {
    POST.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await askRemote(turns)).toBeNull();
    POST.mockRejectedValueOnce(new ApiError(502, { code: 'LIXI_UNAVAILABLE' } as never));
    expect(await askRemote(turns)).toBeNull();
    POST.mockRejectedValueOnce(new ApiError(400, { code: 'LAST_MESSAGE_NOT_USER' } as never));
    await expect(askRemote(turns)).rejects.toBeInstanceOf(ApiError);
  });

  it('confirms a pending action, and says when it expired', async () => {
    const action = { token: 't', tool: 'create_draft_document', summary: 'Draft invoice', preview: {}, expiresAt: '2026-09-29T10:05:00Z' };
    POST.mockResolvedValueOnce({ data: { reply: { text: 'Done: Draft invoice.', stats: [], actions: [] }, result: { entity: 'document' } } });
    expect(await confirmRemote(action)).toEqual({ ok: true, reply: { text: 'Done: Draft invoice.' } });
    expect(POST).toHaveBeenLastCalledWith('/companies/{companyId}/lixi/actions', expect.objectContaining({ body: { token: 't' } }));

    POST.mockRejectedValueOnce(new ApiError(410, { code: 'LIXI_ACTION_EXPIRED', detail: 'expired' } as never));
    expect(await confirmRemote(action)).toEqual({ ok: false, expired: true, reason: 'expired' });
  });

  it('drops empty stats and actions', () => {
    expect(toReply({ text: 'Hi', stats: [], actions: [] })).toEqual({ text: 'Hi' });
  });
});
