import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, onTokensChange, tokenStore, type Schema } from '../lib/api';

export type Operator = {
  id: string;
  name: string;
  email: string;
  platformRole: Schema<'PlatformRole'>;
};

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; operator: Operator };

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const NOT_OPERATOR = 'This account is not a platform operator.';

/** Loads the caller; anyone without a platform role is signed straight back out. */
async function loadOperator(): Promise<Operator | null> {
  const { data } = await api.GET('/me');
  if (!data?.platformRole || !data.user) return null;
  return { id: data.user.id!, name: data.user.name ?? '', email: data.user.email ?? '', platformRole: data.platformRole };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() => (tokenStore.get() ? { status: 'loading' } : { status: 'signedOut' }));

  const finish = useCallback(
    async (operator: Operator | null) => {
      if (operator) {
        setState({ status: 'signedIn', operator });
        return;
      }
      // Not an operator: end the session the sign-in just opened.
      await api.POST('/auth/sign-out').catch(() => {});
      tokenStore.set(null);
      queryClient.clear();
      setState({ status: 'signedOut', notice: NOT_OPERATOR });
    },
    [queryClient],
  );

  // Restore a session from this tab.
  useEffect(() => {
    if (state.status !== 'loading') return;
    loadOperator()
      .then(finish)
      .catch(() => {
        tokenStore.set(null);
        setState({ status: 'signedOut' });
      });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A refresh that fails (expired, revoked, suspended) clears the tokens.
  useEffect(() => {
    const off = onTokensChange((tokens) => {
      if (!tokens) {
        queryClient.clear();
        setState((s) => (s.status === 'signedIn' ? { status: 'signedOut', notice: 'Your session ended. Sign in again.' } : s));
      }
    });
    return () => {
      off();
    };
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.POST('/auth/sign-in', {
        body: { email, password, device: { label: 'Admin console', platform: 'web-admin' } },
      });
      if (!data?.accessToken || !data.refreshToken) throw new Error('Sign-in failed');
      tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      await finish(await loadOperator());
    },
    [finish],
  );

  const signOut = useCallback(async () => {
    await api.POST('/auth/sign-out').catch(() => {});
    tokenStore.set(null);
    queryClient.clear();
    setState({ status: 'signedOut' });
  }, [queryClient]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in operator. Only call below RequireOperator. */
export function useOperator(): Operator {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useOperator without a signed-in operator');
  return state.operator;
}

export const isApiError = (err: unknown, code: string) => err instanceof ApiError && err.code === code;
