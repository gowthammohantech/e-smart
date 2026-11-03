import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { MfaGate } from '../pages/Mfa';
import { useAuth } from './AuthProvider';

/** Renders its children only for a signed-in platform operator. */
export function RequireOperator({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <div className="empty">Loading…</div>;
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  // The page they asked for opens once the authenticator check passes.
  if (state.status === 'mfa') return <MfaGate enrolled={state.enrolled} />;
  return <>{children}</>;
}
