import type { Schema } from '../lib/api';
import { PLAN_LABELS } from '../lib/format';

export function AccountStatusBadge({ status }: { status: Schema<'PlatformAccount'>['status'] }) {
  return status === 'suspended' ? <span className="badge bad">Suspended</span> : <span className="badge good">Active</span>;
}

const USER_STATUS = { active: ['good', 'Active'], invited: ['info', 'Invited'], disabled: ['bad', 'Disabled'] } as const;
export function UserStatusBadge({ status }: { status: Schema<'PlatformUser'>['status'] }) {
  const [tone, label] = USER_STATUS[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function PlanBadge({ plan }: { plan: Schema<'PlanTier'> }) {
  return <span className={`badge plain ${plan === 'free' ? '' : 'info'}`}>{PLAN_LABELS[plan] ?? plan}</span>;
}

const SUB_STATUS: Record<string, [string, string]> = {
  active: ['good', 'Active'],
  trialing: ['info', 'Trialing'],
  pastDue: ['warn', 'Past due'],
  cancelled: ['bad', 'Cancelled'],
  none: ['', 'No subscription'],
};
export function SubscriptionBadge({ status }: { status: string }) {
  const [tone, label] = SUB_STATUS[status] ?? ['', status];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function RoleBadge({ role }: { role: Schema<'PlatformRole'> }) {
  return <span className={`badge plain ${role === 'superadmin' ? 'warn' : 'info'}`}>{role === 'superadmin' ? 'Superadmin' : 'Support'}</span>;
}
