/**
 * Secondary adjudication for Skill scan findings (eval misclass, public APIs, obfuscation noise).
 * Complements env-read-adjudication; applied when env adjudication does not match.
 */

import { hasDangerousEvalSignal, isLocalSandboxJsEval } from './dimension-inference';
import type { ProcessingStatus } from './finding-disposition';

export type RiskTypeAdjudicationInput = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  location: string;
  issue: string;
  evidence: string;
  sourceFile?: string;
  dimension?: string;
  triageNote?: string;
};

export type RiskTypeAdjudicationResult = {
  processingStatus: ProcessingStatus;
  severity: 'low' | 'medium' | 'high' | 'critical';
  dimension?: string;
  riskType?:
    | 'dangerous_code_execution'
    | 'external_network_risk'
    | 'sensitive_data_leakage'
    | 'supply_chain_risk'
    | 'config_auth_risk';
  note: string;
  /** Override finding issue / title when set */
  issue?: string;
  /** Override remediation recommendation when set */
  recommendation?: string;
};

const PUBLIC_DATA_HOST_RE =
  /(?:^|\/\/|https?:\/\/)(?:[\w.-]+\.)?(?:safe\.gov\.cn|10jqka\.com\.cn|currencyscoop\.com|sec\.gov|nuget\.org|pypi\.org|registry\.npmjs\.org|github\.com|githubusercontent\.com|eastmoney\.com|sina\.com\.cn|finance\.yahoo\.com|fred\.stlouisfed\.org|oecd\.org|worldbank\.org|imf\.org|akshare\.|juhe\.cn|tushare\.pro|joinquant\.com|ricequant\.com|polygon\.io|alphavantage\.co|finnhub\.io|coinbase\.com|binance\.com)/i;

const EXTERNAL_LLM_HOST_RE =
  /(?:api\.z\.ai|api\.openai\.com|api\.anthropic\.com|dashscope\.aliyuncs\.com|generativelanguage\.googleapis\.com|api\.deepseek\.com|openrouter\.ai)/i;

const TELEMETRY_HOST_RE = /posthog\.|segment\.io|mixpanel\.|amplitude\.com|sentry\.io/i;

function haystack(f: RiskTypeAdjudicationInput): string {
  return `${f.issue}\n${f.evidence}\n${f.location}\n${f.triageNote || ''}`.toLowerCase();
}

function filePath(f: RiskTypeAdjudicationInput): string {
  const fromSource = f.sourceFile?.replace(/\\/g, '/').toLowerCase();
  if (fromSource?.trim()) {
    return fromSource;
  }
  const loc = f.location.replace(/\\/g, '/').toLowerCase();
  const idx = loc.lastIndexOf(':');
  if (idx > 0 && /^\d+$/.test(loc.slice(idx + 1))) {
    return loc.slice(0, idx);
  }
  return loc;
}

function isDocOrSkillMdPath(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return (
    /^skill\.md$/i.test(base) ||
    /^skills\.md$/i.test(base) ||
    /^readme\.md$/i.test(base) ||
    /\/(?:docs|examples|references)\//i.test(path)
  );
}

function hasSensitiveOutboundPayload(h: string): boolean {
  return /(\.env|uname\s+-a|host\s+information|dict\s*\(\s*os\.environ|credential|password|private[_-]?key|主机信息|环境变量)/i.test(
    h,
  );
}

function isPureHexObfuscation(h: string): boolean {
  if (!/_0x[0-9a-f]{2,}/i.test(h)) {
    return false;
  }
  return !/\beval\s*\(|\bexec\s*\(|subprocess|child_process|requests\.|fetch\s*\(|axios\.|curl\s+|wget\s+|os\.system/i.test(
    h,
  );
}

function isSvgOrImageBase64Noise(f: RiskTypeAdjudicationInput, h: string): boolean {
  const path = filePath(f);
  if (/\.(svg|png|jpg|jpeg|gif|webp)$/i.test(path)) {
    return /data:image\/|base64,|AAAAAAAAAAAMIZI/i.test(h);
  }
  return (
    /xlink:href\s*=\s*["']data:image\//i.test(h) &&
    /base64,/i.test(h) &&
    !/\beval\s*\(|\bexec\s*\(|subprocess/i.test(h)
  );
}

function isCveDependencyWeakSignal(h: string, path: string): boolean {
  const depFile = /requirements\.txt|pyproject\.toml|package\.json|poetry\.lock|pnpm-lock/i.test(
    path,
  );
  if (!depFile && !/dependency has known vulnerabilities|known vulnerabilities \(cves\)/i.test(h)) {
    return false;
  }
  if (/CVE-\d{4}-\d+/i.test(h)) {
    return false;
  }
  return (
    /dependency has known vulnerabilities|known vulnerabilities \(cves\)|依赖(?:项|包)?漏洞|setuptools/i.test(
      h,
    ) || depFile
  );
}

function isFixedPipInstall(h: string): boolean {
  return (
    /pip\s+install|python\s+-m\s+pip\s+install/i.test(h) &&
    /\b(pypdf|yfinance|pandas|numpy|requests|beautifulsoup4|lxml|openpyxl)\b/i.test(h) &&
    !/\$\{|\$[a-z_]+|argv|user[_-]?input|input\s*\(/i.test(h)
  );
}

function isCredentialInUrl(h: string): boolean {
  return /[?&](?:signature|api[_-]?key|access[_-]?token|token|key)=/i.test(h);
}

/** Escalate URL-credential / dynamic-curl hints only with stronger context. */
function hasOutboundEscalateSignals(h: string): boolean {
  return (
    /(?:^|[\s"'=])-k(?:\s|$)|--insecure\b|CURLOPT_SSL_VERIFYPEER\s*=\s*0/i.test(h) ||
    /\b(for|while)\s+.*\bcurl\b|\bcron\b|setInterval|schedule|batch|遍历|定时/i.test(h) ||
    /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}\b|ngrok\.|trycloudflare\.|loca\.lt|nip\.io|sslip\.io/i.test(
      h,
    ) ||
    /\|\s*(ba)?sh\b|curl[^\n]{0,120}\|\s*(ba)?sh|eval\s*\(\s*.*(?:curl|response|r\.text)/i.test(
      h,
    ) ||
    /argv|process\.argv|user[_-]?input|request\.(?:query|body|params)|sys\.argv/i.test(h) ||
    (/\b(?:password|passwd|private[_-]?key|\.env|customer|身份证|银行卡)\b/i.test(h) &&
      /\b(?:-d|--data|json=|body|payload)\b/i.test(h))
  );
}

function isDynamicCurlBehavior(h: string): boolean {
  if (!/\bcurl\b/i.test(h)) {
    return false;
  }
  if (isCredentialInUrl(h)) {
    return false;
  }
  // Dynamic target (${BASE_URL} / env) without hard escalate signals → behavior hint
  return /\$\{[A-Z0-9_]*URL[A-Z0-9_]*\}|\$\{BASE_URL\}|BASE_URL|apiBaseUrl/i.test(h);
}

const CRED_IN_URL_ISSUE = '敏感签名/凭据通过 URL 查询参数传输，可能被代理、服务器或审计日志记录';
const CRED_IN_URL_RECOMMENDATION =
  '将 signature / API Key 放到 Authorization 或自定义 Header，勿放入 URL query；并核验 BASE_URL 是否来自可信配置、是否限制协议与域名。';
const DYNAMIC_CURL_ISSUE = '动态目标 curl 请求需人工确认（未证明恶意外连）';
const DYNAMIC_CURL_RECOMMENDATION =
  '核验 BASE_URL 来源是否可信、是否限制协议/域名/IP；确认请求体不含敏感数据且无 -k / 下载后执行等危险用法后再定级。';

function isPublicDataSourceCall(h: string): boolean {
  if (!PUBLIC_DATA_HOST_RE.test(h) && !/rmbhlzjj|macro\/rmb/i.test(h)) {
    return false;
  }
  if (hasSensitiveOutboundPayload(h) || isCredentialInUrl(h) || TELEMETRY_HOST_RE.test(h)) {
    return false;
  }
  return (
    /\b(https?:\/\/|requests\.|urllib|fetch\s*\(|axios\.|httpx\.)/i.test(h) ||
    /rmbhlzjj|macro\/rmb/i.test(h)
  );
}

/** Public market-data libs / hosts (akshare·sina·eastmoney…) — treat as no formal risk. */
function isPublicMarketDataContext(f: RiskTypeAdjudicationInput, h: string): boolean {
  if (hasSensitiveOutboundPayload(h) || isCredentialInUrl(h) || TELEMETRY_HOST_RE.test(h)) {
    return false;
  }
  const path = filePath(f);
  const blob = `${path}\n${h}`;
  if (
    /(?:^|\/)akshare\/|sina\.com\.cn|eastmoney\.com|10jqka\.com\.cn|currencyscoop\.com|safe\.gov\.cn|finance\.yahoo\.com|sec\.gov/i.test(
      blob,
    ) ||
    /zh_sina_|fund_etf_sina|fund_fhsp_em|option_finance_sina|stock_zh_[ab]_sina|stock_us_sina|index_stock_zh/i.test(
      blob,
    )
  ) {
    return true;
  }
  return isPublicDataSourceCall(h);
}

function isExternalLlmCall(h: string): boolean {
  return (
    EXTERNAL_LLM_HOST_RE.test(h) || /OpenAIChat|base_url\s*=\s*["']https?:\/\/api\.z\.ai/i.test(h)
  );
}

function isTelemetryExfil(h: string): boolean {
  return (
    TELEMETRY_HOST_RE.test(h) && /\b(requests\.(post|put)|fetch\s*\(|axios\.|httpx\.)/i.test(h)
  );
}

function isDocInstallHint(f: RiskTypeAdjudicationInput, h: string): boolean {
  const path = filePath(f);
  if (!isDocOrSkillMdPath(path)) {
    return false;
  }
  return (
    /npx\s+\w+|without (?:a )?version suffix|rug-pull|sudo\s+apt|brew\s+install|pip\s+install/i.test(
      h,
    ) && !/subprocess\.(?:run|call|Popen|check_call)\s*\(/i.test(h)
  );
}

/** Runtime scripts with unlocked npx/uvx — keep as formal supply-chain risk. */
function isRuntimeUnlockedNpx(f: RiskTypeAdjudicationInput, h: string): boolean {
  const path = filePath(f);
  if (isDocOrSkillMdPath(path)) {
    return false;
  }
  const inRuntimePath =
    /\/scripts\/|\.(?:sh|py|js|ts|mjs|cjs)$/i.test(path) || /post-create|install|hook/i.test(path);
  if (!inRuntimePath && !/\bnpx\b|\buvx\b/i.test(h)) {
    return false;
  }
  return /npx\s+\S+|without (?:a )?version(?:\s+suffix)?|uvx(?:\/uv)?\s+tool\s+run|未固定版本|unpinned|rug-pull/i.test(
    h,
  );
}

function isUndeclaredNetworkRisk(h: string): boolean {
  return (
    /(?:undeclared|未声明).{0,40}(?:network|网络|outbound|外联)|(?:network|网络|outbound|外联).{0,40}(?:undeclared|未声明)|missing\s+network\s+declaration|skill\.md.{0,60}(?:does not|未).{0,40}(?:declare|声明).{0,40}(?:network|网络)/i.test(
      h,
    ) && /\b(https?:\/\/|requests\.|fetch\s*\(|axios\.|curl\s+|httpx\.)/i.test(h)
  );
}

/**
 * Returns adjudication override, or null when no special rule applies.
 */
export function adjudicateRiskTypeFinding(
  f: RiskTypeAdjudicationInput,
): RiskTypeAdjudicationResult | null {
  const h = haystack(f);
  const path = filePath(f);

  if (isLocalSandboxJsEval(f)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'code_quality',
      issue: '本地 JS 运行时执行内置解密脚本（MiniRacer，提示项）',
      recommendation:
        '确认 MiniRacer/js_code.eval 仅加载本地固定解密脚本，勿对 HTTP 响应正文 eval；响应解析改用 json.loads 等安全方式。',
      note: '二次裁决：MiniRacer/本地变量 eval 解密脚本，非对 HTTP 响应动态执行，降为提示项（与 eval(r.text) 区分）。',
    };
  }

  if (hasDangerousEvalSignal(f)) {
    // Public market-data responses: coding smell only — not a formal package risk
    if (isPublicMarketDataContext(f, h)) {
      return {
        processingStatus: 'hint',
        severity: 'low',
        dimension: 'code_quality',
        issue: '公开行情数据用 eval 解析（公开数据源，无正式风险）',
        recommendation: '公开行情场景可忽略；若自行维护解析逻辑，建议改用安全的 JSON/表格解析。',
        note: '二次裁决：公开金融/行情数据源上的 eval 解析，不计入正式危险代码执行风险。',
      };
    }
    const severity = f.severity === 'low' ? 'medium' : f.severity;
    return {
      processingStatus: severity === 'critical' || severity === 'high' ? 'confirmed' : 'suspected',
      severity,
      dimension: 'command_injection',
      riskType: 'dangerous_code_execution',
      issue: '把接口/网页返回内容当代码执行（eval，存在被利用风险）',
      recommendation:
        '不要用 eval 把接口返回内容当程序执行；改用安全的 JSON 或表格解析，并校验数据格式。',
      note: '二次裁决：eval/动态代码执行解析响应或动态字符串，归入危险代码执行（非数据外传/混淆）。',
    };
  }

  const cat = (f.category || '').toUpperCase();
  if (cat === 'SCAN_INTEGRITY' || /本扫描引擎 .+ (?:执行失败|未执行)/i.test(h)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'code_quality',
      issue: '扫描完整性提示（引擎跳过/失败）',
      note: '二次裁决：扫描引擎跳过/执行失败属于扫描完整性提示，不计入包体安全风险，不推送整改。',
    };
  }

  if (isSvgOrImageBase64Noise(f, h)) {
    return {
      processingStatus: 'false_positive',
      severity: 'low',
      dimension: 'code_quality',
      issue: '图片/SVG 内嵌 base64 资源（非脚本载荷）',
      note: '二次裁决：SVG/图片资源中的 base64 编码内容，非脚本执行载荷，移出正式风险。',
    };
  }

  if (isPureHexObfuscation(h)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'code_obfuscation',
      issue: '代码混淆/压缩命名（缺少恶意行为证据）',
      note: '二次裁决：检测到混淆/压缩命名，缺少恶意行为证据，降为提示项。',
    };
  }

  if (isCredentialInUrl(h)) {
    const escalate = hasOutboundEscalateSignals(h);
    return {
      // Human review: URL credentials stay formal risk; escalate signals raise severity.
      processingStatus: escalate ? 'confirmed' : 'suspected',
      severity: escalate ? (f.severity === 'critical' ? 'critical' : 'high') : 'medium',
      dimension: 'hardcoded_secrets',
      riskType: 'config_auth_risk',
      issue: CRED_IN_URL_ISSUE,
      recommendation: CRED_IN_URL_RECOMMENDATION,
      note: escalate
        ? '二次裁决：URL 传签名/凭据，且存在可控目标、敏感载荷、-k 或不安全调用等升档信号，列为确认风险。'
        : '二次裁决：检测到 URL query 传 signature/凭据，保留为正式风险（凭据/配置类）；建议改 Header 传参。',
    };
  }

  if (isDynamicCurlBehavior(h)) {
    const escalate = hasOutboundEscalateSignals(h);
    return {
      processingStatus: escalate ? 'suspected' : 'hint',
      severity: escalate ? 'medium' : 'low',
      dimension: 'unauthorized_tool_call',
      riskType: 'external_network_risk',
      issue: escalate ? '动态目标 curl 外连需复核（存在升档信号）' : DYNAMIC_CURL_ISSUE,
      recommendation: DYNAMIC_CURL_RECOMMENDATION,
      note: escalate
        ? '二次裁决：动态 curl 目标且存在升档信号，列为疑似风险。'
        : '二次裁决：动态目标 curl 为行为发现，默认提示/待确认，不按恶意外连正式风险计。',
    };
  }

  if (isTelemetryExfil(h)) {
    return {
      processingStatus: 'suspected',
      severity: f.severity === 'critical' ? 'critical' : 'high',
      dimension: 'data_exfiltration',
      riskType: 'external_network_risk',
      issue: '未充分披露的遥测/分析平台外联',
      recommendation: '在 SKILL.md 明确披露遥测目的与数据范围；默认关闭或提供可配置关闭开关。',
      note: '二次裁决：向遥测平台上报数据，若未充分披露属真实外联/隐私风险。',
    };
  }

  if (isExternalLlmCall(h)) {
    return {
      processingStatus: 'suspected',
      severity: f.severity === 'low' ? 'medium' : f.severity,
      dimension: 'data_exfiltration',
      riskType: 'external_network_risk',
      issue: '调用外部大模型 API（可能发送用户内容）',
      recommendation: '在 SKILL.md 声明外部模型域名与数据范围；避免默认发送敏感业务字段。',
      note: '二次裁决：调用外部大模型 API，可能发送用户内容；声明不充分时应作为外部通信风险。',
    };
  }

  if (isPublicDataSourceCall(h)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'code_quality',
      issue: '公开数据源访问（无正式风险）',
      recommendation: '公开行情/政务等数据源访问可忽略；若需披露，在 SKILL.md 声明外联域名即可。',
      note: '二次裁决：公开金融/数据源访问，符合数据类 Skill 用途；无敏感外发时不计入正式风险。',
    };
  }

  if (isRuntimeUnlockedNpx(f, h)) {
    return {
      processingStatus: 'suspected',
      severity: f.severity === 'low' ? 'medium' : f.severity,
      dimension: 'supply_chain_attack',
      riskType: 'supply_chain_risk',
      issue: '运行时未锁定版本的 npx/uvx 调用（供应链风险）',
      recommendation: '为 npx/uvx 包名固定版本或 checksum；避免在安装/运行脚本中拉取未钉版本工具。',
      note: '二次裁决：运行时脚本中未锁版本 npx/uvx，保留为正式供应链风险（非文档说明）。',
    };
  }

  if (isUndeclaredNetworkRisk(h)) {
    return {
      processingStatus: 'suspected',
      severity: f.severity === 'low' ? 'medium' : f.severity,
      dimension: 'skill_md_inconsistency',
      riskType: 'external_network_risk',
      issue: 'Skill.md 未充分声明的外联/网络访问',
      recommendation: '在 SKILL.md 声明全部外联域名与用途；与实际脚本请求保持一致。',
      note: '二次裁决：存在外联行为但 Skill.md 未充分声明网络访问，保留为正式风险。',
    };
  }

  if (isFixedPipInstall(h)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'supply_chain_attack',
      riskType: 'supply_chain_risk',
      issue: '运行时安装固定常见依赖包（提示项）',
      note: '二次裁决：运行时 pip 安装固定常见依赖包，降为提示项（非可控包名高危）。',
    };
  }

  if (isCveDependencyWeakSignal(h, path)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'supply_chain_attack',
      riskType: 'supply_chain_risk',
      issue: '依赖漏洞弱信号（缺少具体 CVE/版本细节）',
      note: '二次裁决：仅依赖文件漏洞弱信号且无具体 CVE 编号，降为提示项。',
    };
  }

  if (isDocInstallHint(f, h)) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'supply_chain_attack',
      issue: '文档/SKILL.md 中的安装命令说明（非运行时自动执行）',
      note: '二次裁决：文档/SKILL.md 中的安装命令或供应链提示，不等同于运行时自动执行。',
    };
  }

  // Documented sudo/apt guidance strings (raise/echo/warn), not live privilege escalation
  if (
    /\bsudo\b/i.test(h) &&
    /(?:raise\s+RuntimeError|warn\s|info\s|echo\s|print\s*\(|To fix permanently|Run manually|Install it:)/i.test(
      h,
    ) &&
    !/subprocess\.(?:run|call|Popen|check_call)\s*\([^)]*sudo/i.test(h)
  ) {
    return {
      processingStatus: 'hint',
      severity: 'low',
      dimension: 'privilege_escalation',
      issue: '文档或错误提示中的 sudo 安装说明',
      note: '二次裁决：文档或错误提示中的 sudo 安装说明，非自动提权执行。',
    };
  }

  // Non-secret config env like PDF_TOKENS path variable
  if (
    /os\.environ\s*\[\s*["']PDF_TOKENS["']\]|PDF_TOKENS/i.test(h) &&
    !/(?:password|secret|api[_-]?key)\s*[:=]/i.test(h)
  ) {
    return {
      processingStatus: 'false_positive',
      severity: 'low',
      dimension: 'code_quality',
      issue: '业务配置环境变量（非硬编码密钥）',
      note: '二次裁决：PDF_TOKENS 等为本地路径/元数据传递变量，非硬编码密钥。',
    };
  }

  return null;
}
