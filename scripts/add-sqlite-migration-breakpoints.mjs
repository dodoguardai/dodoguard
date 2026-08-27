/**
 * Drizzle SQLite migrator runs one `prepare()` per chunk split by `--> statement-breakpoint`.
 * `drizzle-kit export` emits a single file without breakpoints; insert them between statements.
 */
import fs from 'node:fs';

const p = new URL('../drizzle/sqlite-bootstrap/0000_sqlite_baseline_export.sql', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace(/\);\r?\n(CREATE)/g, ');\n--> statement-breakpoint\n$1');
if (s === before) {
  console.error('No changes made; pattern mismatch?');
  process.exit(1);
}
fs.writeFileSync(p, s);
console.log('Inserted', (s.match(/--> statement-breakpoint/g) || []).length, 'breakpoints');
