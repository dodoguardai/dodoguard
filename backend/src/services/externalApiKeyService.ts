/**
 * Programmatic API keys: issue, verify, list, revoke.
 * Key format: zhian.<row-uuid>.<base64url-secret> (full string is bcrypt-hashed only).
 */

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';

export const EXTERNAL_API_SCOPES = {
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  AGENTS_READ: 'agents:read',
  VULNERABILITIES_READ: 'vulnerabilities:read',
  ASSETS_READ: 'assets:read',
  ASSETS_WRITE: 'assets:write',
  ASSESSMENTS_READ: 'assessments:read',
  ASSESSMENTS_WRITE: 'assessments:write',
  REMEDIATIONS_READ: 'remediations:read',
  REMEDIATIONS_WRITE: 'remediations:write',
  REPORTS_READ: 'reports:read',
  WORKBENCH_READ: 'workbench:read',
} as const;

export type ExternalApiScope = (typeof EXTERNAL_API_SCOPES)[keyof typeof EXTERNAL_API_SCOPES];

export const ALL_EXTERNAL_API_SCOPES: ExternalApiScope[] = Object.values(EXTERNAL_API_SCOPES);

export const DEFAULT_EXTERNAL_SCOPES: string[] = [
  EXTERNAL_API_SCOPES.TASKS_READ,
  EXTERNAL_API_SCOPES.TASKS_WRITE,
  EXTERNAL_API_SCOPES.AGENTS_READ,
  EXTERNAL_API_SCOPES.VULNERABILITIES_READ,
  EXTERNAL_API_SCOPES.ASSETS_READ,
  EXTERNAL_API_SCOPES.ASSETS_WRITE,
  EXTERNAL_API_SCOPES.ASSESSMENTS_READ,
  EXTERNAL_API_SCOPES.ASSESSMENTS_WRITE,
  EXTERNAL_API_SCOPES.REMEDIATIONS_READ,
  EXTERNAL_API_SCOPES.REMEDIATIONS_WRITE,
  EXTERNAL_API_SCOPES.REPORTS_READ,
  EXTERNAL_API_SCOPES.WORKBENCH_READ,
];

export function isValidExternalApiScope(scope: string): scope is ExternalApiScope {
  return (ALL_EXTERNAL_API_SCOPES as string[]).includes(scope);
}

/**
 * Normalize and validate scopes. Empty/omitted → defaults.
 * Throws Error with code INVALID_SCOPE when unknown scopes are present.
 */
export function normalizeAndValidateScopes(scopes: string[] | undefined | null): string[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return [...DEFAULT_EXTERNAL_SCOPES];
  }
  const cleaned = [...new Set(scopes.map((s) => String(s).trim()).filter(Boolean))];
  const invalid = cleaned.filter((s) => !isValidExternalApiScope(s));
  if (invalid.length > 0) {
    const err = new Error(`Invalid scopes: ${invalid.join(', ')}`);
    (err as Error & { code?: string; invalid?: string[] }).code = 'INVALID_SCOPE';
    (err as Error & { invalid?: string[] }).invalid = invalid;
    throw err;
  }
  return cleaned;
}

export type ExternalApiKeyRow = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  secretHash: string;
  scopes: unknown;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function getExternalApiKeysTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../database/tables-mysql').externalApiKeysTable;
  }
  return require('../database/tables-enterprise').externalApiKeysTable;
}

function buildFullKey(id: string, secretPart: string) {
  return `zhian.${id}.${secretPart}`;
}

export function formatNewExternalApiKey(id: string, secretPart: string) {
  return buildFullKey(id, secretPart);
}

export function parseExternalApiKeyFromAuthorization(
  raw: string,
): { id: string; fullKey: string } | null {
  if (!raw.startsWith('zhian.')) {
    return null;
  }
  const without = raw.slice('zhian.'.length);
  const i = without.indexOf('.');
  if (i <= 0) {
    return null;
  }
  const id = without.slice(0, i);
  const secretPart = without.slice(i + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id) || secretPart.length < 16) {
    return null;
  }
  return { id, fullKey: raw };
}

function normalizeScopes(scopes: string[] | undefined | null): string[] {
  if (Array.isArray(scopes) && scopes.length > 0) {
    return [...new Set(scopes.map((s) => String(s).trim()).filter(Boolean))];
  }
  return [...DEFAULT_EXTERNAL_SCOPES];
}

export async function createExternalApiKey(options: {
  organizationId: string;
  createdByUserId: string;
  name: string;
  expiresAt: Date | null;
  scopes?: string[];
}): Promise<{ row: ExternalApiKeyRow; plaintextKey: string }> {
  const table = getExternalApiKeysTable();
  const id = uuidv4();
  const secretPart = randomBytes(32).toString('base64url');
  const plaintextKey = formatNewExternalApiKey(id, secretPart);
  const secretHash = await bcrypt.hash(plaintextKey, 10);

  const scopesJson = normalizeAndValidateScopes(options.scopes);

  const insertValues: Record<string, unknown> = {
    id,
    organizationId: options.organizationId,
    createdByUserId: options.createdByUserId,
    name: options.name.trim(),
    secretHash,
    scopes: scopesJson,
    status: 'active',
    expiresAt: options.expiresAt,
    lastUsedAt: null,
  };

  const dbType = getDbType();
  if (dbType === 'mysql') {
    await db.insert(table).values(insertValues as any);
    return { row: insertValues as unknown as ExternalApiKeyRow, plaintextKey };
  }
  const [row] = await db
    .insert(table)
    .values(insertValues as any)
    .returning();
  return { row: row as ExternalApiKeyRow, plaintextKey };
}

export async function listExternalApiKeys(organizationId: string): Promise<ExternalApiKeyRow[]> {
  const table = getExternalApiKeysTable();
  return db
    .select()
    .from(table)
    .where(eq(table.organizationId, organizationId))
    .orderBy(desc(table.createdAt)) as Promise<ExternalApiKeyRow[]>;
}

export async function revokeExternalApiKey(
  organizationId: string,
  keyId: string,
): Promise<boolean> {
  const table = getExternalApiKeysTable();
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, keyId), eq(table.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    return false;
  }
  await db
    .update(table)
    .set({ status: 'revoked', updatedAt: new Date() } as any)
    .where(eq(table.id, keyId));
  return true;
}

/** Hard-delete a key row only when it is already revoked (cleanup / tidy list). */
export async function purgeRevokedExternalApiKey(
  organizationId: string,
  keyId: string,
): Promise<'ok' | 'not_found' | 'not_revoked'> {
  const table = getExternalApiKeysTable();
  const [row] = await db
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(and(eq(table.id, keyId), eq(table.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    return 'not_found';
  }
  if (row.status !== 'revoked') {
    return 'not_revoked';
  }
  await db.delete(table).where(eq(table.id, keyId));
  return 'ok';
}

export async function verifyExternalApiKey(
  fullKey: string,
): Promise<(ExternalApiKeyRow & { scopes: string[] }) | null> {
  const parsed = parseExternalApiKeyFromAuthorization(fullKey);
  if (!parsed) {
    return null;
  }
  const table = getExternalApiKeysTable();
  const [keyRow] = await db.select().from(table).where(eq(table.id, parsed.id)).limit(1);
  if (!keyRow) {
    return null;
  }
  if (keyRow.status !== 'active') {
    return null;
  }
  if (keyRow.expiresAt) {
    const ex = new Date(keyRow.expiresAt as Date);
    if (ex.getTime() < Date.now()) {
      return null;
    }
  }
  const match = await bcrypt.compare(parsed.fullKey, keyRow.secretHash);
  if (!match) {
    return null;
  }
  const scopes = normalizeScopes(keyRow.scopes as string[]);
  void touchLastUsed(keyRow.id).catch((e) =>
    logger.warn('externalApiKey lastUsedAt update failed', e),
  );
  return { ...(keyRow as ExternalApiKeyRow), scopes };
}

async function touchLastUsed(keyId: string) {
  const table = getExternalApiKeysTable();
  await db
    .update(table)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(table.id, keyId));
}

export function hashIdempotencyKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** True when DB migration for external_api_keys has not been applied yet */
export function isMissingExternalApiKeysTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    const msg = current instanceof Error ? current.message : String(current);
    const e = current as { code?: string; errno?: number };
    if ((e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE') && /external_api_keys/i.test(msg)) {
      return true;
    }
    if (e.code === '42P01' || /relation .*external_api_keys.* does not exist/i.test(msg)) {
      return true;
    }
    if (
      /external_api_keys/i.test(msg) &&
      /doesn't exist|does not exist|Unknown table|no such table/i.test(msg)
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
