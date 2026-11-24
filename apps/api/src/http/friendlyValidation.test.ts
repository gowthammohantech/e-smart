import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { friendlyDetail, friendlyIssues } from './friendlyValidation';

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('email', /^\S+@\S+\.\S+$/);

function run(schema: object, data: unknown, context = 'body') {
  const validate = ajv.compile(schema);
  validate(data);
  return friendlyIssues(validate.errors ?? [], context);
}

describe('friendlyIssues', () => {
  it('explains a PAN that fails its pattern without showing the regex', () => {
    const issues = run({ type: 'object', properties: { pan: { type: 'string', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' } } }, { pan: 'abc' });
    expect(issues).toEqual([{ field: 'body.pan', message: expect.stringContaining('PAN should look like AABCV1234F') }]);
    expect(JSON.stringify(issues)).not.toMatch(/\^|\[A-Z\]|pattern/);
  });

  it('names a missing field by its label', () => {
    const issues = run({ type: 'object', required: ['placeOfSupplyStateCode', 'name'] }, {});
    expect(issues.map((i) => i.message)).toEqual(['Place of supply is required', 'Name is required']);
    expect(issues[0]!.field).toBe('body.placeOfSupplyStateCode');
  });

  it('turns limits and lists into plain sentences', () => {
    const schema = {
      type: 'object',
      properties: {
        password: { type: 'string', minLength: 8 },
        status: { enum: ['a', 'b'] },
        email: { type: 'string', format: 'email' },
        qty: { type: 'number', minimum: 0 },
      },
    };
    const issues = run(schema, { password: 'x', status: 'z', email: 'nope', qty: -1 });
    const text = issues.map((i) => i.message).join(' | ');
    expect(text).toContain('Password needs at least 8 characters');
    expect(text).toContain('Status must be one of: a, b');
    expect(text).toContain('Enter a valid email address');
    expect(text).toContain("Quantity can't be negative");
    expect(text).not.toMatch(/must NOT|must match|required property|allowed values/);
  });

  it('says which row of a list a problem is in', () => {
    const schema = { type: 'object', properties: { lines: { type: 'array', items: { type: 'object', properties: { qty: { type: 'number', minimum: 0 } } } } } };
    const [issue] = run(schema, { lines: [{ qty: 1 }, { qty: -2 }] });
    expect(issue!.message).toBe("Line 2: Quantity can't be negative");
  });

  it('summarises many problems in one line', () => {
    const issues = run({ type: 'object', required: ['a', 'b', 'c'] }, {});
    expect(friendlyDetail(issues)).toBe('A is required (and 2 more problems)');
  });
});
