// npm run check:migrations: migrations only add (expand); taking something away (contract) is a
// separate, later release, once no running code reads it. A migration that drops, renames or retypes
// a column or table fails this check unless that statement carries a line
//   -- contract: <what stopped using it, and in which release>
// so a rollback to the previous build never meets a database missing what it needs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../packages/db/migrations', import.meta.url));
/** Everything up to here shipped before the rule; 0007 dropped a column that was already unused. */
const CHECKED_FROM = 19;

const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|TYPE|INDEX)|RENAME\s+(TO|COLUMN)|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE|TRUNCATE)\b/i;

const problems = [];
for (const file of readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
  if (Number(file.slice(0, 4)) < CHECKED_FROM) continue;
  const statements = readFileSync(join(DIR, file), 'utf8').split('--> statement-breakpoint');
  statements.forEach((statement, i) => {
    if (DESTRUCTIVE.test(statement) && !/--\s*contract:/i.test(statement)) {
      problems.push(`${file} (statement ${i + 1}): ${statement.trim().split('\n')[0].slice(0, 120)}`);
    }
  });
}
if (problems.length) {
  console.error('Migrations that take something away without a "-- contract:" note:\n- ' + problems.join('\n- '));
  console.error('\nShip the removal in a later release than the code that stops using it, and mark the statement.');
  process.exit(1);
}
console.log('Migrations only expand (or are marked as contracting).');
