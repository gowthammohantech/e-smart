import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/api')>()), api }));
// jsdom has no canvas to draw the QR code on.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,') } }));

const { AuthProvider, NOT_OPERATOR } = await import('./AuthProvider');
const { RequireOperator } = await import('./RequireOperator');
const { SignIn } = await import('../pages/SignIn');
const { tokenStore } = await import('../lib/api');

function renderApp(path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route
              path="/"
              element={
                <RequireOperator>
                  <p>Console</p>
                </RequireOperator>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const session = { data: { accessToken: 'a', refreshToken: 'r' } };
const me = (platformRole: string | null) => ({ data: { user: { id: 'usr_1', name: 'Sam', email: 'sam@example.com' }, platformRole } });

async function signIn() {
  // A local .env can prefill the form (VITE_DEMO_LOGIN_*), and Vitest loads it too.
  await userEvent.clear(screen.getByLabelText('Email'));
  await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
  await userEvent.clear(screen.getByLabelText('Password'));
  await userEvent.type(screen.getByLabelText('Password'), 'secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('operator gating', () => {
  beforeEach(() => {
    api.GET.mockReset();
    api.POST.mockReset();
  });

  it('sends a signed-out visitor to sign in', () => {
    renderApp('/');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('Console')).toBeNull();
  });

  it('lets a platform operator in once this session has passed the authenticator check', async () => {
    api.POST.mockResolvedValueOnce(session);
    api.GET.mockResolvedValueOnce(me('support')).mockResolvedValueOnce({ data: { enrolled: true, verified: true, recoveryCodesLeft: 10 } });
    renderApp('/');
    await signIn();
    expect(await screen.findByText('Console')).toBeTruthy();
  });

  it('asks an enrolled operator for a code before the console', async () => {
    api.POST.mockResolvedValueOnce(session).mockResolvedValueOnce({ data: { enrolled: true, verified: true, recoveryCodesLeft: 10 } });
    api.GET.mockResolvedValueOnce(me('support')).mockResolvedValueOnce({ data: { enrolled: true, verified: false, recoveryCodesLeft: 10 } });
    renderApp('/');
    await signIn();
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    expect(screen.queryByText('Console')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Console')).toBeTruthy();
    expect(api.POST).toHaveBeenLastCalledWith('/admin/mfa/verify', { body: { code: '123456' } });
  });

  it('walks a new operator through setting up the authenticator and keeping the recovery codes', async () => {
    api.POST.mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ data: { secret: 'ABCDEFGHABCDEFGH', otpauthUri: 'otpauth://totp/x?secret=ABCDEFGHABCDEFGH' } })
      .mockResolvedValueOnce({ data: { recoveryCodes: ['aaaa-bbbb-cccc', 'dddd-eeee-ffff'] } });
    api.GET.mockResolvedValueOnce(me('superadmin')).mockResolvedValueOnce({ data: { enrolled: false, verified: false, recoveryCodesLeft: 0 } });
    renderApp('/');
    await signIn();
    await userEvent.type(await screen.findByLabelText('Code from the app'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect((await screen.findByTestId('recovery-codes')).textContent).toContain('aaaa-bbbb-cccc');
    const go = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await userEvent.click(screen.getByLabelText('I’ve saved them somewhere safe'));
    await userEvent.click(go);
    expect(await screen.findByText('Console')).toBeTruthy();
  });

  it('signs a tenant user straight back out', async () => {
    api.POST.mockResolvedValueOnce(session).mockResolvedValueOnce({});
    api.GET.mockResolvedValueOnce(me(null));
    renderApp('/');
    await signIn();
    expect(await screen.findByText(NOT_OPERATOR)).toBeTruthy();
    expect(api.POST).toHaveBeenLastCalledWith('/auth/sign-out');
    await waitFor(() => expect(tokenStore.get()).toBeNull());
    expect(screen.queryByText('Console')).toBeNull();
  });
});
