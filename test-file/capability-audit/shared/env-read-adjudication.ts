/**
 * Secondary adjudication for environment-variable reads (SkillSpector / builtin rules).
 * Do not inherit engine "high" blindly — classify by variable name and data flow.
 */

import type { ProcessingStatus } from './finding-disposition';

export type EnvReadAdjudicationInput = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  location: string;
  issue: string;
  evidence: string;
  sourceFile?: string;
  dimension?: string;
};

export type EnvReadAdjudicationResult = {
  scenario: EnvReadScenario;
  processingStatus: ProcessingStatus;
  severity: 'low' | 'medium' | 'high' | 'critical';
  dimension?: string;
  riskType?:
    | 'sensitive_data_leakage'
    | 'external_network_risk'
    | 'config_auth_risk'
    | 'dangerous_code_execution';
  note: string;
  /** Override finding issue / title when set */
  issue?: string;
  /** Override remediation recommendation when set */
  recommendation?: string;
};

export type EnvReadScenario =
  | 'not_env_read'
  | 'plain_read'
  | 'sensitive_var'
  | 'auth_declared_api'
  | 'log_leak'
  | 'exfil_unknown'
  | 'full_enumeration'
  | 'full_enumeration_exfil';

const ENV_READ_RE =
  /os\.environ|process\.env|getenv\s*\(|dotenv|load_dotenv|environment variable|环境变量/i;

const SENSITIVE_VAR_RE =
  /(token|secret|password|passwd|api[_-]?key|credential|auth|private[_-]?key|access[_-]?key)/i;

const FULL_ENV_RE =
  /dict\s*\(\s*os\.environ|os\.environ\.items\s*\(|for\s+\w+\s+in\s+os\.environ|json\.dumps\s*\(\s*os\.environ|process\.env\s*(?:;|,|\)|\]|$)/i;

const LOG_SINK_RE =
  /\b(print\s*\(|logging\.|logger\.|console\.log|console\.error|stderr|sys\.stderr|pprint)/i;

const AUTH_SINK_RE =
  /\b(authorization|headers?\s*\[|headers?\s*=|bearer\s+|setdefault\s*\(\s*['"]authorization)/i;

const EXFIL_RE =
  /\b(requests\.(post|put|patch)|fetch\s*\(|axios\.|httpx\.|urllib\.request|http\.client|aiohttp)/i;

const KNOWN_API_HOST_RE =
  /(?:api\.)?(?:github\.com|openai\.com|anthropic\.com|dashscope\.aliyuncs\.com|cloudflare\.com|googleapis\.com|amazonaws\.com|azure\.com|microsoft\.com|slack\.com|notion\.com)/i;

function haystack(f: EnvReadAdjudicationInput): string {
  return `${f.issue}\n${f.evidence}\n${f.location}`.toLowerCase();
}

function extractVarName(h: string): string | undefined {
  const patterns = [
    /os\.environ\.get\s*\(\s*['"]([^'"]+)['"]/i,
    /os\.environ\s*\[\s*['"]([^'"]+)['"]\s*\]/i,
    /process\.env\.([a-z0-9_]+)/i,
    /process\.env\s*\[\s*['"]([^'"]+)['"]\s*\]/i,
    /getenv\s*\(\s*['"]([^'"]+)['"]/i,
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (m?.[1]) {
      return m[1];
    }
  }
  return undefined;
}

function hasUnknownExternalUrl(h: string): boolean {
  const urls = [...h.matchAll(/https?:\/\/[^\s'"`)]+/gi)].map((m) => m[0].toLowerCase());
  if (urls.length === 0) {
    return /\b(requests\.|fetch\s*\(|axios\.|httpx\.)/i.test(h);
  }
  return urls.some((url) => !KNOWN_API_HOST_RE.test(url));
}

function hasDeclaredApiFlow(h: string): boolean {
  return AUTH_SINK_RE.test(h) && (KNOWN_API_HOST_RE.test(h) || !hasUnknownExternalUrl(h));
}

export function isEnvReadFinding(f: EnvReadAdjudicationInput): boolean {
  const h = haystack(f);
  if (ENV_READ_RE.test(h)) {
    return true;
  }
  const cat = (f.category || '').toUpperCase();
  if (
    (cat.includes('SECRET') || cat.includes('CREDENTIAL') || cat.includes('ENV')) &&
    /environ|process\.env|getenv/i.test(h)
  ) {
    return true;
  }
  return /environment variable|env var|读取环境|环境变量/i.test(h);
}

export function classifyEnvReadScenario(f: EnvReadAdjudicationInput): EnvReadScenario {
  if (!isEnvReadFinding(f)) {
    return 'not_env_read';
  }

  const h = haystack(f);
  const varName = extractVarName(h);
  const sensitive = varName ? SENSITIVE_VAR_RE.test(varName) : SENSITIVE_VAR_RE.test(h);
  const fullEnum = FULL_ENV_RE.test(h);
  const exfil = EXFIL_RE.test(h) && hasUnknownExternalUrl(h);
  const logLeak = LOG_SINK_RE.test(h);

  if (fullEnum && (exfil || EXFIL_RE.test(h))) {
    return 'full_enumeration_exfil';
  }
  if (fullEnum) {
    return 'full_enumeration';
  }
  if (sensitive && exfil) {
    return 'exfil_unknown';
  }
  if (sensitive && logLeak) {
    return 'log_leak';
  }
  if (sensitive && hasDeclaredApiFlow(h)) {
    return 'auth_declared_api';
  }
  if (sensitive) {
    return 'sensitive_var';
  }
  return 'plain_read';
}

/** Rating table + secondary judgment rules (product spec). */
export function adjudicateEnvReadFinding(
  f: EnvReadAdjudicationInput,
): EnvReadAdjudicationResult | null {
  const scenario = classifyEnvReadScenario(f);
  switch (scenario) {
    case 'not_env_read':
      return null;
    case 'plain_read':
      return {
        scenario,
        processingStatus: 'hint',
        severity: 'low',
        dimension: 'code_quality',
        issue: '常规环境变量读取（无敏感名/无外传）',
        note: '二次裁决：常规 os.environ.get / process.env 读取，无敏感变量名与外发链路，降为提示项。',
      };
    case 'sensitive_var':
      return {
        scenario,
        processingStatus: 'hint',
        severity: 'low',
        dimension: 'hardcoded_secrets',
        riskType: 'config_auth_risk',
        issue: '读取敏感环境变量（无外传/日志证据，提示项）',
        recommendation: '确认变量仅用于本地鉴权且不写入日志；若需外联请在 SKILL.md 声明目标域。',
        note: '二次裁决：读取 TOKEN/SECRET/KEY 等敏感环境变量但无日志输出或外传链路，降为提示项；除非存在日志输出或外传证据否则不入正式风险。',
      };
    case 'auth_declared_api':
      return {
        scenario,
        processingStatus: 'hint',
        severity: 'medium',
        dimension: 'unauthorized_tool_call',
        riskType: 'config_auth_risk',
        issue: '敏感凭据用于已知 API 鉴权（声明/配置类）',
        note: '二次裁决：敏感变量用于 Authorization/headers 且指向已知 API 域，属外联声明/凭据管理（中低危）。',
      };
    case 'log_leak':
      return {
        scenario,
        processingStatus: 'suspected',
        severity: 'high',
        dimension: 'hardcoded_secrets',
        riskType: 'sensitive_data_leakage',
        issue: '敏感环境变量写入日志/控制台',
        recommendation: '移除对 TOKEN/SECRET/KEY 的 print/logging；改用脱敏或仅记录变量名。',
        note: '二次裁决：敏感环境变量进入 print/logging，存在泄露风险（中高危）。',
      };
    case 'exfil_unknown':
      return {
        scenario,
        processingStatus: 'suspected',
        severity: 'high',
        dimension: 'data_exfiltration',
        riskType: 'external_network_risk',
        issue: '敏感环境变量发往未知外域',
        recommendation: '禁止将密钥/Token 发往未声明域名；外联目标写入 SKILL.md 并做域名白名单。',
        note: '二次裁决：敏感环境变量进入未知外域请求，疑似数据外传（高危）。',
      };
    case 'full_enumeration':
      return {
        scenario,
        processingStatus: 'suspected',
        severity: 'high',
        dimension: 'data_exfiltration',
        riskType: 'sensitive_data_leakage',
        issue: '枚举/导出全部环境变量',
        recommendation: '禁止 dict(os.environ) / 全量导出；仅按需读取白名单变量名。',
        note: '二次裁决：遍历/导出全部环境变量（dict(os.environ) 等），高危。',
      };
    case 'full_enumeration_exfil':
      return {
        scenario,
        processingStatus: 'confirmed',
        severity: 'critical',
        dimension: 'data_exfiltration',
        riskType: 'external_network_risk',
        issue: '枚举并外发全部环境变量',
        recommendation: '立即移除全量环境变量采集与外发逻辑；复核历史外发目标。',
        note: '二次裁决：枚举并外发全部环境变量，严重风险。',
      };
    default:
      return null;
  }
}
