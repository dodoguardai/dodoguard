/**
 * Finding processing status — 确认 / 疑似 / 提示 / 参考样例 / 误报
 * Aligns with product rules: file weight, execution path, attack chain, hard signals.
 */

export type ProcessingStatus =
  | 'confirmed'
  | 'suspected'
  | 'hint'
  | 'reference_sample'
  | 'false_positive';

export type FileRiskWeight = 'high' | 'medium' | 'medium_low' | 'low';

export type ExecutionContext =
  | 'auto_execute'
  | 'install_phase'
  | 'user_input_sink'
  | 'doc_example'
  | 'rule_sample'
  | 'agent_indirect'
  | 'unknown';

export type FindingDispositionInput = {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  dimension?: string;
  riskType?: string;
  location: string;
  issue: string;
  evidence: string;
  sourceFile?: string;
  ruleIds?: string[];
  triageNote?: string;
  llmAdjusted?: boolean;
  /** Set when LLM triage dismissed — kept for audit only */
  dismissed?: boolean;
};

export type DispositionStats = {
  confirmed: number;
  suspected: number;
  hint: number;
  reference_sample: number;
  false_positive: number;
  formalRiskCount: number;
};

function haystack(f: FindingDispositionInput): string {
  return `${f.issue}\n${f.evidence}\n${f.location}\n${f.triageNote || ''}`.toLowerCase();
}

function filePath(f: FindingDispositionInput): string {
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

export function inferFileRiskWeight(path: string): FileRiskWeight {
  const p = path.replace(/\\/g, '/').toLowerCase();
  const base = p.split('/').pop() ?? p;

  if (/skill\.md$|skills\.md$/.test(base) || /^skill\.md$/i.test(base)) {
    return 'high';
  }
  if (/\/scripts\/|\.(sh|py|js|ts|mjs|cjs)$/.test(p) || /post-create|install|hook/i.test(p)) {
    return 'high';
  }
  if (/package\.json|requirements\.txt|pyproject\.toml|poetry\.lock|pnpm-lock/i.test(p)) {
    return 'medium';
  }
  if (/^readme\.md$/i.test(base) || /\/readme\.md$/i.test(p)) {
    return 'medium_low';
  }
  if (/(?:^|\/)references\/|(?:^|\/)docs\/|(?:^|\/)examples\/|threat-patterns|knowledge/i.test(p)) {
    return 'low';
  }
  if (/\.csv$|\.tsv$|knowledge-base|kb\//i.test(p)) {
    return 'low';
  }
  if (base === '.ds_store' || base === 'thumbs.db') {
    return 'low';
  }
  return 'medium';
}

export function inferExecutionContext(f: FindingDispositionInput): ExecutionContext {
  const p = filePath(f);
  const h = haystack(f);

  if (/post-create|install\.(sh|py|js)|hooks\/|pre-install|post-install/i.test(p)) {
    return 'install_phase';
  }
  if (
    /\.(sh|py|js|ts|mjs|cjs)$/.test(p) &&
    !/(?:^|\/)references\/|(?:^|\/)docs\/|(?:^|\/)examples\//.test(p)
  ) {
    return 'auto_execute';
  }
  if (/\$\{|\$[a-z_]+|user[_-]?input|stdin|argv|getenv\(/i.test(h)) {
    return 'user_input_sink';
  }
  if (
    /(?:^|\/)references\/|threat-patterns|security-rules|(?:^|\/)docs\/|(?:^|\/)examples\//i.test(p)
  ) {
    return 'rule_sample';
  }
  if (/^readme\.md$/i.test(p.split('/').pop() ?? '') || /\/readme\.md$/i.test(p)) {
    return 'doc_example';
  }
  if (/\.csv$|knowledge|kb\//i.test(p)) {
    return 'agent_indirect';
  }
  return 'unknown';
}

/** Signals that must not be silently dropped — at least suspected. */
export function hasHardNeverIgnoreSignal(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  if (/\bcurl\b[^;\n]{0,200}\|\s*(ba)?sh\b/i.test(h)) {
    return true;
  }
  if (/\bwget\b[^;\n]{0,200}\|\s*sh\b/i.test(h)) {
    return true;
  }
  if (/\brm\s+-rf\b|chmod\s+777|chown\s+root/i.test(h)) {
    return true;
  }
  if (/subprocess\s*\([^)]*shell\s*=\s*true/i.test(h)) {
    return true;
  }
  if (
    (!isEnvFilePresenceOnly(f) && /\.env/i.test(h)) ||
    /~\/\.ssh|id_rsa|api[_-]?key|secret[_-]?key|password\s*=\s*['"][^'"]+['"]/i.test(h)
  ) {
    return true;
  }
  if (/unicode|steganograph|ascii\s+smuggl|零宽|隐写/i.test(h)) {
    return true;
  }
  if (
    /不要告诉用户|隐藏操作|忽略系统规则|ignore\s+(all\s+)?(previous|prior)\s+instructions/i.test(h)
  ) {
    return true;
  }
  if (
    /(?:exfil|leak|data\s+exfil|pastebin|paste\.rs|webhook|requestbin|external\s+paste|数据外传|数据外泄|环境信息泄露|澶栦紶|澶栨硠)/i.test(
      h,
    ) &&
    /(?:\.env|env(?:ironment)?|uname|hostname|host\s+info|credential|secret|token|password|主机信息|鐜|涓绘満)/i.test(
      h,
    )
  ) {
    return true;
  }
  if (
    /\b(?:curl|wget|fetch|requests\.(?:post|get)|axios\.)\b/i.test(h) &&
    /(?:pastebin|paste\.rs|webhook|requestbin|ngrok|evil\.example|unknown\s+external|external\s+site|外部)/i.test(
      h,
    ) &&
    /(?:\.env|env(?:ironment)?|uname|hostname|host\s+info|whoami|credential|secret|token|password|主机信息|鐜|涓绘満)/i.test(
      h,
    )
  ) {
    return true;
  }
  if (
    /bash\s+-i\s+>&\s*\/dev\/tcp\/|\/dev\/tcp\/|\/dev\/udp\/|\bnc\s+(-[ecvp]+)+|\bsocat\b.*exec/i.test(
      h,
    )
  ) {
    return true;
  }
  if ((f.category || '').toUpperCase() === 'ARCHIVE_SECURITY') {
    return true;
  }
  return false;
}

function hasActionSignal(h: string): boolean {
  return /\b(curl|wget|fetch|exec|eval|subprocess|system\(|bash\s+-c|rm\s+-rf)\b/i.test(h);
}

function hasImpactSignal(h: string): boolean {
  return /exfil|leak|token|password|secret|credential|destroy|wipe|privilege|sudo|metadata/i.test(
    h,
  );
}

function hasSourceSignal(h: string, ctx: ExecutionContext): boolean {
  if (ctx === 'install_phase' || ctx === 'auto_execute' || ctx === 'user_input_sink') {
    return true;
  }
  return /malicious|inject|override|ignore\s+.*instructions|hidden\s+directive|jailbreak/i.test(h);
}

export function hasAttackChain(f: FindingDispositionInput, ctx: ExecutionContext): boolean {
  const h = haystack(f);
  return hasSourceSignal(h, ctx) && hasActionSignal(h) && hasImpactSignal(h);
}

function isPackageHygiene(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  const base = filePath(f).split('/').pop() ?? '';
  if (base === '.ds_store' || base === 'thumbs.db') {
    return true;
  }
  if (/missing license|no license|does not specify a license/i.test(h)) {
    return true;
  }
  return false;
}

function hasConcreteSecretMaterial(f: FindingDispositionInput): boolean {
  const h = `${f.issue}\n${f.evidence}`;
  if (
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[0-9a-z_]{20,}|xox[baprs]-[0-9a-z-]{10,}|sk-[0-9a-z]{20,}/i.test(
      h,
    )
  ) {
    return true;
  }
  return /\b(?:api[_-]?key|secret|token|password|passwd|credential|private[_-]?key|access[_-]?key|authorization)\b\s*[:=]\s*['"]?(?:bearer\s+)?[^\s'"#]{8,}/i.test(
    h,
  );
}

function isEnvFilePresenceOnly(f: FindingDispositionInput): boolean {
  const base = filePath(f).split('/').pop() ?? '';
  if (!/^\.env(?:[._-][\w-]+)?$/i.test(base)) {
    return false;
  }
  const h = haystack(f);
  if (
    /(?:exfil|leak|send|upload|post|curl|fetch|requests\.post|pastebin|webhook|external|数据外传|数据外泄|环境信息泄露)/i.test(
      h,
    )
  ) {
    return false;
  }
  return !hasConcreteSecretMaterial(f);
}

function isBenignCodeQualityFinding(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  const dimension = (f.dimension || '').toLowerCase();
  const codeQuality =
    dimension === 'code_quality' ||
    /\b(code quality|quality issue|lint|style|unused|dead code|return rule)\b/i.test(h);
  if (!codeQuality) {
    return false;
  }
  return !/\b(curl|wget|fetch|exec|eval|subprocess|system\s*\(|os\.system|shell\s*=\s*true|requests\.|httpx\.|axios\.|rm\s+-rf|chmod\s+777|token|secret|password|api[_-]?key|credential|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions)\b/i.test(
    h,
  );
}

function isReadmePath(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  return /^readme\.md$/i.test(base);
}

function hasActualSkillBehaviorClaim(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  const path = filePath(f);

  if (
    /(?:^|\/)(?:agents\/skills|\.agents\/skills)\/[^/]+\/(?:skill\.md|scripts\/)|(?:^|\/)(?:skill\.md|skills\.md)$/i.test(
      path,
    )
  ) {
    return true;
  }

  return /(?:actual|real|target)\s+(?:skill|mcp|package|runtime)|this\s+(?:skill|package|mcp|agent).{0,120}\b(?:contains|runs|executes|loads|sends|uploads|posts|reads|collects|exfiltrates|downloads|installs|hides)\b|\bskill\s+(?:instruction|body|script|runtime|package).{0,120}\b(?:contains|runs|executes|loads|sends|uploads|posts|reads|collects|exfiltrates|downloads|installs|hides)\b|automatically\s+(?:loaded|executed|run|runs|invoked)|agent\s+(?:loads|executes|runs|will\s+run)|(?:agents\/skills|\.agents\/skills)\/[^/\s]+\/(?:skill\.md|scripts\/)|指令中存在|真实\s*skill|实际(?:运行|执行)|自动(?:执行|加载)|技能.{0,80}(?:发送|外传|外泄|隐藏|执行|读取|收集)/i.test(
    h,
  );
}

function hasReferenceSampleMarker(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  const path = filePath(f);

  if (
    /(?:^|\/)(?:tests?|__tests__|fixtures?|benchmarks?)\/|skill-defender\/|scanner\/|threat-patterns|security-rules|jailbreak.*example/i.test(
      path,
    )
  ) {
    return true;
  }

  if (/(?:^|\/)(?:references|docs|examples)\//i.test(path) || isReadmePath(path)) {
    return /(?:\bexample\b|\bsample\b|\breference\b|\bfixture\b|\bbenchmark\b|threat\s+pattern|attack\s+pattern|rule\s+library|security\s+training|educational|for\s+demonstration|what\s+it\s+catches|示例|样例|参考|规则库|威胁模式|训练样本|鏍蜂緥|绀轰緥|鍙傝€冩牱渚?)/i.test(
      `${h}\n${path}`,
    );
  }

  return false;
}

function isClearReferenceOrTrainingSample(f: FindingDispositionInput): boolean {
  return hasReferenceSampleMarker(f) && !hasActualSkillBehaviorClaim(f);
}

function isPureObfuscationHint(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  if (!/_0x[0-9a-f]{2,}/i.test(h) && !/混淆\/不可读|obfuscat/i.test(h)) {
    return false;
  }
  return !/\beval\s*\(|\bexec\s*\(|subprocess|child_process|requests\.|fetch\s*\(|curl\s+|os\.system/i.test(
    h,
  );
}

function isDocPathInstallOrSudoHint(f: FindingDispositionInput): boolean {
  const path = filePath(f);
  const base = path.split('/').pop() ?? path;
  const docPath =
    /^skill\.md$/i.test(base) ||
    /^readme\.md$/i.test(base) ||
    /\/(?:docs|examples|references)\//i.test(path);
  if (!docPath) {
    return false;
  }
  const h = haystack(f);
  return (
    /npx\s+\w+|without (?:a )?version suffix|rug-pull|sudo\s+apt|brew\s+install/i.test(h) &&
    !/subprocess\.(?:run|call|Popen|check_call)\s*\(/i.test(h) &&
    !hasActualSkillBehaviorClaim(f)
  );
}

function isDetectorRuleSampleNoise(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  const path = filePath(f);
  if (/(?:threat-patterns|security-rules|scanner\/|skill-defender)/i.test(path)) {
    return !hasActualSkillBehaviorClaim(f);
  }
  return (
    /危险模式检测|防护规则|what\s+it\s+catches|rule\s+library|检测器内容/i.test(h) &&
    !hasActualSkillBehaviorClaim(f)
  );
}

/** AWS key / PEM in clear reference samples: downgrade, do not count as formal secret leak. */
function isSensitivePatternInReferenceDoc(f: FindingDispositionInput): boolean {
  const h = haystack(f);
  if (
    !/akia[0-9a-z]{16}|begin (rsa |openssh )?private key|aws[_-]?access[_-]?key|api[_-]?secret/i.test(
      h,
    )
  ) {
    return false;
  }
  return isClearReferenceOrTrainingSample(f);
}

export function classifyProcessingStatus(f: FindingDispositionInput): ProcessingStatus {
  if (f.dismissed) {
    return 'false_positive';
  }

  const cat = (f.category || '').toUpperCase();
  // Engine skip/fail is scan-quality noise — not a package security risk (ARCHIVE_SECURITY stays formal).
  if (cat === 'SCAN_INTEGRITY' || f.riskType === 'scan_integrity_risk') {
    return 'hint';
  }
  if (cat === 'ARCHIVE_SECURITY') {
    return f.severity === 'critical' || f.severity === 'high' ? 'confirmed' : 'suspected';
  }

  if (isPackageHygiene(f)) {
    return 'hint';
  }

  if (isSensitivePatternInReferenceDoc(f)) {
    return 'reference_sample';
  }

  if (isEnvFilePresenceOnly(f) || isBenignCodeQualityFinding(f)) {
    return 'hint';
  }

  if (isPureObfuscationHint(f) || isDocPathInstallOrSudoHint(f) || isDetectorRuleSampleNoise(f)) {
    return isDetectorRuleSampleNoise(f) && hasReferenceSampleMarker(f)
      ? 'reference_sample'
      : 'hint';
  }

  const path = filePath(f);
  const weight = inferFileRiskWeight(path);
  const execCtx = inferExecutionContext(f);
  const hard = hasHardNeverIgnoreSignal(f);
  const chain = hasAttackChain(f, execCtx);
  const clearReference = isClearReferenceOrTrainingSample(f);
  const actualSkillBehavior = hasActualSkillBehaviorClaim(f);

  if (clearReference) {
    return 'reference_sample';
  }

  if (
    (execCtx === 'rule_sample' || execCtx === 'doc_example' || execCtx === 'agent_indirect') &&
    !actualSkillBehavior
  ) {
    if (hard) {
      return execCtx === 'agent_indirect' ? 'suspected' : 'hint';
    }
    return 'hint';
  }

  if (chain && (weight === 'high' || execCtx === 'install_phase' || execCtx === 'auto_execute')) {
    return f.severity === 'critical' || f.severity === 'high' ? 'confirmed' : 'suspected';
  }

  if (hard) {
    if (
      execCtx === 'install_phase' ||
      execCtx === 'auto_execute' ||
      execCtx === 'user_input_sink'
    ) {
      return f.severity === 'low'
        ? 'suspected'
        : f.severity === 'medium'
          ? 'suspected'
          : 'confirmed';
    }
    if (weight === 'high') {
      return f.severity === 'critical' || f.severity === 'high' ? 'confirmed' : 'suspected';
    }
    return 'suspected';
  }

  if (weight === 'low' && (f.severity === 'low' || f.severity === 'medium')) {
    return 'hint';
  }

  if (f.severity === 'critical' || f.severity === 'high') {
    return 'suspected';
  }

  return 'hint';
}

export function isFormalRiskStatus(status: ProcessingStatus): boolean {
  return status === 'confirmed' || status === 'suspected';
}

export function countDispositionStats(
  findings: Array<{ processingStatus?: ProcessingStatus }>,
): DispositionStats {
  const stats: DispositionStats = {
    confirmed: 0,
    suspected: 0,
    hint: 0,
    reference_sample: 0,
    false_positive: 0,
    formalRiskCount: 0,
  };
  for (const f of findings) {
    const s = f.processingStatus ?? 'suspected';
    stats[s] += 1;
    if (isFormalRiskStatus(s)) {
      stats.formalRiskCount += 1;
    }
  }
  return stats;
}

export function processingStatusLabel(status: ProcessingStatus, isZh: boolean): string {
  const map: Record<ProcessingStatus, [string, string]> = {
    confirmed: ['Confirmed risk', '确认风险'],
    suspected: ['Suspected risk', '疑似风险'],
    hint: ['Hint', '提示项'],
    reference_sample: ['Reference sample hit', '参考样例命中'],
    false_positive: ['False positive', '误报确认'],
  };
  return isZh ? map[status][1] : map[status][0];
}
