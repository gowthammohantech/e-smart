import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { MfaGate } from '../pages/Mfa';
import { useAuth } from './AuthProvider';
import { Art } from '../components/Art';

/** Renders its children only for a signed-in platform operator. */
export function RequireOperator({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading')
    return (
      <div className="auth backdrop" role="status" aria-label="Loading">
        <Art name="loading" height={150} />
      </div>
    );
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  // The page they asked for opens once the authenticator check passes.
  if (state.status === 'mfa') return <MfaGate enrolled={state.enrolled} />;
  return <>{children}</>;
}
