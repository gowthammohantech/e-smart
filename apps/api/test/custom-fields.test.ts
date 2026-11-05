import { describe, expect, it } from 'vitest';
import { setupApi } from './helpers';
import { invoiceBody, moneySetup } from './money-fixtures';

const t = setupApi();

describe('custom fields', () => {
  it('defines fields, checks values on documents and contacts, and keeps them through a save', async () => {
    const m = await moneySetup(t);
    const vehicle = await t.post(`${m.c}/custom-fields`, { entity: 'document', label: 'Vehicle no.', kind: 'text', required: true, showOnPdf: true }, { token: m.token });
    expect(vehicle.status).toBe(201);
    const slot = await t.post(`${m.c}/custom-fields`, { entity: 'document', label: 'Slot', kind: 'select', options: ['Morning', 'Evening'] }, { token: m.token });
    const dupe = await t.post(`${m.c}/custom-fields`, { entity: 'document', label: 'vehicle NO.', kind: 'text' }, { token: m.token });
    expect(dupe.body.code).toBe('CUSTOM_FIELD_EXISTS');
    const oneChoice = await t.post(`${m.c}/custom-fields`, { entity: 'item', label: 'Grade', kind: 'select', options: ['A'] }, { token: m.token });
    expect(oneChoice.status).toBe(422);

    // Required, and a choice from the list.
    const missing = await t.post(`${m.c}/documents`, invoiceBody(m), { token: m.token });
    expect(missing.status).toBe(422);
    expect(missing.body.issues[0].field).toBe(`customFields.${vehicle.body.id}`);
    const wrongChoice = await t.post(`${m.c}/documents`, invoiceBody(m, { customFields: { [vehicle.body.id]: 'TN 09 AB 1234', [slot.body.id]: 'Night' } }), { token: m.token });
    expect(wrongChoice.body.issues[0].field).toBe(`customFields.${slot.body.id}`);

    const doc = await t.post(`${m.c}/documents`, invoiceBody(m, { customFields: { [vehicle.body.id]: ' TN 09 AB 1234 ', [slot.body.id]: 'Evening', stale: 'x' } }), { token: m.token });
    expect(doc.status).toBe(201);
    expect(doc.body.customFields).toEqual({ [vehicle.body.id]: 'TN 09 AB 1234', [slot.body.id]: 'Evening' });
    // A choice a document holds can't be taken off the list.
    const shrink = await t.put(`${m.c}/custom-fields/${slot.body.id}`, { ...slot.body, options: ['Morning', 'Night'] }, { token: m.token, headers: { 'if-match': `"v${slot.body.version}"` } });
    expect(shrink.body.code).toBe('CUSTOM_FIELD_OPTION_IN_USE');

    // Contacts: a party field, kept when a save leaves it out.
    const licence = await t.post(`${m.c}/custom-fields`, { entity: 'party', label: 'Drug licence', kind: 'text' }, { token: m.token });
    const party = await t.get(`${m.c}/parties/${m.mumbai.id}`, { token: m.token });
    const { outstanding: _o, overdue: _d, advance: _a, ...body } = party.body;
    const saved = await t.put(`${m.c}/parties/${m.mumbai.id}`, { ...body, customFields: { [licence.body.id]: 'TN/MDU/20B/1234' } }, { token: m.token, headers: { 'if-match': `"v${party.body.version}"` } });
    expect(saved.body.customFields).toEqual({ [licence.body.id]: 'TN/MDU/20B/1234' });
    const { customFields: _c, ...withoutFields } = body;
    const again = await t.put(`${m.c}/parties/${m.mumbai.id}`, { ...withoutFields, phone: '+919800000099' }, { token: m.token, headers: { 'if-match': `"v${saved.body.version}"` } });
    expect(again.body.customFields).toEqual({ [licence.body.id]: 'TN/MDU/20B/1234' });

    const list = await t.get(`${m.c}/custom-fields`, { token: m.token });
    expect(list.body.data.map((f: { label: string }) => f.label)).toEqual(['Drug licence', 'Slot', 'Vehicle no.']);
  });
});
