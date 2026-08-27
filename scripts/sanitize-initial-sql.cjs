#!/usr/bin/env node

/**
 * Create a publishable initialization SQL dump from a private MySQL dump.
 *
 * It retains only the admin account, its organization/roles, database migration
 * history, and the first page (20 each) of technical and compliance case
 * libraries with their cases. All runtime, customer, integration and scan data
 * is omitted. Run without --apply to preview; --apply keeps a local backup.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const targetPath = path.join(root, 'release', 'dodoguard.sql');
const backupPath = `${targetPath}.pre-sanitize.bak`;
const sourcePath = process.argv.includes('--from-backup') ? backupPath : targetPath;
const outputPath = `${targetPath}.sanitizing`;
const apply = process.argv.includes('--apply');
const adminEmail = 'admin@126.com';
const pageSize = 20;
const systemOrganizationId = '00000000-0000-0000-0000-000000000000';

function splitInsertValues(line) {
  const marker = 'VALUES (';
  const start = line.indexOf(marker);
  if (start < 0 || !line.endsWith(');')) {
    return null;
  }

  const source = line.slice(start + marker.length, -2);
  const values = [];
  let value = '';
  let depth = 0;
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      value += char;
      if (char === '\\') {
        value += source[index + 1] ?? '';
        index += 1;
      } else if (char === "'") {
        quoted = false;
      }
      continue;
    }

    if (char === "'") {
      quoted = true;
      value += char;
    } else if (char === '(') {
      depth += 1;
      value += char;
    } else if (char === ')') {
      depth -= 1;
      value += char;
    } else if (char === ',' && depth === 0) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function sqlString(value) {
  if (!value || !value.startsWith("'")) {
    return value;
  }
  return value.slice(1, -1).replace(/\\(.)/gs, '$1');
}

function insertTable(line) {
  return line.match(/^INSERT INTO `([^`]+)`/)?.[1] ?? null;
}

function isActiveLibrary(library) {
  return library.status !== 'archived' && library.enabled !== '0';
}

function libraryCategory(metadata) {
  return metadata.match(/"libraryCategory"\s*:\s*"([^"]+)/)?.[1] ?? 'technical';
}

function libraryTaxonomy(metadata) {
  return metadata.match(/"taxonomyVersion"\s*:\s*"([^"]+)/)?.[1] ?? '';
}

function sortLibraries(left, right) {
  const leftRank = left.taxonomy === 'dialogue-security-v2' ? 0 : 1;
  const rightRank = right.taxonomy === 'dialogue-security-v2' ? 0 : 1;
  return leftRank - rightRank || right.updatedAt.localeCompare(left.updatedAt);
}

async function discover() {
  let adminUserId;
  let organizationId;
  const libraries = [];
  const stream = fs.createReadStream(sourcePath);
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of lines) {
    const table = insertTable(line);
    if (table !== 'users' && table !== 'security_case_libraries') {
      continue;
    }
    const values = splitInsertValues(line);
    if (!values) {
      throw new Error(`Cannot parse INSERT for ${table}`);
    }
    if (table === 'users' && sqlString(values[2]) === adminEmail) {
      adminUserId = sqlString(values[0]);
      organizationId = sqlString(values[1]);
      continue;
    }
    if (table === 'security_case_libraries') {
      const metadata = sqlString(values[12] ?? '');
      libraries.push({
        id: sqlString(values[0]),
        organizationId: sqlString(values[1]),
        category: libraryCategory(metadata),
        taxonomy: libraryTaxonomy(metadata),
        enabled: values[7],
        status: sqlString(values[10]),
        updatedAt: sqlString(values[16]) ?? '',
      });
    }
  }

  if (!adminUserId || !organizationId) {
    throw new Error(`No user with email ${adminEmail} was found`);
  }

  const selectPage = (category) =>
    libraries
      .filter(
        (library) =>
          library.organizationId === organizationId &&
          library.category === category &&
          isActiveLibrary(library),
      )
      .sort(sortLibraries)
      .slice(0, pageSize);

  const technical = selectPage('technical');
  const compliance = selectPage('compliance');
  if (technical.length !== pageSize || compliance.length !== pageSize) {
    throw new Error(
      `Expected ${pageSize} active libraries in both categories; found technical=${technical.length}, compliance=${compliance.length}`,
    );
  }

  return {
    adminUserId,
    organizationId,
    keptLibraryIds: new Set([...technical, ...compliance].map((library) => library.id)),
    technical,
    compliance,
  };
}

function shouldKeep(table, values, state) {
  switch (table) {
    case '__drizzle_migrations':
    case 'permissions':
    case 'subscription_plans':
    case 'task_types':
      return true;
    case 'organizations':
      return [state.organizationId, systemOrganizationId].includes(sqlString(values[0]));
    case 'users':
      return sqlString(values[0]) === state.adminUserId;
    case 'roles':
      return true;
    case 'security_case_libraries':
      return state.keptLibraryIds.has(sqlString(values[0]));
    case 'security_test_cases':
      return state.keptLibraryIds.has(sqlString(values[2]));
    default:
      return false;
  }
}

function sanitizeKeptValues(table, values) {
  const next = [...values];
  if (table === 'users') {
    // Retain the login hash, but remove MFA material, activity history and metadata.
    next[10] = 'NULL';
    next[11] = 'NULL';
    next[12] = 'NULL';
    next[13] = "'{}'";
  }
  if (table === 'organizations') {
    // The account's organization remains usable without retaining its custom branding or metadata.
    next[3] = 'NULL';
    next[7] = "'{}'";
  }
  return next;
}

async function transform(state) {
  const stats = { kept: {}, removed: {} };
  const output = apply ? fs.createWriteStream(outputPath, { encoding: 'utf8' }) : null;
  const lines = readline.createInterface({
    input: fs.createReadStream(sourcePath),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    const table = insertTable(line);
    if (!table) {
      if (output) output.write(`${line}\n`);
      continue;
    }

    const values = splitInsertValues(line);
    if (!values) {
      throw new Error(`Cannot parse INSERT for ${table}`);
    }
    if (!shouldKeep(table, values, state)) {
      stats.removed[table] = (stats.removed[table] ?? 0) + 1;
      continue;
    }

    stats.kept[table] = (stats.kept[table] ?? 0) + 1;
    if (output) {
      const safeValues = sanitizeKeptValues(table, values);
      output.write(`INSERT INTO \`${table}\` VALUES (${safeValues.join(', ')});\n`);
    }
  }

  if (output) {
    await new Promise((resolve, reject) => {
      output.on('error', reject);
      output.end(resolve);
    });
  }
  return stats;
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Input SQL file does not exist: ${sourcePath}`);
  }
  if (apply && sourcePath === targetPath && fs.existsSync(backupPath)) {
    throw new Error(`Backup already exists: ${backupPath}`);
  }

  const state = await discover();
  const report = {
    retainedAdmin: adminEmail,
    retainedTechnicalLibraries: state.technical.length,
    retainedComplianceLibraries: state.compliance.length,
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    console.log(
      '\nDry run only. Re-run with --apply to replace the SQL and create a local backup.',
    );
    return;
  }

  const stats = await transform(state);
  report.keptRows = stats.kept;
  report.removedRows = stats.removed;
  console.log(JSON.stringify(report, null, 2));

  if (sourcePath === targetPath) {
    fs.copyFileSync(targetPath, backupPath, fs.constants.COPYFILE_EXCL);
  }
  fs.renameSync(outputPath, targetPath);
  console.log(`\nSanitized SQL written to ${targetPath}`);
  console.log(`Original backup retained locally at ${backupPath}`);
}

main().catch((error) => {
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
