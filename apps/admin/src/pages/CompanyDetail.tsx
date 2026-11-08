import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AuditList } from '../components/AuditList';
import { PlanBadge, SubscriptionBadge } from '../components/Badges';
import { Can } from '../components/Can';
import { ReasonDialog } from '../components/ReasonDialog';
import { PageHeader, QueryState, EmptyState, DetailSkeleton } from '../components/ui';
import { api, need, type Schema } from '../lib/api';
import { fmtDate, fmtDateTime, fmtInt, PLAN_LABELS, PLANS } from '../lib/format';

/** Provider cost in US dollars; small sums keep four places so a few calls don't read as $0.00. */
const fmtUsd = (usd: number) => `$${usd.toFixed(usd > 0 && usd < 1 ? 4 : 2)}`;

const DOC_LABELS: Record<string, string> = {
  quote: 'Quotes',
  salesOrder: 'Sales orders',
  delivery: 'Deliveries',
  invoice: 'Invoices',
  salesReturn: 'Sales returns',
  purchaseOrder: 'Purchase orders',
  goodsReceipt: 'Goods receipts',
  purchaseBill: 'Purchase bills',
  purchaseReturn: 'Purchase returns',
};

const EVENT_LABELS: Record<string, string> = {
  adminOverride: 'Changed by an operator',
  'checkout.started': 'Checkout started',
  'cancel.requested': 'Cancellation requested',
};

function PlanOverride({ company, billedBy }: { company: Schema<'PlatformCompany'>; billedBy: string | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Schema<'PlanTier'>>(company.plan);
  const [status, setStatus] = useState<'active' | 'trialing'>('active');
  const [until, setUntil] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [tomorrow] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  return (
    <Can role="superadmin">
      <button
        className="btn primary"
        type="button"
        onClick={() => {
          setPlan(company.plan);
          setStatus('active');
          setUntil('');
          setWarning(null);
          setOpen(true);
        }}
      >
        Change plan
      </button>
      {warning ? <div className="alert warn">{warning}</div> : null}
      <ReasonDialog
        open={open}
        title={`Change plan for ${company.name}`}
        description="Takes effect at once and is recorded in the company's own audit trail as a change by platform support."
        confirmLabel="Change plan"
        onClose={() => setOpen(false)}
        onConfirm={async (reason) => {
          const res = need(
            await api.PUT('/admin/companies/{companyId}/plan', {
              params: { path: { companyId: company.id } },
              body: { plan, status, reason, currentPeriodEnd: until ? `${until}T23:59:59Z` : null },
            }),
          );
          setWarning(res.warning ?? null);
          await queryClient.invalidateQueries();
        }}
      >
        {billedBy ? (
          <div className="alert warn">
            This company is billed through {billedBy}. Its next billing event (a renewal, a failed payment) may change the plan back.
          </div>
        ) : null}
        <label className="field">
          <span>Plan</span>
          <select className="select" value={plan} onChange={(e) => setPlan(e.target.value as Schema<'PlanTier'>)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
                {p === company.plan ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'trialing')}>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
          </select>
        </label>
        <label className="field">
          <span>Period ends (optional)</span>
          <input className="input" type="date" min={tomorrow} value={until} onChange={(e) => setUntil(e.target.value)} />
          <span className="hint">Shown to the company as the period end. Nothing downgrades automatically when it passes.</span>
        </label>
      </ReasonDialog>
    </Can>
  );
}

export function CompanyDetail() {
  const { companyId = '' } = useParams();
  const query = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => need(await api.GET('/admin/companies/{companyId}', { params: { path: { companyId } } })),
  });

  return (
    <QueryState isPending={query.isPending} error={query.error} fallback={<DetailSkeleton crumbs={[{ to: '/accounts', label: 'Accounts' }]} tables={3} />}>
      {() => {
        const { company, accountName, accountSuspended, subscription, planHistory, documentCounts, userCount, aiCost = [] } = query.data!;
        const aiTotal = aiCost.reduce((s, r) => s + r.costUsd, 0);
        const totalDocs = documentCounts.reduce((s, d) => s + d.count, 0);
        return (
          <div className="stack">
            <PageHeader
              crumbs={[
                { to: '/accounts', label: 'Accounts' },
                { to: `/accounts/${company.accountId}`, label: accountName },
              ]}
              title={company.name}
              sub={<span className="mono">{company.id}</span>}
              actions={<PlanOverride company={company} billedBy={subscription?.provider ?? null} />}
            />
            {accountSuspended ? <div className="alert bad">This company’s account is suspended. Nobody on it can sign in.</div> : null}

            <section className="card card-body">
              <dl className="facts">
                <div>
                  <dt>Legal name</dt>
                  <dd>{company.legalName ?? '—'}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {company.city}, {company.country}
                  </dd>
                </div>
                <div>
                  <dt>Tax ID</dt>
                  <dd className="mono">{company.taxIdentifier ?? '—'}</dd>
                </div>
                <div>
                  <dt>Team members</dt>
                  <dd className="num">{userCount}</dd>
                </div>
                <div>
                  <dt>Onboarded</dt>
                  <dd>{company.onboardingCompletedAt ? fmtDate(company.onboardingCompletedAt) : 'Not yet'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{fmtDate(company.createdAt)}</dd>
                </div>
              </dl>
            </section>

            <div className="grid-2">
              <section className="card">
                <div className="card-head">
                  <h2>Subscription</h2>
                  <PlanBadge plan={company.plan} />
                </div>
                <div className="card-body">
                  <dl className="facts">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <SubscriptionBadge status={subscription?.status ?? 'none'} />
                      </dd>
                    </div>
                    <div>
                      <dt>Billing</dt>
                      <dd>{subscription?.provider ?? 'Manual'}</dd>
                    </div>
                    <div>
                      <dt>Cycle</dt>
                      <dd style={{ textTransform: 'capitalize' }}>{subscription?.cycle ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Period ends</dt>
                      <dd>{fmtDate(subscription?.currentPeriodEnd)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Documents</h2>
                  <span className="muted num">{fmtInt(totalDocs)} total</span>
                </div>
                {documentCounts.length === 0 ? (
                  <EmptyState title="No documents yet" />
                ) : (
                  <table className="data">
                    <tbody>
                      {documentCounts.map((d) => (
                        <tr key={d.kind}>
                          <td>{DOC_LABELS[d.kind] ?? d.kind}</td>
                          <td className="right num">{fmtInt(d.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-head">
                <h2>AI cost</h2>
                <span className="muted num">{fmtUsd(aiTotal)} over {aiCost.length} {aiCost.length === 1 ? 'month' : 'months'}</span>
              </div>
              {aiCost.length === 0 ? (
                <EmptyState title="No AI use yet" />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="right">Actions</th>
                        <th className="right">Tokens in</th>
                        <th className="right">Tokens out</th>
                        <th className="right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiCost.map((r) => (
                        <tr key={r.month}>
                          <td className="num">{r.month}</td>
                          <td className="right num">{fmtInt(r.actions)}</td>
                          <td className="right num">{fmtInt(r.inputTokens)}</td>
                          <td className="right num">{fmtInt(r.outputTokens)}</td>
                          <td className="right num">{fmtUsd(r.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Plan history</h2>
              </div>
              {planHistory.length === 0 ? (
                <EmptyState title="No plan changes yet" />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Event</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planHistory.map((h) => (
                        <tr key={h.id}>
                          <td>{fmtDateTime(h.createdAt)}</td>
                          <td>{EVENT_LABELS[h.event] ?? h.event}</td>
                          <td>
                            {h.fromPlan ? PLAN_LABELS[h.fromPlan] : '—'} → {h.toPlan ? PLAN_LABELS[h.toPlan] : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Operator actions on this company</h2>
              </div>
              <AuditList filters={{ targetType: 'company', targetId: company.id }} limit={10} compact />
            </section>
          </div>
        );
      }}
    </QueryState>
  );
}
