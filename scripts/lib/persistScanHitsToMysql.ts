/**
 * 将 Dify API 漏洞库扫描命中写入 MySQL：vulnerabilities + attack_commands
 * 依赖与后端相同的 DB 配置（DB_TYPE=mysql、DATABASE_URL 或 DB_HOST 等）。
 */

import { createHash, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

/** 与 `AttackCommandHitRow` 对齐，独立声明避免与 scan 脚本循环依赖 */
export type PersistableScanHitRow = {
  library_id: string;
  name: string;
  content: string;
  expected_success: string;
  non_vulnerability: string;
  attack_mode: string;
  risk_level: string;
  category?: string;
  evaluation_profile: 'expect_leak' | 'expect_refusal';
  matched_patterns?: string[];
};

export type PersistScanHitResult =
  | { ok: true; libraryId: string; vulnerabilityId: string; attackCommandId: string }
  | { ok: false; libraryId: string; skipped: string }
  | { ok: false; libraryId: string; error: string };

export type PersistScanHitsOptions = {
  /**
   * vulnerabilities.type: supports dify / fastgpt / n8n / coze.
   * - dify: legacy behavior
   * - fastgpt: FastGPT API black-box scan
   * - n8n: n8n webhook API black-box scan
   * - coze: Coze POST /v3/chat black-box scan
   */
  vulnerabilityType?: 'dify' | 'fastgpt' | 'n8n' | 'coze';
};

function buildCategoryForDb(
  vulnerabilityType: 'dify' | 'fastgpt' | 'n8n' | 'coze',
  category: string | undefined,
): string {
  const c = (category || '').trim();
  if (vulnerabilityType === 'fastgpt') {
    return c.length > 0 ? `FastGPT API - ${c}` : 'FastGPT API';
  }
  if (vulnerabilityType === 'n8n') {
    return c.length > 0 ? `N8N API - ${c}` : 'N8N API';
  }
  if (vulnerabilityType === 'coze') {
    return c.length > 0 ? `Coze API - ${c}` : 'Coze API';
  }
  return c.length > 0 ? c : 'dify-api';
}

function normalizeRiskLevel(s: string | undefined): 'critical' | 'high' | 'medium' | 'low' {
  const x = (s || 'medium').toLowerCase();
  if (x === 'critical' || x === 'high' || x === 'medium' || x === 'low') {
    return x;
  }
  return 'medium';
}

/** API / 表枚举：direct | mixed | conversation | composite */
function normalizeAttackModeForDb(mode: string): 'direct' | 'mixed' | 'conversation' | 'composite' {
  if (mode === 'multi_turn' || mode === 'conversation') {
    return 'conversation';
  }
  if (mode === 'mixed' || mode === 'composite') {
    return mode;
  }
  return 'direct';
}

/** avd_id 唯一且 ≤50，用于按 library_id 复用同一条漏洞记录 */
function buildAvdId(libraryId: string, prefix: string): string {
  const safe = libraryId.replace(/[^a-zA-Z0-9_-]/g, '');
  const prefixed = `${prefix}-${safe}`;
  if (prefixed.length <= 50) {
    return prefixed;
  }
  const h = createHash('sha256').update(libraryId).digest('hex').slice(0, 16);
  return `${prefix}-${h}`;
}

/** Coze 库 id 已为 COZE- 前缀时直接使用，避免 COZE-COZE- 重复 */
function buildCozeAvdId(libraryId: string): string {
  const t = libraryId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (/^COZE/i.test(t) && t.length > 0 && t.length <= 50) {
    return t;
  }
  return buildAvdId(libraryId, 'COZE');
}

/**
 * 查找或创建 vulnerability，再插入 attack_command。
 */
export async function persistScanHitToMysql(
  row: PersistableScanHitRow,
  options?: PersistScanHitsOptions,
): Promise<PersistScanHitResult> {
  const vulnerabilityType = options?.vulnerabilityType ?? 'dify';
  const avdPrefix =
    vulnerabilityType === 'fastgpt'
      ? 'FASTGPT-SCAN'
      : vulnerabilityType === 'n8n'
        ? 'N8N-SCAN'
        : vulnerabilityType === 'coze'
          ? 'COZE'
          : 'DIFY-SCAN';
  const sourceBase =
    vulnerabilityType === 'fastgpt'
      ? 'fastgpt-api-vuln-library-scan'
      : vulnerabilityType === 'n8n'
        ? 'n8n-api-vuln-library-scan'
        : vulnerabilityType === 'coze'
          ? 'coze-api-vuln-library-scan'
          : 'dify-api-vuln-library-scan';

  let getDbType: () => string;
  let getDb: () => unknown;
  try {
    const dbIndex = await import('../../backend/src/database/index');
    getDbType = dbIndex.getDbType;
    getDb = dbIndex.getDb;
  } catch (e) {
    return {
      ok: false,
      libraryId: row.library_id,
      error: `无法加载数据库模块: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (getDbType() !== 'mysql') {
    return { ok: false, libraryId: row.library_id, skipped: '仅支持 MySQL（DB_TYPE=mysql）' };
  }

  let vulnerabilitiesTable: typeof import('../../backend/src/database/tables-mysql').vulnerabilitiesTable;
  let attackCommandsTable: typeof import('../../backend/src/database/tables-mysql').attackCommandsTable;
  try {
    const tables = await import('../../backend/src/database/tables-mysql');
    vulnerabilitiesTable = tables.vulnerabilitiesTable;
    attackCommandsTable = tables.attackCommandsTable;
  } catch (e) {
    return {
      ok: false,
      libraryId: row.library_id,
      error: `无法加载表定义: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const db = getDb() as import('drizzle-orm/mysql2').MySql2Database;
  const avdId =
    vulnerabilityType === 'coze'
      ? buildCozeAvdId(row.library_id)
      : buildAvdId(row.library_id, avdPrefix);
  const now = new Date();

  try {
    const existing = await db
      .select({ id: vulnerabilitiesTable.id })
      .from(vulnerabilitiesTable)
      .where(eq(vulnerabilitiesTable.avdId, avdId))
      .limit(1);

    let vulnerabilityId: string;
    if (existing.length > 0) {
      vulnerabilityId = existing[0]!.id;
    } else {
      vulnerabilityId = randomUUID();
      await db.insert(vulnerabilitiesTable).values({
        id: vulnerabilityId,
        avdId,
        name: row.name.slice(0, 255),
        type: vulnerabilityType,
        category: buildCategoryForDb(vulnerabilityType, row.category).slice(0, 100),
        riskLevel: normalizeRiskLevel(row.risk_level),
        status: 'discovered',
        description:
          row.expected_success.slice(0, 8000) ||
          `${
            vulnerabilityType === 'fastgpt'
              ? 'FastGPT'
              : vulnerabilityType === 'n8n'
                ? 'N8N'
                : vulnerabilityType === 'coze'
                  ? 'Coze'
                  : 'Dify'
          } API 漏洞库扫描自动入库（${row.evaluation_profile}）。`,
        impactScope:
          vulnerabilityType === 'fastgpt'
            ? 'FastGPT POST /api/v1/chat/completions 黑盒扫描命中；详见 attack_commands.content。'
            : vulnerabilityType === 'n8n'
              ? 'N8N POST webhook 黑盒扫描命中；详见 attack_commands.content。'
              : vulnerabilityType === 'coze'
                ? 'Coze POST /v3/chat 黑盒扫描命中；详见 attack_commands.content。'
                : 'Dify POST /v1/chat-messages 黑盒扫描命中；详见 attack_commands.content。',
        affectedTargets: JSON.stringify([
          vulnerabilityType === 'fastgpt'
            ? { type: 'fastgpt_chat_api', versions: [] as string[] }
            : vulnerabilityType === 'n8n'
              ? { type: 'n8n_webhook_api', versions: [] as string[] }
              : vulnerabilityType === 'coze'
                ? { type: 'coze_chat_api', versions: [] as string[] }
                : { type: 'dify_chat_api', versions: [] as string[] },
        ]),
        tags: JSON.stringify([`${vulnerabilityType}-api-scan`, 'auto-import']),
        verificationMode: 'api_blackbox',
        metadata: JSON.stringify({
          source: sourceBase,
          library_id: row.library_id,
          evaluation_profile: row.evaluation_profile,
        }),
        createdAt: now,
        updatedAt: now,
      });
    }

    const commandId = randomUUID();
    await db.insert(attackCommandsTable).values({
      id: commandId,
      vulnerabilityId,
      name: row.name.slice(0, 255),
      content: row.content,
      attackMode: normalizeAttackModeForDb(row.attack_mode),
      expectedSuccess: row.expected_success || null,
      nonVulnerability: row.non_vulnerability || null,
      riskLevel: normalizeRiskLevel(row.risk_level),
      enabled: true,
      metadata: JSON.stringify({
        source: sourceBase,
        library_id: row.library_id,
        evaluation_profile: row.evaluation_profile,
        matched_patterns: row.matched_patterns ?? [],
      }),
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      libraryId: row.library_id,
      vulnerabilityId,
      attackCommandId: commandId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, libraryId: row.library_id, error: msg };
  }
}
