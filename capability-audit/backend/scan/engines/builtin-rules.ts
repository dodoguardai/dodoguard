/**
 * Built-in text/regex rules — always available (quick scan baseline).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { inferSkillAuditDimension } from '../../../../backend/src/services/skillsMdAuditDimensions';
import type { EngineAdapter, EngineContext, EngineRunStatus, UnifiedFinding } from './types';

type Rule = {
  id: string;
  category: string;
  severity: UnifiedFinding['severity'];
  pattern: RegExp;
  issue: string;
  recommendation: string;
};

const RULES: Rule[] = [
  {
    id: 'SKILL-CMD-001',
    category: 'B_SUPPLY_CHAIN',
    severity: 'high',
    pattern: /curl\s+[^\n|]*\|\s*(ba)?sh\b|wget\s+[^\n|]*\|\s*sh\b/i,
    issue: '管道下载并执行远程脚本',
    recommendation: '禁止 curl|bash 安装；使用固定版本与哈希校验',
  },
  {
    id: 'SKILL-SEC-001',
    category: 'A_SECRET',
    severity: 'critical',
    pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    issue: '硬编码密钥或 Token',
    recommendation: '使用环境变量或密钥管理服务，勿写入源码',
  },
  {
    id: 'SKILL-EXF-001',
    category: 'D_DATA',
    severity: 'medium',
    pattern: /requests\.post|fetch\s*\(|axios\.post/i,
    issue: '外部 HTTP 请求（需复核是否为公开数据源/未披露外传）',
    recommendation: '核对目标域名与是否发送敏感数据；公开数据源应声明，未知外域需用户确认',
  },
  {
    id: 'SKILL-ENV-001',
    category: 'A_SECRET',
    severity: 'medium',
    pattern: /os\.environ|process\.env|getenv\s*\(/i,
    issue: '读取环境变量',
    recommendation: '最小化 env 访问，禁止输出敏感 env',
  },
  {
    id: 'SKILL-INJ-001',
    category: 'E_PROMPT',
    severity: 'high',
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions|system\s+override/i,
    issue: '疑似提示词注入/指令覆盖',
    recommendation: '移除越权指令并补充安全边界',
  },
  {
    id: 'SKILL-CMD-002',
    category: 'F_TOOL',
    severity: 'critical',
    pattern: /\beval\s*\(|exec\s*\(|subprocess\.(call|run|Popen)|child_process/i,
    issue: '动态代码执行（eval/exec/subprocess）',
    recommendation: '禁止对不可信输入使用 eval；沙箱化执行并限制命令白名单',
  },
  {
    id: 'SKILL-PRIV-001',
    category: 'F_TOOL',
    severity: 'critical',
    pattern: /\bsudo\b|chmod\s+4777|setuid/i,
    issue: '权限提升相关操作',
    recommendation: '禁止 sudo 与非必要提权',
  },
];

/** Skip doc/error-message sudo hints — real privilege calls still match. */
function shouldSkipPrivRule(line: string): boolean {
  return /(?:raise\s+RuntimeError|warn\s|info\s|echo\s+|print\s*\(|To fix permanently|Run manually|Install it:|Option\s+\d)/i.test(
    line,
  );
}

const TEXT_EXT = /\.(md|markdown|py|js|ts|sh|bash|json|yaml|yml|txt|toml)$/i;

async function scanFile(workDir: string, relPath: string): Promise<UnifiedFinding[]> {
  if (!TEXT_EXT.test(relPath)) {
    return [];
  }
  let content: string;
  try {
    content = await readFile(join(workDir, relPath), 'utf8');
  } catch {
    return [];
  }

  const findings: UnifiedFinding[] = [];
  const lines = content.split('\n');

  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!rule.pattern.test(line)) {
        continue;
      }
      if (rule.id === 'SKILL-PRIV-001' && shouldSkipPrivRule(line)) {
        continue;
      }
      const dim = inferSkillAuditDimension({
        category: rule.category,
        issue: rule.issue,
        evidence: line.trim(),
        location: `${relPath}:${i + 1}`,
      });
      findings.push({
        severity: rule.severity,
        category: rule.category,
        location: `${relPath}:${i + 1}`,
        issue: rule.issue,
        evidence: line.trim().slice(0, 500),
        recommendation: rule.recommendation,
        dimension: dim,
        sourceFile: relPath,
        sourceEngines: ['builtin_rules'],
        ruleIds: [rule.id],
        confidence: 'high',
      });
    }
  }
  return findings;
}

export const builtinRulesEngine: EngineAdapter = {
  name: 'builtin_rules',
  async run(ctx: EngineContext) {
    const start = Date.now();
    const all: UnifiedFinding[] = [];
    for (const rel of ctx.filePaths) {
      all.push(...(await scanFile(ctx.workDir, rel)));
    }
    const status: EngineRunStatus = {
      engine: 'builtin_rules',
      status: 'success',
      findingCount: all.length,
      durationMs: Date.now() - start,
    };
    return { findings: all, status };
  },
};
