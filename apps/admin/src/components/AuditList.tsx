import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { api, need, type Schema } from '../lib/api';
import { actionLabel, fmtDateTime } from '../lib/format';
import { useCursorPager } from '../lib/useCursorPager';
import { Pager, QueryState } from './ui';

type Filters = { targetType?: Schema<'PlatformAuditEvent'>['targetType']; targetId?: string; actorId?: string; from?: string; to?: string };

const targetPath = (e: Schema<'PlatformAuditEvent'>) =>
  e.targetType === 'account' ? `/accounts/${e.targetId}` : e.targetType === 'company' ? `/companies/${e.targetId}` : `/users?q=${encodeURIComponent(e.targetLabel.replace(/^.*<|>$/g, ''))}`;

function pretty(json: string | undefined) {
  if (!json) return '—';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/** Platform audit events, newest first, with before/after on demand. */
export function AuditList({ filters, limit = 25, compact = false }: { filters: Filters; limit?: number; compact?: boolean }) {
  const pager = useCursorPager();
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['audit', filters, pager.cursor, limit],
    queryFn: async () => need(await api.GET('/admin/audit-events', { params: { query: { ...filters, cursor: pager.cursor, limit } } })),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState isPending={query.isPending} error={query.error}>
      {() =>
        query.data!.data!.length === 0 ? (
          <div className="empty">No operator actions recorded{compact ? ' here yet' : ''}.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    {compact ? null : <th>Target</th>}
                    <th>Reason</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {query.data!.data!.map((e) => (
                    <Fragment key={e.id}>
                      <tr>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          {fmtDateTime(e.createdAt)}
                        </td>
                        <td>{actionLabel(e.action)}</td>
                        {compact ? null : (
                          <td>
                            <Link to={targetPath(e)}>{e.targetLabel}</Link>
                            <div className="cell-sub">{e.targetType}</div>
                          </td>
                        )}
                        <td style={{ maxWidth: 320 }}>{e.reason}</td>
                        <td>
                          {e.actorEmail}
                          {e.ipAddress ? <div className="cell-sub mono">{e.ipAddress}</div> : null}
                        </td>
                        <td className="right">
                          <button className="btn small ghost" type="button" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                            {openId === e.id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {openId === e.id ? (
                        <tr>
                          <td colSpan={compact ? 5 : 6}>
                            <div className="diff">
                              <div>
                                <div className="cell-sub">Before</div>
                                <pre>{pretty(e.before)}</pre>
                              </div>
                              <div>
                                <div className="cell-sub">After</div>
                                <pre>{pretty(e.after)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={pager.page} hasPrev={pager.hasPrev} nextCursor={query.data!.nextCursor} onPrev={pager.prev} onNext={pager.next} />
          </>
        )
      }
    </QueryState>
  );
}
