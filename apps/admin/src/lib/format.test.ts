import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionLabel } from './format';

/** Every platform audit action the server (and db:platform-admin) can write, read from their source. */
function recordedActions(): string[] {
  const roots = [join(__dirname, '../../../api/src'), join(__dirname, '../../../../packages/db/src')];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
    }
  };
  roots.forEach(walk);
  const found = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // Only where platform audit rows are written: subscription events share the dotted style.
    if (!/recordPlatformAction|platformAuditEvents|MfaAction/.test(text)) continue;
    for (const m of text.matchAll(/'((?:account|company|user|users|operator|mfa)\.[a-z_]+(?:\.[a-z_]+)?)'/g)) found.add(m[1]);
  }
  return [...found].sort();
}

describe('audit action labels', () => {
  it('names every action the platform audit log records, views and two-step events included', () => {
    const actions = recordedActions();
    expect(actions).toEqual(expect.arrayContaining(['account.viewed', 'company.viewed', 'mfa.verified', 'mfa.reset']));
    expect(actions.filter((a) => actionLabel(a) === a)).toEqual([]);
  });
});
