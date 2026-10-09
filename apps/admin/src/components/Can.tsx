import type { ReactNode } from 'react';
import type { Schema } from '../lib/api';
import { useOperator } from '../auth/AuthProvider';

/**
 * Shows its children only to the given platform roles. The API enforces the
 * same rule; this just keeps support from seeing buttons that would 403.
 */
export function Can({ role, children }: { role: Schema<'PlatformRole'>; children: ReactNode }) {
  const operator = useOperator();
  if (role === 'superadmin' && operator.platformRole !== 'superadmin') return null;
  return <>{children}</>;
}
