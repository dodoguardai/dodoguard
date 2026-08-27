/**
 * Export Dify Config vulnerabilities and related rows from MySQL.
 *
 * Filter (aligned with seed_dify_config_vulnerabilities.sql / UI "Dify Config"):
 *   type = 'dify' AND (
 *     category = 'Dify Config'
 *     OR verification_mode IN ('config_audit', 'config_only')
 *   )
 *
 * Also exports: attack_commands, detection_rules, solutions, llm_review_instructions
 * for those vulnerability IDs.
 *
 * Usage:
 *   npx tsx scripts/export-dify-config-vulnerabilities.ts
 *   npx tsx scripts/export-dify-config-vulnerabilities.ts --out ./my-export.json
 *
 * Requires: DATABASE_URL / MySQL env as used by backend `backend/src/database`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { and, eq, inArray, or } from 'drizzle-orm';

import { db, getDbType } from '../backend/src/database';

function loadMysqlTables() {
  if (getDbType() !== 'mysql') {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mysqlTables = require('../backend/src/database/tables-mysql');
  return {
    vulnerabilitiesTable: mysqlTables.vulnerabilitiesTable,
    attackCommandsTable: mysqlTables.attackCommandsTable,
    detectionRulesTable: mysqlTables.detectionRulesTable,
    solutionsTable: mysqlTables.solutionsTable,
    llmReviewInstructionsTable: mysqlTables.llmReviewInstructionsTable,
  };
}

function parseOutArg(): string | undefined {
  const i = process.argv.indexOf('--out');
  if (i >= 0 && process.argv[i + 1]) {
    return path.resolve(process.cwd(), process.argv[i + 1]);
  }
  return undefined;
}

async function main() {
  const tables = loadMysqlTables();
  if (!tables) {
    console.error('This export only supports MySQL (getDbType() must be "mysql").');
    process.exit(1);
  }

  const {
    vulnerabilitiesTable,
    attackCommandsTable,
    detectionRulesTable,
    solutionsTable,
    llmReviewInstructionsTable,
  } = tables;

  const difyConfigCondition = and(
    eq(vulnerabilitiesTable.type, 'dify'),
    or(
      eq(vulnerabilitiesTable.category, 'Dify Config'),
      inArray(vulnerabilitiesTable.verificationMode, ['config_audit', 'config_only']),
    ),
  );

  const vulnerabilities = await db
    .select()
    .from(vulnerabilitiesTable)
    .where(difyConfigCondition);

  const ids = vulnerabilities.map((v) => v.id).filter(Boolean);
  if (ids.length === 0) {
    console.warn('No rows matched Dify Config filter.');
  }

  const [attackCommands, detectionRules, solutions, llmReviewInstructions] =
    ids.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          db.select().from(attackCommandsTable).where(inArray(attackCommandsTable.vulnerabilityId, ids)),
          db.select().from(detectionRulesTable).where(inArray(detectionRulesTable.vulnerabilityId, ids)),
          db.select().from(solutionsTable).where(inArray(solutionsTable.vulnerabilityId, ids)),
          db
            .select()
            .from(llmReviewInstructionsTable)
            .where(inArray(llmReviewInstructionsTable.vulnerabilityId, ids)),
        ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    filter:
      "type='dify' AND (category='Dify Config' OR verification_mode IN ('config_audit','config_only'))",
    counts: {
      vulnerabilities: vulnerabilities.length,
      attackCommands: attackCommands.length,
      detectionRules: detectionRules.length,
      solutions: solutions.length,
      llmReviewInstructions: llmReviewInstructions.length,
    },
    vulnerabilities,
    attackCommands,
    detectionRules,
    solutions,
    llmReviewInstructions,
  };

  const outPath =
    parseOutArg() ??
    path.join(
      process.cwd(),
      'exports',
      `dify-config-vulnerabilities-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(payload.counts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
