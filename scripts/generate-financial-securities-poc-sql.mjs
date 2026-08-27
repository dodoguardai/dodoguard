#!/usr/bin/env node
/**
 * Generate MySQL seed SQL for financial-securities POC vulnerabilities (20 items).
 *
 * Usage:
 *   node scripts/generate-financial-securities-poc-sql.mjs
 *   node scripts/generate-financial-securities-poc-sql.mjs --out scripts/insert-financial-securities-poc-vulnerabilities.sql
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const YAML_PATH = path.join(ROOT, 'configs/financial-securities-poc-attacks.yaml');
const DEFAULT_OUT = path.join(ROOT, 'scripts/insert-financial-securities-poc-vulnerabilities.sql');

const AVD_PREFIX = 'AVD-FINSEC-POC-20260608';
/** 统一批次标记：tags / metadata.batch / audit_notes / fingerprint 均使用此值，便于检索 */
const BATCH_MARK = 'finsec-poc-20260608';
const CVSS = { critical: 9.0, high: 7.5, medium: 5.5, low: 3.5 };

const CWE_MAP = {
  'finsec-data-api-1': 'CWE-862',
  'finsec-data-config-1': 'CWE-798',
  'finsec-data-api-2': 'CWE-532',
  'finsec-data-config-2': 'CWE-284',
  'finsec-data-config-3': 'CWE-200',
  'finsec-tech-api-1': 'CWE-862',
  'finsec-tech-config-1': 'CWE-918',
  'finsec-tech-api-2': 'CWE-89',
  'finsec-tech-config-2': 'CWE-269',
  'finsec-tech-api-3': 'CWE-200',
  'finsec-compliance-api-1': 'CWE-693',
  'finsec-compliance-api-2': 'CWE-693',
  'finsec-compliance-config-1': 'CWE-693',
  'finsec-compliance-api-3': 'CWE-693',
  'finsec-compliance-config-2': 'CWE-778',
  'finsec-ops-api-1': 'CWE-862',
  'finsec-ops-config-1': 'CWE-1188',
  'finsec-ops-api-2': 'CWE-862',
  'finsec-ops-api-3': 'CWE-20',
  'finsec-ops-config-2': 'CWE-770',
};

const OWASP_MAP = {
  'finsec-data-api-1': 'LLM06',
  'finsec-data-config-1': 'LLM06',
  'finsec-data-api-2': 'LLM06',
  'finsec-data-config-2': 'LLM01',
  'finsec-data-config-3': 'LLM03',
  'finsec-tech-api-1': 'LLM06',
  'finsec-tech-config-1': 'LLM05',
  'finsec-tech-api-2': 'LLM06',
  'finsec-tech-config-2': 'LLM06',
  'finsec-tech-api-3': 'LLM07',
  'finsec-compliance-api-1': 'LLM09',
  'finsec-compliance-api-2': 'LLM09',
  'finsec-compliance-config-1': 'LLM09',
  'finsec-compliance-api-3': 'LLM09',
  'finsec-compliance-config-2': 'LLM09',
  'finsec-ops-api-1': 'LLM06',
  'finsec-ops-config-1': 'LLM08',
  'finsec-ops-api-2': 'LLM06',
  'finsec-ops-api-3': 'LLM09',
  'finsec-ops-config-2': 'LLM04',
};

function sqlEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function padSeq(n) {
  return String(n).padStart(3, '0');
}

function vulnUuid(seq) {
  const code = 100 + seq;
  const s3 = String(code);
  const s4 = s3.padStart(4, '0');
  return `fsec0${s3}-${s4}-4000-a${s3}-000000000${s3}`;
}

function cmdUuid(seq) {
  const code = 100 + seq;
  const s3 = String(code);
  const s4 = s3.padStart(4, '0');
  return `esec0${s3}-${s4}-4000-a${s3}-000000000${s3}`;
}

function isApiCmd(cmd) {
  return (cmd.tags || []).includes('api');
}

function parseOutArg() {
  const i = process.argv.indexOf('--out');
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : DEFAULT_OUT;
}

function main() {
  const raw = fs.readFileSync(YAML_PATH, 'utf8');
  const doc = yaml.load(raw);
  const commands = doc.commands || [];
  if (commands.length !== 20) {
    console.warn(`Expected 20 commands, got ${commands.length}`);
  }

  const lines = [];
  lines.push('-- =============================================================================');
  lines.push('-- 金融证券专用漏洞库（20 条）');
  lines.push('-- 数据安全 / 技术风险 / 合规风险 / 操作风险 各 5 条（API 3 + Config 2）');
  lines.push('-- =============================================================================');
  lines.push('-- 来源: configs/financial-securities-poc-attacks.yaml');
  lines.push('-- 生成: node scripts/generate-financial-securities-poc-sql.mjs');
  lines.push('--');
  lines.push('-- 用法:');
  lines.push('--   mysql -h HOST -u USER -p DATABASE < scripts/insert-financial-securities-poc-vulnerabilities.sql');
  lines.push('--');
  lines.push('-- 说明:');
  lines.push(`--   avd_id 前缀: ${AVD_PREFIX}-001 … ${AVD_PREFIX}-020`);
  lines.push(`--   批次标记: ${BATCH_MARK}（写入 tags / metadata.batch / audit_notes / fingerprint）`);
  lines.push('--   检索示例:');
  lines.push(`--     SELECT * FROM vulnerabilities WHERE avd_id LIKE '${AVD_PREFIX}%'`);
  lines.push(`--     SELECT * FROM vulnerabilities WHERE JSON_CONTAINS(tags, '"${BATCH_MARK}"')`);
  lines.push(`--     SELECT * FROM vulnerabilities WHERE audit_notes LIKE '%${BATCH_MARK}%'`);
  lines.push('--   UI: 漏洞库搜索 AVD-FINSEC-POC 或 finsec-poc-20260608；详情页可看 tags / 审计备注');
  lines.push('-- =============================================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('');
  lines.push('START TRANSACTION;');
  lines.push('');
  lines.push('INSERT INTO `vulnerabilities` (');
  lines.push('  `id`, `avd_id`, `name`, `type`, `category`, `risk_level`, `cvss_score`, `status`, `disclosed_at`,');
  lines.push('  `description`, `affected_targets`, `impact_scope`, `cwe_id`, `mitre_id`, `owasp_id`,');
  lines.push('  `owasp_llm_top10_mapping`, `exploitability`, `patch_status`, `audit_notes`, `tags`, `metadata`,');
  lines.push('  `created_at`, `updated_at`, `created_by`, `updated_by`,');
  lines.push('  `adv_id`, `platform_family`, `platform_product`, `artifact_kind`, `detection_phase`,');
  lines.push('  `vuln_subtype`, `root_cause_type`, `verification_mode`, `default_confidence`,');
  lines.push('  `aliases`, `framework_mappings`, `preconditions`, `trigger_conditions`, `report_profile`, `fingerprint`');
  lines.push(') VALUES');

  const vulnTuples = [];
  const cmdTuples = [];

  commands.forEach((cmd, idx) => {
    const seq = idx + 1;
    const seqStr = padSeq(seq);
    const isApi = isApiCmd(cmd);
    const vid = vulnUuid(seq);
    const cid = cmdUuid(seq);
    const avdId = `${AVD_PREFIX}-${seqStr}`;
    const advId = `ADV-FINSEC-POC-${seqStr}`;
    const risk = cmd.riskLevel || 'medium';
    const cvss = CVSS[risk] ?? null;
    const cwe = CWE_MAP[cmd.id] || null;
    const owasp = OWASP_MAP[cmd.id] || null;
    const verificationMode = isApi ? 'api_blackbox' : 'config_audit';
    const dbCategory = isApi ? 'Dify API' : 'Dify Config';
    const artifactKind = isApi ? 'chat_api' : 'config';
    const detectionPhase = isApi ? 'runtime' : 'static';
    const vulnSubtype = (cmd.type || 'financial-securities').replace(/-/g, '_').slice(0, 100);
    const tagSet = new Set([BATCH_MARK, 'financial-securities-poc', ...(cmd.tags || [])]);
    const tags = [...tagSet];
    const tagsJson = JSON.stringify(tags);
    const meta = {
      batch: BATCH_MARK,
      dataset: 'financial-securities-poc',
      source: 'configs/financial-securities-poc-attacks.yaml',
      yaml_id: cmd.id,
      risk_category: cmd.category,
      category_id: cmd.categoryId,
      attack_target: cmd.attackTarget,
      poc_priority: 1000 - seq,
    };
    const metaJson = JSON.stringify(meta);
    const auditNotes = `[${BATCH_MARK}] 金融证券客户POC专用批次 | 来源: configs/financial-securities-poc-attacks.yaml | 仅限授权测评环境`;
    const desc = `${cmd.attackTarget || cmd.category}。仅限授权测评环境使用。`;
    const impact = isApi
      ? '对话/API 运行时可能导致客户数据泄露、越权操作、合规违规或业务中断。'
      : '工作流/Agent 配置缺陷可能导致静态审计发现高危配置面，或在灰盒联调中被利用。';
    const targets = isApi
      ? '[{"type":"dify_chat_api","versions":[]},{"type":"coze_bot_api","versions":[]},{"type":"fastgpt_chat_api","versions":[]}]'
      : '[{"type":"dify_workflow_export","versions":[]},{"type":"coze_workflow_export","versions":[]}]';
    const confidence = isApi ? 0.88 : 0.9;

    vulnTuples.push(`(
  '${vid}',
  '${avdId}',
  '${sqlEscape(cmd.name)}',
  'dify',
  '${dbCategory}',
  '${risk}',
  ${cvss},
  'confirmed',
  NOW(),
  '${sqlEscape(desc)}',
  CAST('${targets}' AS JSON),
  '${sqlEscape(impact)}',
  ${cwe ? `'${cwe}'` : 'NULL'},
  NULL,
  ${owasp ? `'${owasp}'` : 'NULL'},
  NULL, NULL, NULL,
  '${sqlEscape(auditNotes)}',
  CAST('${sqlEscape(tagsJson)}' AS JSON),
  CAST('${sqlEscape(metaJson)}' AS JSON),
  NOW(), NOW(),
  NULL, NULL,
  '${advId}',
  'dify',
  'Dify',
  '${artifactKind}',
  '${detectionPhase}',
  '${sqlEscape(vulnSubtype)}',
  'financial_securities_poc',
  '${verificationMode}',
  ${confidence},
  NULL, NULL, NULL, NULL, NULL, '${BATCH_MARK}'
)`);

    cmdTuples.push(`(
  '${cid}',
  '${vid}',
  '${sqlEscape(cmd.name)}',
  '${sqlEscape(cmd.content)}',
  'direct',
  '${sqlEscape(cmd.expectedSuccess)}',
  '${sqlEscape(cmd.nonVulnerability)}',
  '${risk}',
  1,
  CAST('${sqlEscape(JSON.stringify({ batch: BATCH_MARK, yaml_id: cmd.id, adv_id: advId }))}' AS JSON),
  NOW(), NOW()
)`);
  });

  lines.push(vulnTuples.join(',\n'));
  lines.push(`ON DUPLICATE KEY UPDATE
  \`name\` = VALUES(\`name\`),
  \`category\` = VALUES(\`category\`),
  \`risk_level\` = VALUES(\`risk_level\`),
  \`cvss_score\` = VALUES(\`cvss_score\`),
  \`description\` = VALUES(\`description\`),
  \`impact_scope\` = VALUES(\`impact_scope\`),
  \`audit_notes\` = VALUES(\`audit_notes\`),
  \`tags\` = VALUES(\`tags\`),
  \`metadata\` = VALUES(\`metadata\`),
  \`fingerprint\` = VALUES(\`fingerprint\`),
  \`verification_mode\` = VALUES(\`verification_mode\`),
  \`updated_at\` = NOW(),
  \`created_at\` = NOW();`);
  lines.push('');
  lines.push('INSERT INTO `attack_commands` (');
  lines.push('  `id`, `vulnerability_id`, `name`, `content`, `attack_mode`,');
  lines.push('  `expected_success`, `non_vulnerability`, `risk_level`, `enabled`, `metadata`,');
  lines.push('  `created_at`, `updated_at`');
  lines.push(') VALUES');
  lines.push(cmdTuples.join(',\n'));
  lines.push(`ON DUPLICATE KEY UPDATE
  \`content\` = VALUES(\`content\`),
  \`expected_success\` = VALUES(\`expected_success\`),
  \`non_vulnerability\` = VALUES(\`non_vulnerability\`),
  \`enabled\` = 1,
  \`metadata\` = VALUES(\`metadata\`),
  \`updated_at\` = NOW();`);
  lines.push('');
  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- 导入后验证:');
  lines.push(`--   SELECT avd_id, name, category, verification_mode, created_at FROM vulnerabilities WHERE avd_id LIKE '${AVD_PREFIX}%' ORDER BY avd_id;`);

  const outPath = parseOutArg();
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Wrote ${commands.length} vulnerabilities to ${outPath}`);
}

main();
