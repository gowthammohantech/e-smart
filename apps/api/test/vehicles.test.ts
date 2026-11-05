import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { moneySetup } from './money-fixtures';

const t = setupApi();
const inr = (minor: number) => ({ minor, currency: 'INR' });

describe('vehicles', () => {
  it('keeps a list of vehicles, tags expenses with one, sums what each cost, and keeps one in use', async () => {
    const m = await moneySetup(t);
    const van = await t.post(`${m.c}/vehicles`, { registration: 'tn 09 ab-1234', name: 'Delivery van' }, { token: m.token });
    expect(van.status).toBe(201);
    expect(van.body.registration).toBe('TN09AB1234');
    expect((await t.post(`${m.c}/vehicles`, { registration: 'TN09AB1234' }, { token: m.token })).body.code).toBe('VEHICLE_EXISTS');
    expect((await t.post(`${m.c}/vehicles`, { registration: '1234' }, { token: m.token })).status).toBe(422);

    const cat = await t.post(`${m.c}/expense-categories`, { name: 'Fuel' }, { token: m.token });
    const fuel = await t.post(`${m.c}/expenses`, { categoryId: cat.body.id, date: '2026-09-20', amount: inr(250_000), currency: 'INR', accountId: m.cash.id, method: 'cash', vehicleId: van.body.id }, { token: m.token });
    expect(fuel.status).toBe(201);
    expect(fuel.body.vehicleId).toBe(van.body.id);
    const bad = await t.post(`${m.c}/expenses`, { categoryId: cat.body.id, date: '2026-09-20', amount: inr(100), currency: 'INR', accountId: m.cash.id, method: 'cash', vehicleId: 'veh_nope' }, { token: m.token });
    expect(bad.body.issues[0].field).toBe('vehicleId');

    const summary = await t.get(`${m.c}/vehicles/summary`, { token: m.token, query: { from: '2026-04-01', to: '2027-03-31' } });
    expect(summary.body.data).toEqual([{ vehicleId: van.body.id, registration: 'TN09AB1234', name: 'Delivery van', expenses: inr(250_000), expenseCount: 1, documentCount: 0 }]);

    const remove = await t.del(`${m.c}/vehicles/${van.body.id}`, { token: m.token, headers: { 'if-match': `"v${van.body.version}"` } });
    expect(remove.body.code).toBe('VEHICLE_IN_USE');
  });
});
