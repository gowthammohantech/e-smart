import { checkCustomValues, printableFields, type CustomField } from '../customFields';

const fields: CustomField[] = [
  { id: 'cf1', entity: 'document', label: 'Vehicle no.', kind: 'text', required: true, showOnPdf: true, position: 1 },
  { id: 'cf2', entity: 'document', label: 'Cartons', kind: 'number', showOnPdf: true, position: 2 },
  { id: 'cf3', entity: 'document', label: 'Delivery slot', kind: 'select', options: ['Morning', 'Evening'] },
  { id: 'cf4', entity: 'document', label: 'Insured', kind: 'checkbox', showOnPdf: true, position: 3 },
  { id: 'cf5', entity: 'document', label: 'Old field', kind: 'text', required: true, status: 'inactive' },
  { id: 'cf6', entity: 'party', label: 'Drug licence', kind: 'text', required: true },
];

describe('custom fields', () => {
  it('keeps good values, cleans them, and drops fields that are gone', () => {
    const { values, problems } = checkCustomValues(fields, 'document', { cf1: ' TN 09 AB 1234 ', cf2: '1,200', cf3: 'Evening', cf4: 'true', gone: 'x' });
    expect(problems).toEqual([]);
    expect(values).toEqual({ cf1: 'TN 09 AB 1234', cf2: 1200, cf3: 'Evening', cf4: true });
  });

  it('says what is wrong: missing required, not a number, not a choice', () => {
    const { problems } = checkCustomValues(fields, 'document', { cf2: 'many', cf3: 'Night' });
    expect(problems.map((p) => p.fieldId)).toEqual(['cf1', 'cf2', 'cf3']);
  });

  it('only checks the record’s own fields, and no longer requires an inactive one', () => {
    expect(checkCustomValues(fields, 'document', { cf1: 'X' }).problems).toEqual([]);
    expect(checkCustomValues(fields, 'party', {}).problems.map((p) => p.fieldId)).toEqual(['cf6']);
  });

  it('prints the fields marked for print, in order, and a ticked box only', () => {
    expect(printableFields(fields, 'document', { cf1: 'TN 09', cf2: 12, cf3: 'Morning', cf4: false })).toEqual([
      { label: 'Vehicle no.', text: 'TN 09' },
      { label: 'Cartons', text: '12' },
    ]);
  });
});
