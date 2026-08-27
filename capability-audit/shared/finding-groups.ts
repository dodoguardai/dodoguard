/**
 * Group raw scan findings into risk cards with multiple evidence hits.
 */

import { dimensionLabel, type CapabilityAuditDimensionId } from './dimensions';
import {
  hasDangerousEvalSignal,
  inferSkillAuditDimension,
  isMetaScanFinding,
} from './dimension-inference';

export type FindingLike = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
  dimension?: string;
  sourceFile?: string;
  sourceEngines?: string[];
  ruleIds?: string[];
  triageNote?: string;
  llmAdjusted?: boolean;
  processingStatus?: 'confirmed' | 'suspected' | 'hint' | 'reference_sample' | 'false_positive';
};

export type FindingHit = {
  location: string;
  issue: string;
  evidence: string;
  category: string;
  severity: FindingLike['severity'];
  sourceEngines: string[];
  ruleIds: string[];
  sourceFile?: string;
  triageNote?: string;
};

export type GroupedFinding = {
  groupKey: string;
  displayTitle: string;
  displayTitleEn: string;
  dimension: CapabilityAuditDimensionId;
  severity: FindingLike['severity'];
  hits: FindingHit[];
  categories: string[];
  ruleIds: string[];
  sourceEngines: string[];
  recommendation: string;
  recommendationEn?: string;
  triageNote?: string;
};

export type FindingGroupStats = {
  riskTypeCount: number;
  evidenceHitCount: number;
  ruleHitCount: number;
};

const SEV_RANK: Record<FindingLike['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** All PI / jailbreak / DAN variants share one root cause (per red-team report §11). */
export const PROMPT_INJECTION_ROOT_CAUSE_KEY = 'root:prompt_injection:weak_instruction_constraint';

/** Reverse shell / bind shell patterns — merge all variants (bash/nc/socat/python). */
export const REVERSE_SHELL_ROOT_CAUSE_KEY = 'root:reverse_shell:bind_or_reverse';

/** Remote pipe install: curl|sh, wget|bash, etc. */
export const PIPE_SHELL_ROOT_CAUSE_KEY = 'root:pipe_shell:remote_install';
export const DATA_EXFIL_ROOT_CAUSE_KEY = 'root:data_exfiltration:environment_leak';
export const HIDDEN_DECEPTION_ROOT_CAUSE_KEY = 'root:hidden_deception:concealed_instruction';
/** eval of response/dynamic strings — not data exfiltration; excludes MiniRacer local decode. */
export const DANGEROUS_EVAL_ROOT_CAUSE_KEY = 'root:dangerous_eval:dynamic_code_execution';

const PRESET_TITLES: Record<
  string,
  { zh: string; en: string; recommendation?: { zh: string; en: string } }
> = {
  'artifact:.ds_store': {
    zh: '包内存在不可分析隐藏文件 .DS_Store',
    en: 'Hidden / unanalyzable file .DS_Store in package',
    recommendation: {
      zh: '从 Skill 包中删除 .DS_Store、Thumbs.db 等系统缓存/隐藏文件后重新打包扫描。',
      en: 'Remove .DS_Store, Thumbs.db, and other OS cache files from the package, then rescan.',
    },
  },
  'issue:skill_metadata_missing_license': {
    zh: 'Skill 元数据缺失：未声明 License',
    en: 'Skill metadata missing: no License declared',
    recommendation: {
      zh: '在 SKILL.md 或 skill 元数据中补充 license 字段。',
      en: 'Add a license field to SKILL.md or skill metadata.',
    },
  },
  [PROMPT_INJECTION_ROOT_CAUSE_KEY]: {
    zh: '弱系统指令约束（提示注入 / DAN / jailbreak 话术变体）',
    en: 'Weak instruction constraints (prompt injection / DAN / jailbreak variants)',
    recommendation: {
      zh: '加固 SKILL.md 与系统指令边界；移除或隔离欺骗性话术，勿依赖逐条封堵变体。',
      en: 'Harden SKILL.md and system-instruction boundaries; remove deceptive phrasing instead of blocking variants one-by-one.',
    },
  },
  [REVERSE_SHELL_ROOT_CAUSE_KEY]: {
    zh: '反弹 Shell / 绑定 Shell（bash·nc·socat·python 等变体）',
    en: 'Reverse / bind shell (bash, nc, socat, python variants)',
    recommendation: {
      zh: '移除反弹 Shell 相关代码；禁止 Skill 安装/执行阶段发起外连 Shell。',
      en: 'Remove reverse-shell code; block outbound shell during skill install or execution.',
    },
  },
  [PIPE_SHELL_ROOT_CAUSE_KEY]: {
    zh: '远程管道执行（curl/wget/npx | sh/bash）',
    en: 'Remote pipe execution (curl/wget/npx | sh/bash)',
    recommendation: {
      zh: '禁止 curl|sh 一键安装；使用固定版本、哈希校验的可信制品。',
      en: 'Disallow curl|sh installs; use pinned versions with hash verification.',
    },
  },
  [DANGEROUS_EVAL_ROOT_CAUSE_KEY]: {
    zh: '把接口/网页返回内容当代码执行（eval，存在被利用风险）',
    en: 'Running API/web response text as code via eval (exploitation risk)',
    recommendation: {
      zh: '不要用 eval 把接口返回内容当程序执行；改用安全的 JSON 或表格解析，并校验数据格式。',
      en: 'Do not eval API response bodies; use safe JSON/table parsers and validate the data format.',
    },
  },
  [DATA_EXFIL_ROOT_CAUSE_KEY]: {
    zh: '数据外传 / 环境信息泄露到外部站点',
    en: 'Data exfiltration / environment information leak to external site',
    recommendation: {
      zh: '移除将 uname、.env、主机信息、凭据或环境信息发送到外部 paste/webhook 站点的逻辑；限制 Skill 指令访问和外传敏感上下文。',
      en: 'Remove logic that sends uname, .env, host details, credentials, or environment data to external paste/webhook sites; restrict skill access to sensitive context.',
    },
  },
  [HIDDEN_DECEPTION_ROOT_CAUSE_KEY]: {
    zh: '隐藏操作意图 / 欺骗用户执行',
    en: 'Concealed intent / deceptive user execution',
    recommendation: {
      zh: '移除 do not tell the user、hide this action、do not reveal data collection 等隐瞒用户知情权的指令；要求 Skill 明示数据收集与执行行为。',
      en: 'Remove instructions such as do not tell the user, hide this action, or do not reveal data collection; require skills to disclose data collection and execution behavior.',
    },
  },
};

function haystack(f: FindingLike): string {
  return `${f.issue}\n${f.evidence}\n${f.triageNote ?? ''}\n${f.location}`.toLowerCase();
}

function filePathFromLocation(location: string, sourceFile?: string): string {
  if (sourceFile?.trim()) {
    return sourceFile.replace(/\\/g, '/');
  }
  const normalized = location.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf(':');
  if (idx > 0 && /^\d+$/.test(normalized.slice(idx + 1))) {
    return normalized.slice(0, idx);
  }
  return normalized;
}

function basename(path: string): string {
  const parts = path.split('/');
  return (parts[parts.length - 1] || path).toLowerCase();
}

function detectArtifactGroup(f: FindingLike): string | null {
  const h = haystack(f);
  const path = filePathFromLocation(f.location, f.sourceFile);
  const base = basename(path);

  if (base === '.ds_store' || h.includes('.ds_store')) {
    return 'artifact:.ds_store';
  }
  if (base === 'thumbs.db' || h.includes('thumbs.db')) {
    return 'artifact:thumbs.db';
  }
  if (base === 'desktop.ini') {
    return 'artifact:desktop.ini';
  }
  return null;
}

function detectEvidencePattern(f: FindingLike): string | null {
  const ev = f.evidence.trim();
  const h = haystack(f);
  if (/curl\s+(-s\s+)?(-X\s+POST\s+)?/i.test(ev) && /\$\{[A-Z0-9_]+\}/i.test(ev)) {
    return 'curl_post_env';
  }
  if (/curl\s+-/i.test(ev) && /base_url|signature/i.test(ev)) {
    return 'curl_post_env';
  }
  if (/curl\s+(-s\s+)?(-X\s+POST\s+)?/i.test(h) && /\$\{[A-Z0-9_]+\}/i.test(h)) {
    return 'curl_post_env';
  }
  return null;
}

function normalizeSnippet(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\$\{[^}]+\}/g, '${VAR}')
    .replace(/\b0x[0-9a-f]+\b/gi, '0x…')
    .trim();
}

function normalizeUrlForFingerprint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function detectReverseShellPattern(text: string): string | null {
  const patterns = [
    /bash\s+-i\s+>&\s*\/dev\/tcp\//i,
    /\/dev\/tcp\/[\d.a-z:-]+/i,
    /\/dev\/udp\//i,
    /\bnc\s+(-[ecvp]+)+\s*[\d./]+/i,
    /\bncat\b[^\n]{0,80}\s-e\s/i,
    /\bsocat\b[^\n]{0,120}\bexec\b/i,
    /python\d*\s+-c\s+['"][^'"]*socket/i,
    /socket\.connect\s*\(\s*\(/i,
    /subprocess\.(call|run|Popen)\s*\([^)]*\/bin\/sh/i,
    /mkfifo\s+\/tmp\/[^\s;]+/i,
  ];
  for (const re of patterns) {
    if (re.test(text)) {
      return REVERSE_SHELL_ROOT_CAUSE_KEY;
    }
  }
  return null;
}

function detectPipeShellPattern(text: string): string | null {
  if (detectReverseShellPattern(text)) {
    return null;
  }
  if (/\b(curl|wget|npx)\b[^;\n]{0,240}\|\s*(ba)?sh\b/i.test(text)) {
    return PIPE_SHELL_ROOT_CAUSE_KEY;
  }
  if (/https?:\/\/[^\s'"]+[^;\n]{0,120}\|\s*(ba)?sh\b/i.test(text)) {
    return PIPE_SHELL_ROOT_CAUSE_KEY;
  }
  return null;
}

function detectDataExfilPattern(text: string): string | null {
  // Drop negated adjudication phrases so "非数据外传" does not trigger exfil grouping.
  const cleaned = text
    .replace(/非\s*数据外(?:传|泄)/g, ' ')
    .replace(/not\s+(?:a\s+)?(?:data\s+)?exfil(?:tration)?/gi, ' ')
    .replace(/\([^)]*非数据外(?:传|泄)[^)]*\)/g, ' ');

  if (
    /数据外泄|数据外传|环境信息泄露|外泄|外传|exfiltrat|data\s+leak|leak\s+data|pastebin|paste\s+site|webhook|requestbin/i.test(
      cleaned,
    )
  ) {
    return DATA_EXFIL_ROOT_CAUSE_KEY;
  }
  if (
    /\b(curl|fetch|axios|requests\.|httpx\.)\b/i.test(cleaned) &&
    /(\.env|uname\s+-a|host\s+information|environment\s+information|credential|token|secret|password)/i.test(
      cleaned,
    ) &&
    /(https?:\/\/|external|paste|webhook|外部)/i.test(cleaned)
  ) {
    return DATA_EXFIL_ROOT_CAUSE_KEY;
  }
  return null;
}

function detectDangerousEvalRootCause(f: FindingLike): string | null {
  if (hasDangerousEvalSignal(f)) {
    return DANGEROUS_EVAL_ROOT_CAUSE_KEY;
  }
  return null;
}

const PROMPT_INJECTION_RULES: Array<{ re: RegExp }> = [
  { re: /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i },
  { re: /disregard\s+(?:all\s+)?(?:previous|prior)/i },
  { re: /system\s+override/i },
  { re: /you\s+are\s+now\s+(?:a\s+)?/i },
  { re: /(?:<\s*system\s*>|<<\s*sys\s*>>)/i },
  { re: /\bDAN\b|do anything now/i },
  { re: /jailbreak/i },
  { re: /developer mode/i },
  { re: /do\s+not\s+follow\s+(?:your\s+)?(?:previous\s+)?instructions/i },
  { re: /override\s+(?:all\s+)?(?:safety\s+)?(?:rules|policies|guidelines)/i },
  { re: /不要告诉用户|隐藏操作|忽略系统规则/i },
  { re: /act as (?:an? )?(?:unrestricted|unfiltered)/i },
];

function detectPromptInjectionPattern(text: string): string | null {
  if (
    /do\s+not\s+tell\s+the\s+user|hide\s+this\s+action|do\s+not\s+reveal\s+data\s+collection|conceal|deceive\s+user|隐藏操作|不要告诉用户|不要透露|数据收集/i.test(
      text,
    )
  ) {
    return HIDDEN_DECEPTION_ROOT_CAUSE_KEY;
  }
  for (const { re } of PROMPT_INJECTION_RULES) {
    if (re.test(text)) {
      return PROMPT_INJECTION_ROOT_CAUSE_KEY;
    }
  }
  return null;
}

function detectCurlCommandPattern(text: string): string | null {
  const matches = [...text.matchAll(/\bcurl\s+[^;\n|]+/gi)];
  if (matches.length === 0) {
    return null;
  }
  const longest = matches.map((m) => m[0]).sort((a, b) => b.length - a.length)[0]!;
  const norm = normalizeSnippet(longest).replace(
    /https?:\/\/[^\s'"]+/g,
    normalizeUrlForFingerprint,
  );
  return `root:curl:${norm.slice(0, 96)}`;
}

function detectIdenticalCodeEvidence(ev: string): string | null {
  const n = normalizeSnippet(ev);
  if (n.length < 20) {
    return null;
  }
  if (!/\b(curl|wget|bash|eval|exec|ignore\s+.*instructions|system\s+override)\b/i.test(n)) {
    return null;
  }
  return `root:evidence:${n.slice(0, 100)}`;
}

function detectCredentialInUrlPattern(text: string): string | null {
  if (
    /[?&](?:signature|api[_-]?key|access[_-]?token|token|key)=/i.test(text) &&
    /\bcurl\b/i.test(text)
  ) {
    return 'root:cred_in_url';
  }
  if (
    /[?&](?:signature|api[_-]?key|access[_-]?token|token|key)=/i.test(text) &&
    /\b(https?:\/\/|requests\.|fetch\s*\(|axios\.|httpx\.|curl)\b/i.test(text)
  ) {
    return 'root:cred_in_url';
  }
  return null;
}

function detectDynamicCurlBehaviorPattern(text: string): string | null {
  if (detectCredentialInUrlPattern(text)) {
    return null;
  }
  if (!/\bcurl\b/i.test(text)) {
    return null;
  }
  if (/\$\{[A-Z0-9_]*URL[A-Z0-9_]*\}|\$\{BASE_URL\}|BASE_URL/i.test(text)) {
    return 'root:dynamic_curl';
  }
  return null;
}

/** Stable merge key for same root cause across files, rules, and engines. */
export function buildRootCauseMergeKey(f: FindingLike): string | null {
  const h = haystack(f);
  const ev = f.evidence.trim();

  return (
    detectReverseShellPattern(h) ||
    detectReverseShellPattern(ev) ||
    // eval mislabeled as 数据外传 must win before exfil keyword merge
    detectDangerousEvalRootCause(f) ||
    detectDataExfilPattern(h) ||
    detectDataExfilPattern(ev) ||
    detectPipeShellPattern(h) ||
    detectPipeShellPattern(ev) ||
    detectPromptInjectionPattern(h) ||
    detectPromptInjectionPattern(ev) ||
    detectCredentialInUrlPattern(h) ||
    detectCredentialInUrlPattern(ev) ||
    detectDynamicCurlBehaviorPattern(h) ||
    detectDynamicCurlBehaviorPattern(ev) ||
    detectCurlCommandPattern(h) ||
    detectCurlCommandPattern(ev) ||
    (detectEvidencePattern(f) ? `root:${detectEvidencePattern(f)}` : null) ||
    detectIdenticalCodeEvidence(ev)
  );
}

function primaryDimensionForGroupKey(
  groupKey: string,
  fallback: CapabilityAuditDimensionId,
): CapabilityAuditDimensionId {
  if (groupKey.startsWith('root:pipe_shell')) {
    return 'command_injection';
  }
  if (groupKey.startsWith('root:reverse_shell')) {
    return 'command_injection';
  }
  if (groupKey.startsWith('root:dangerous_eval')) {
    return 'command_injection';
  }
  if (groupKey.startsWith('root:prompt_injection')) {
    return 'prompt_injection';
  }
  if (groupKey.startsWith('root:hidden_deception')) {
    return 'prompt_injection';
  }
  if (groupKey.startsWith('root:data_exfiltration')) {
    return 'data_exfiltration';
  }
  if (groupKey.startsWith('root:cred_in_url')) {
    return 'hardcoded_secrets';
  }
  if (groupKey.startsWith('root:dynamic_curl')) {
    return 'unauthorized_tool_call';
  }
  if (groupKey.startsWith('root:curl') || groupKey.startsWith('root:curl_post_env')) {
    return groupKey.startsWith('root:curl_post_env')
      ? 'data_exfiltration'
      : 'unauthorized_tool_call';
  }
  return fallback;
}

function normalizeIssueKey(f: FindingLike, dimension: CapabilityAuditDimensionId): string {
  const h = haystack(f);
  if (/does not specify a license|missing license|no license|without a license/i.test(h)) {
    return 'issue:skill_metadata_missing_license';
  }
  const issue = f.issue.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
  return `issue:${dimension}:${issue}`;
}

function buildGroupKey(f: FindingLike, dimension: CapabilityAuditDimensionId): string {
  const artifact = detectArtifactGroup(f);
  if (artifact) {
    return artifact;
  }
  const root = buildRootCauseMergeKey(f);
  if (root) {
    return root;
  }
  return normalizeIssueKey(f, dimension);
}

function toHit(f: FindingLike): FindingHit {
  return {
    location: f.location,
    issue: f.issue,
    evidence: f.evidence,
    category: f.category ?? 'UNKNOWN',
    severity: f.severity,
    sourceEngines: f.sourceEngines?.length ? [...f.sourceEngines] : [],
    ruleIds: f.ruleIds?.length ? [...f.ruleIds] : [],
    sourceFile: f.sourceFile,
    triageNote: f.triageNote,
  };
}

function titleForGroup(
  groupKey: string,
  hits: FindingHit[],
  dimension: CapabilityAuditDimensionId,
): { zh: string; en: string } {
  const preset = PRESET_TITLES[groupKey];
  if (preset) {
    return { zh: preset.zh, en: preset.en };
  }
  if (groupKey.startsWith('root:pipe_shell')) {
    return {
      zh: '远程管道执行（curl/wget | sh）',
      en: 'Remote pipe execution (curl/wget | sh)',
    };
  }
  if (groupKey.startsWith('root:reverse_shell')) {
    return {
      zh: '反弹 Shell / 绑定 Shell',
      en: 'Reverse / bind shell',
    };
  }
  if (groupKey.startsWith('root:prompt_injection:')) {
    return {
      zh: '弱系统指令约束（提示注入话术变体）',
      en: 'Weak instruction constraints (prompt injection variants)',
    };
  }
  if (groupKey.startsWith('root:hidden_deception:')) {
    return {
      zh: '隐藏操作意图 / 欺骗用户执行',
      en: 'Concealed intent / deceptive user execution',
    };
  }
  if (groupKey.startsWith('root:dangerous_eval')) {
    return {
      zh: '把接口/网页返回内容当代码执行（eval，存在被利用风险）',
      en: 'Running API/web response text as code via eval (exploitation risk)',
    };
  }
  if (groupKey.startsWith('root:data_exfiltration:')) {
    return {
      zh: '数据外传 / 环境信息泄露到外部站点',
      en: 'Data exfiltration / environment information leak to external site',
    };
  }
  if (groupKey.startsWith('root:cred_in_url')) {
    return {
      zh: '敏感签名/凭据经 URL 查询参数传输',
      en: 'Credentials/signature passed in URL query string',
    };
  }
  if (groupKey.startsWith('root:dynamic_curl')) {
    return {
      zh: '动态目标 curl 请求需人工确认',
      en: 'Dynamic-target curl request needs manual review',
    };
  }
  if (groupKey.startsWith('root:curl:') || groupKey.startsWith('root:curl_post_env')) {
    return {
      zh: '多处使用 curl 发起动态网络请求',
      en: 'Repeated dynamic curl network requests',
    };
  }
  if (groupKey.startsWith('root:evidence:')) {
    return {
      zh: '相同代码/证据片段',
      en: 'Identical code/evidence snippet',
    };
  }
  if (groupKey.startsWith('pattern:')) {
    return {
      zh: dimensionLabel(dimension, true),
      en: dimensionLabel(dimension, false),
    };
  }
  const uniqueIssues = new Set(hits.map((h) => h.issue.trim().toLowerCase()));
  if (uniqueIssues.size === 1) {
    return { zh: hits[0].issue, en: hits[0].issue };
  }
  return {
    zh: dimensionLabel(dimension, true),
    en: dimensionLabel(dimension, false),
  };
}

function recommendationForGroup(groupKey: string, hits: FindingHit[], collected: string[]): string {
  const preset = PRESET_TITLES[groupKey];
  if (preset?.recommendation) {
    return preset.recommendation.zh;
  }
  if (groupKey.startsWith('root:cred_in_url')) {
    return '将 signature / API Key 放到 Authorization 或自定义 Header，勿放入 URL query；并核验 BASE_URL 是否来自可信配置、是否限制协议与域名。';
  }
  if (groupKey.startsWith('root:dynamic_curl') || groupKey.startsWith('root:curl:')) {
    return '核验 BASE_URL 来源是否可信、是否限制协议/域名/IP；确认请求体不含敏感数据且无 -k / 下载后执行等危险用法后再定级。';
  }
  const unique = [...new Set(collected.map((r) => r.trim()).filter(Boolean))];
  // Drop useless SkillSpector placeholder recommendations
  const filtered = unique.filter((r) => !/follow skillspector guidance/i.test(r));
  return filtered[0] ?? hits[0]?.issue ?? '';
}

function recommendationForGroupEn(
  groupKey: string,
  hits: FindingHit[],
  collected: string[],
): string {
  const preset = PRESET_TITLES[groupKey];
  if (preset?.recommendation) {
    return preset.recommendation.en;
  }
  if (groupKey.startsWith('root:cred_in_url')) {
    return 'Move signature/API keys to Authorization or a custom header—never URL query params. Verify BASE_URL is trusted and restrict protocol/host.';
  }
  if (groupKey.startsWith('root:dynamic_curl') || groupKey.startsWith('root:curl:')) {
    return 'Verify BASE_URL trustworthiness and host allowlists; confirm no sensitive body data, -k/insecure TLS, or download-and-exec before raising severity.';
  }
  const unique = [...new Set(collected.map((r) => r.trim()).filter(Boolean))];
  const filtered = unique.filter((r) => !/follow skillspector guidance/i.test(r));
  return filtered[0] ?? hits[0]?.issue ?? '';
}

type GroupAcc = {
  dimension: CapabilityAuditDimensionId;
  hits: FindingHit[];
  categories: Set<string>;
  ruleIds: Set<string>;
  engines: Set<string>;
  recommendations: string[];
  severity: FindingLike['severity'];
};

export function groupFindingsForDisplay(findings: FindingLike[]): {
  groups: GroupedFinding[];
  stats: FindingGroupStats;
} {
  const contentFindings = findings.filter((f) => !isMetaScanFinding(f));
  const evidenceHitCount = contentFindings.length;
  let ruleHitCount = 0;

  const map = new Map<string, GroupAcc>();

  for (const f of contentFindings) {
    ruleHitCount += f.ruleIds?.length ? f.ruleIds.length : 1;
    const dimension = inferSkillAuditDimension(f);
    const key = buildGroupKey(f, dimension);
    const hit = toHit(f);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        dimension: primaryDimensionForGroupKey(key, dimension),
        hits: [hit],
        categories: new Set(hit.category ? [hit.category] : []),
        ruleIds: new Set(hit.ruleIds),
        engines: new Set(hit.sourceEngines),
        recommendations: f.recommendation?.trim() ? [f.recommendation.trim()] : [],
        severity: f.severity,
      });
      continue;
    }

    existing.hits.push(hit);
    if (hit.category) {
      existing.categories.add(hit.category);
    }
    for (const id of hit.ruleIds) {
      existing.ruleIds.add(id);
    }
    for (const eng of hit.sourceEngines) {
      existing.engines.add(eng);
    }
    if (f.recommendation?.trim()) {
      existing.recommendations.push(f.recommendation.trim());
    }
    if (SEV_RANK[f.severity] > SEV_RANK[existing.severity]) {
      existing.severity = f.severity;
    }
  }

  const groups: GroupedFinding[] = [...map.entries()]
    .map(([groupKey, acc]) => {
      const titles = titleForGroup(groupKey, acc.hits, acc.dimension);
      return {
        groupKey,
        displayTitle: titles.zh,
        displayTitleEn: titles.en,
        dimension: acc.dimension,
        severity: acc.severity,
        hits: acc.hits,
        categories: [...acc.categories],
        ruleIds: [...acc.ruleIds],
        sourceEngines: [...acc.engines],
        recommendation: recommendationForGroup(groupKey, acc.hits, acc.recommendations),
        recommendationEn: recommendationForGroupEn(groupKey, acc.hits, acc.recommendations),
        triageNote: acc.hits.map((h) => h.triageNote).find(Boolean),
      };
    })
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);

  return {
    groups,
    stats: {
      riskTypeCount: groups.length,
      evidenceHitCount,
      ruleHitCount,
    },
  };
}

export function groupedTitle(g: GroupedFinding, isZh: boolean): string {
  return isZh ? g.displayTitle : g.displayTitleEn;
}

export function groupedRecommendation(
  g: GroupedFinding & { recommendationEn?: string },
  isZh: boolean,
): string {
  if (!isZh && g.recommendationEn) {
    return g.recommendationEn;
  }
  return g.recommendation;
}
