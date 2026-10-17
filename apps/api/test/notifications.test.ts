import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { notify } from '../src/lib/notify';
import { ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

describe('notifications', () => {
  it("shows company-wide and the caller's own notifications, not other people's", async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    const member = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });
    await t.post('/me/push-tokens', { token: 'ExponentPushToken[member]', provider: 'expo' }, { token: member.token });

    await notify(t.deps.db, t.deps, { companyId: company.id!, kind: 'system', title: 'Welcome', body: 'For everyone' });
    await notify(t.deps.db, t.deps, { companyId: company.id!, userId: user.id!, kind: 'paymentReceived', title: 'Paid', body: 'For the owner', entityType: 'payment', entityId: 'pay_1' });
    await notify(t.deps.db, t.deps, { companyId: company.id!, userId: member.user.id!, kind: 'lowStock', title: 'Low', body: 'For the member' });
    expect(t.providers.outbox.messages.filter((m) => m.channel === 'push').map((m) => m.subject)).toEqual(['Welcome', 'Low']);

    const mine = await t.get(`${c}/notifications`, { token });
    expect(mine.body.data.map((n: { title: string }) => n.title).sort()).toEqual(['Paid', 'Welcome']);
    expect(mine.body.unreadCount).toBe(2);
    expect(mine.body.data.find((n: { title: string }) => n.title === 'Paid')).toMatchObject({ read: false, entityType: 'payment', entityId: 'pay_1' });

    const theirs = await t.get(`${c}/notifications`, { token: member.token });
    expect(theirs.body.data.map((n: { title: string }) => n.title).sort()).toEqual(['Low', 'Welcome']);
  });

  it('marks one or all read, and 404s one the caller cannot see', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    const member = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });
    for (const title of ['One', 'Two', 'Three']) await notify(t.deps.db, t.deps, { companyId: company.id!, userId: user.id!, kind: 'system', title, body: title });
    await notify(t.deps.db, t.deps, { companyId: company.id!, userId: member.user.id!, kind: 'system', title: 'Private', body: 'x' });
    const list = await t.get(`${c}/notifications`, { token });
    const two = list.body.data.find((n: { title: string }) => n.title === 'Two');

    expect((await t.post(`${c}/notifications/${two.id}/read`, {}, { token })).status).toBe(204);
    const after = await t.get(`${c}/notifications`, { token });
    expect(after.body.unreadCount).toBe(2);
    expect(after.body.data.find((n: { id: string }) => n.id === two.id).read).toBe(true);
    const unread = await t.get(`${c}/notifications`, { token, query: { unread: true } });
    expect(unread.body.data.map((n: { title: string }) => n.title).sort()).toEqual(['One', 'Three']);

    const [priv] = (await t.deps.db.select().from(schema.notifications)).filter((n) => n.title === 'Private');
    expect((await t.post(`${c}/notifications/${priv.id}/read`, {}, { token })).status).toBe(404);

    expect((await t.post(`${c}/notifications/read-all`, {}, { token })).status).toBe(204);
    expect((await t.get(`${c}/notifications`, { token })).body.unreadCount).toBe(0);
    expect((await t.get(`${c}/notifications`, { token: member.token })).body.unreadCount).toBe(1);
  });

  it('clears and pages', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    for (let i = 0; i < 5; i++) await notify(t.deps.db, t.deps, { companyId: company.id!, userId: user.id!, kind: 'system', title: `N${i}`, body: 'x' });
    const first = await t.get(`${c}/notifications`, { token, query: { limit: 3 } });
    expect(first.body.data.map((n: { title: string }) => n.title)).toEqual(['N4', 'N3', 'N2']);
    const second = await t.get(`${c}/notifications`, { token, query: { limit: 3, cursor: first.body.nextCursor } });
    expect(second.body.data.map((n: { title: string }) => n.title)).toEqual(['N1', 'N0']);
    expect(second.body.nextCursor).toBeNull();

    expect((await t.del(`${c}/notifications`, { token })).status).toBe(204);
    const cleared = await t.get(`${c}/notifications`, { token });
    expect(cleared.body).toMatchObject({ data: [], unreadCount: 0 });
  });
});
