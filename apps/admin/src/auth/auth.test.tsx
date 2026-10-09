import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/api')>()), api }));

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
  await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
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

  it('lets a platform operator in', async () => {
    api.POST.mockResolvedValueOnce(session);
    api.GET.mockResolvedValueOnce(me('support'));
    renderApp('/');
    await signIn();
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
