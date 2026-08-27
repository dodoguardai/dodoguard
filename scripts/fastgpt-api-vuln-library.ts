/**
 * FastGPT 漏洞库 + 攻击指令：校验、合并、自动扫描（chat/completions）
 *
 * 子命令:
 *   validate  校验 YAML、id 唯一、正则可编译
 *   merge     合并为统一 JSON（便于对接平台/检索）
 *   scan      对 /api/v1/chat/completions 执行 payloads / refusal / 全部
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import yaml from 'js-yaml';

import { compileYamlPatternToRegExp } from './lib/compileYamlRegex';
import {
  buildSerializedDifyAttackContent,
  type DifyChatTurn,
  getDifyChatTurnsFromYaml,
} from './lib/difyChatMessagesClient';
import {
  buildExpectLeakUserPayload,
  buildExpectRefusalUserPayload,
  callArkJudge,
  type LlmJudgeResult,
  loadArkJudgeConfig,
  truncateForJudge,
} from './lib/difyScanLlmJudge';
import { normalizeFastgptApiBaseUrl } from './lib/normalizeFastgptApiBaseUrl';
import { runFastgptMultiTurnChat } from './lib/fastgptChatCompletionsClient';
import { persistScanHitToMysql } from './lib/persistScanHitsToMysql';

const ROOT = path.join(__dirname, '..');
const DEFAULT_PAYLOADS = path.join(ROOT, 'docs/fastgpt-api-chat-completions-payloads.yaml');
const DEFAULT_REFUSAL = path.join(ROOT, 'docs/fastgpt-api-refusal-expected-vulns.yaml');
const DEFAULT_MERGE_OUT = path.join(ROOT, 'docs/fastgpt-api-vuln-library.unified.json');

// --- types ---

interface PayloadTurnStep {
  query: string;
  inputs?: Record<string, unknown>;
}

interface PayloadAttack {
  id: string;
  name: string;
  category: string;
  riskLevel: string;
  /** 单轮必填（除非使用 steps） */
  query?: string;
  inputs?: Record<string, unknown>;
  /**
   * 多轮：在同一 chatId 下按顺序发送
   * CLI 侧由扫描器生成 chatId 并复用。
   */
  steps?: PayloadTurnStep[];
  hitRegexes?: string[];
  notes?: string;
  expected_success?: string;
  non_vulnerability?: string;
  attack_mode?: string;
}

interface PayloadDoc {
  attacks: PayloadAttack[];
  refusalHints?: string[];
}

interface RefusalItem {
  id: string;
  vulnerability: {
    name: string;
    category: string;
    risk_level: string;
    avd_hint?: string;
  };
  attack: { query?: string; inputs?: Record<string, unknown>; steps?: PayloadTurnStep[] };
  expected_secure_behavior: string;
  insecure_indicates: string;
  notes?: string;
  attack_mode?: string;
}

interface RefusalDoc {
  items: RefusalItem[];
  refusal_patterns: string[];
  leak_risk_patterns: string[];
}

type UnifiedEntry = {
  id: string;
  name: string;
  source: 'chat-payloads' | 'refusal-expected';
  category: string;
  riskLevel: string;
  query: string;
  inputs: Record<string, unknown>;
  evaluationMode: 'expect_leak_in_response' | 'expect_refusal';
  hitRegexes?: string[];
  refusalPatterns?: string[];
  leakRiskPatterns?: string[];
  expectedSecureBehavior?: string;
  insecureIndicates?: string;
  notes?: string;
  expectedSuccess?: string;
  nonVulnerability?: string;
  attackMode?: string;
  conversationTurns?: DifyChatTurn[];
};

/** 扫描命中后便于对齐 attack_commands 表的行（不含 DB 自增 id / vulnerability_id） */
export type AttackCommandHitRow = {
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

// --- io ---

function readPayloads(p: string): PayloadDoc {
  const doc = yaml.load(fs.readFileSync(p, 'utf8')) as PayloadDoc;
  return { attacks: doc.attacks || [], refusalHints: doc.refusalHints };
}

function readRefusal(p: string): RefusalDoc {
  const doc = yaml.load(fs.readFileSync(p, 'utf8')) as RefusalDoc;
  return {
    items: doc.items || [],
    refusal_patterns: doc.refusal_patterns || [],
    leak_risk_patterns: doc.leak_risk_patterns || [],
  };
}

function tryCompileRegexes(patterns: string[], label: string): string[] {
  const bad: string[] = [];
  for (const p of patterns) {
    try {
      compileYamlPatternToRegExp(p);
    } catch {
      bad.push(`${label}: ${p.slice(0, 80)}`);
    }
  }
  return bad;
}

// --- validate ---

function cmdValidate(payloadsPath: string, refusalPath: string): void {
  const dupErrors: string[] = [];
  const regexErrors: string[] = [];
  const structErrors: string[] = [];
  const ids = new Map<string, string>();

  if (!fs.existsSync(payloadsPath)) {
    console.error(`缺少文件: ${payloadsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(refusalPath)) {
    console.error(`缺少文件: ${refusalPath}`);
    process.exit(1);
  }

  const payloads = readPayloads(payloadsPath);
  for (const a of payloads.attacks) {
    if (ids.has(a.id)) {
      dupErrors.push(`重复 id: ${a.id}（已见于 ${ids.get(a.id)}）`);
    }
    ids.set(a.id, 'payloads');
    try {
      getDifyChatTurnsFromYaml(
        { query: a.query, inputs: a.inputs, steps: a.steps },
        `payloads.${a.id}`,
      );
    } catch (e) {
      structErrors.push(e instanceof Error ? e.message : String(e));
    }
    regexErrors.push(...tryCompileRegexes(a.hitRegexes || [], `payloads.${a.id}`));
  }
  regexErrors.push(...tryCompileRegexes(payloads.refusalHints || [], 'payloads.refusalHints'));

  const refusal = readRefusal(refusalPath);
  for (const it of refusal.items) {
    if (ids.has(it.id)) {
      dupErrors.push(`重复 id: ${it.id}（已见于 ${ids.get(it.id)}）`);
    }
    ids.set(it.id, 'refusal');
    try {
      getDifyChatTurnsFromYaml(it.attack, `refusal.${it.id}`);
    } catch (e) {
      structErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  regexErrors.push(...tryCompileRegexes(refusal.refusal_patterns, 'refusal_patterns'));
  regexErrors.push(...tryCompileRegexes(refusal.leak_risk_patterns, 'leak_risk_patterns'));

  if (dupErrors.length || regexErrors.length || structErrors.length) {
    if (dupErrors.length) {
      console.error('ID 问题:\n', dupErrors.join('\n'));
    }
    if (structErrors.length) {
      console.error('结构问题（query / steps）:\n', structErrors.join('\n'));
    }
    if (regexErrors.length) {
      console.error('正则编译失败:\n', regexErrors.join('\n'));
    }
    process.exit(1);
  }

  console.log(
    `校验通过: payloads ${payloads.attacks.length} 条, refusal ${refusal.items.length} 条, id 共 ${ids.size} 个`,
  );
}

// --- merge ---

function toUnified(payloadsPath: string, refusalPath: string): UnifiedEntry[] {
  const payloads = readPayloads(payloadsPath);
  const refusal = readRefusal(refusalPath);
  const out: UnifiedEntry[] = [];

  for (const a of payloads.attacks) {
    const turns = getDifyChatTurnsFromYaml(
      { query: a.query, inputs: a.inputs, steps: a.steps },
      `payloads.${a.id}`,
    );
    const last = turns[turns.length - 1]!;
    out.push({
      id: a.id,
      name: a.name,
      source: 'chat-payloads',
      category: a.category,
      riskLevel: a.riskLevel,
      query: last.query.trim(),
      inputs: last.inputs,
      evaluationMode: 'expect_leak_in_response',
      hitRegexes: a.hitRegexes,
      refusalPatterns: payloads.refusalHints,
      notes: a.notes,
      expectedSuccess: a.expected_success,
      nonVulnerability: a.non_vulnerability,
      attackMode: a.attack_mode,
      conversationTurns: turns.length > 1 ? turns : undefined,
    });
  }

  for (const it of refusal.items) {
    const turns = getDifyChatTurnsFromYaml(it.attack, `refusal.${it.id}`);
    const last = turns[turns.length - 1]!;
    out.push({
      id: it.id,
      name: it.vulnerability.name,
      source: 'refusal-expected',
      category: it.vulnerability.category,
      riskLevel: it.vulnerability.risk_level,
      query: last.query.trim(),
      inputs: last.inputs,
      evaluationMode: 'expect_refusal',
      refusalPatterns: refusal.refusal_patterns,
      leakRiskPatterns: refusal.leak_risk_patterns,
      expectedSecureBehavior: it.expected_secure_behavior,
      insecureIndicates: it.insecure_indicates,
      notes: it.notes,
      expectedSuccess: it.insecure_indicates,
      nonVulnerability: it.expected_secure_behavior,
      attackMode: it.attack_mode,
      conversationTurns: turns.length > 1 ? turns : undefined,
    });
  }

  return out;
}

function payloadSerializedContent(a: PayloadAttack): string {
  const turns = getDifyChatTurnsFromYaml(
    { query: a.query, inputs: a.inputs, steps: a.steps },
    `payloads.${a.id}`,
  );
  return buildSerializedDifyAttackContent(turns);
}

function refusalSerializedContent(it: RefusalItem): string {
  const turns = getDifyChatTurnsFromYaml(it.attack, `refusal.${it.id}`);
  return buildSerializedDifyAttackContent(turns);
}

function payloadExpectedSuccessText(a: PayloadAttack): string {
  if (a.expected_success) return a.expected_success;
  if (a.notes) return `响应命中本用例 hitRegexes；说明：${a.notes}`;
  return '响应命中本用例 hitRegexes，出现与测试目标一致的危险特征（泄露、内网数据、越权结果等）。';
}

function payloadNonVulnerabilityText(a: PayloadAttack): string {
  return a.non_vulnerability || '未命中 hitRegexes，或仅为拒答/无关说明，无与本测试目标一致的危险特征。';
}

function cmdMerge(payloadsPath: string, refusalPath: string, outPath: string): void {
  const unified = toUnified(payloadsPath, refusalPath);
  const doc = {
    generatedAt: new Date().toISOString(),
    version: 1,
    description:
      '由 fastgpt-api-chat-completions-payloads.yaml 与 fastgpt-api-refusal-expected-vulns.yaml 合并；用于检索、对接平台或审计。',
    count: unified.length,
    commands: unified,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`已写入 ${unified.length} 条 → ${outPath}`);
}

// --- scan ---

function compileRegexes(patterns: string[]): RegExp[] {
  return patterns.map((p) => compileYamlPatternToRegExp(p));
}

function matchAny(text: string, regexes: RegExp[]): boolean {
  return regexes.some((r) => r.test(text));
}

function matchAllSources(text: string, patterns: string[]): string[] {
  const matched: string[] = [];
  const rs = compileRegexes(patterns);
  for (let i = 0; i < rs.length; i++) {
    if (rs[i]!.test(text)) {
      matched.push(patterns[i]!.slice(0, 60));
    }
  }
  return matched;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

type JudgeMode = 'regex' | 'llm' | 'both';

const MAX_LLM_JUDGE_CHARS = 32000;

function computePayloadHit(mode: JudgeMode, regexHit: boolean, llmVulnerable: boolean): boolean {
  if (mode === 'regex') return regexHit;
  if (mode === 'llm') return llmVulnerable;
  return regexHit || llmVulnerable;
}

type PersistPolicy = 'hit' | 'llm_vulnerable_only';

function computeRefusalStatus(
  mode: JudgeMode,
  leaked: boolean,
  refused: boolean,
  llmVerdict: LlmJudgeResult['verdict'] | null,
): 'pass' | 'vulnerable' | 'review' {
  const llmV = llmVerdict === 'vulnerable';
  const llmS = llmVerdict === 'safe';
  if (mode === 'regex') {
    if (leaked) return 'vulnerable';
    if (refused) return 'pass';
    return 'review';
  }
  if (mode === 'llm') {
    if (llmV) return 'vulnerable';
    if (llmS) return 'pass';
    return 'review';
  }
  if (leaked || llmV) return 'vulnerable';
  if (refused || llmS) return 'pass';
  return 'review';
}

interface ScanCli {
  baseUrl?: string;
  apiKey?: string;
  payloadsPath: string;
  refusalPath: string;
  profile: 'payloads' | 'refusal' | 'all';
  delayMs: number;
  limit?: number;
  ids?: Set<string>;
  outJson?: string;
  failOnHit: boolean;
  judgeMode: JudgeMode;
  arkModel?: string;
  persistHitsToDb: boolean;
  persistPolicy: PersistPolicy;
  llmRequireEvidence: boolean;
}

function parseScanArgs(argv: string[], base: ScanCli): ScanCli {
  const out = { ...base };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--base-url' && argv[i + 1]) out.baseUrl = argv[++i]!;
    else if (a === '--api-key' && argv[i + 1]) out.apiKey = argv[++i]!;
    else if (a === '--payloads-yaml' && argv[i + 1]) out.payloadsPath = path.resolve(argv[++i]!);
    else if (a === '--refusal-yaml' && argv[i + 1]) out.refusalPath = path.resolve(argv[++i]!);
    else if (a === '--profile' && argv[i + 1]) {
      const v = argv[++i]! as ScanCli['profile'];
      if (v === 'payloads' || v === 'refusal' || v === 'all') out.profile = v;
    } else if (a === '--delay-ms' && argv[i + 1]) out.delayMs = Number(argv[++i]!);
    else if (a === '--limit' && argv[i + 1]) out.limit = Number(argv[++i]!);
    else if (a === '--ids' && argv[i + 1]) {
      out.ids = new Set(
        argv[++i]!
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (a === '--out' && argv[i + 1]) out.outJson = path.resolve(argv[++i]!);
    else if (a === '--fail-on-hit') out.failOnHit = true;
    else if (a === '--judge-mode' && argv[i + 1]) {
      const v = argv[++i]! as JudgeMode;
      if (v === 'regex' || v === 'llm' || v === 'both') out.judgeMode = v;
    } else if (a === '--ark-model' && argv[i + 1]) out.arkModel = argv[++i]!;
    else if (a === '--persist-hits-db') out.persistHitsToDb = true;
    else if (a === '--persist-policy' && argv[i + 1]) {
      const v = argv[++i]!.trim() as PersistPolicy;
      if (v === 'hit' || v === 'llm_vulnerable_only') {
        out.persistPolicy = v;
      }
    } else if (a === '--llm-require-evidence') {
      out.llmRequireEvidence = true;
    }
  }

  out.baseUrl = out.baseUrl || process.env.FASTGPT_API_BASE_URL;
  out.apiKey = out.apiKey || process.env.FASTGPT_API_KEY;
  if (
    process.env.FASTGPT_SCAN_PERSIST_HITS_DB === '1' ||
    process.env.FASTGPT_SCAN_PERSIST_HITS_DB === 'true'
  ) {
    out.persistHitsToDb = true;
  }

  return out;
}

async function cmdScan(args: ScanCli): Promise<number> {
  if (!args.baseUrl || !args.apiKey) {
    console.error('scan 需要 FASTGPT_API_BASE_URL 与 FASTGPT_API_KEY（或 --base-url / --api-key）');
    process.exit(1);
  }

  args.baseUrl = normalizeFastgptApiBaseUrl(args.baseUrl);

  const needsLlm = args.judgeMode === 'llm' || args.judgeMode === 'both';
  const arkConfig = needsLlm ? loadArkJudgeConfig(args.arkModel) : null;
  if (needsLlm && !arkConfig) {
    console.error(
      'scan：当前 --judge-mode 为 llm/both 时，需要配置豆包（火山方舟）API：\n' +
        '  环境变量 ARK_API_KEY（必填）、ARK_MODEL（必填，为控制台端点模型 ID）\n' +
        '  可选：ARK_API_BASE_URL、ARK_TIMEOUT_MS\n' +
        '  或使用参数：--ark-model <端点模型ID>（仍须 ARK_API_KEY）',
    );
    process.exit(1);
  }

  let persistDbEnabled = args.persistHitsToDb;
  if (persistDbEnabled) {
    try {
      const { getDbType } = await import('../backend/src/database/index');
      if (getDbType() !== 'mysql') {
        console.warn(
          '[db-persist] 已跳过：当前仅支持 MySQL（请设置 DB_TYPE=mysql 并配置 DATABASE_URL 或 DB_*）',
        );
        persistDbEnabled = false;
      }
    } catch (e) {
      persistDbEnabled = false;
      console.warn(
        `[db-persist] 已跳过：无法加载后端数据库模块（${
          e instanceof Error ? e.message : String(e)
        }）`,
      );
    }
  }

  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    profile: args.profile,
    judgeMode: args.judgeMode,
    exploitHits: [] as unknown[],
    refusalAssessments: [] as unknown[],
    attackCommandHits: [] as AttackCommandHitRow[],
    dbPersistLog: [] as unknown[],
    errors: [] as { phase: string; id: string; message: string }[],
  };

  const pushAttackCommandHit = (row: AttackCommandHitRow) => {
    (report.attackCommandHits as AttackCommandHitRow[]).push(row);
  };

  const pushAttackCommandHitAndPersist = async (row: AttackCommandHitRow, shouldPersist: boolean) => {
    pushAttackCommandHit(row);
    if (!persistDbEnabled) return;
    if (!shouldPersist) {
      (report.dbPersistLog as unknown[]).push({
        ok: false,
        libraryId: row.library_id,
        skipped: `persistPolicy=${args.persistPolicy}`,
        at: new Date().toISOString(),
      });
      return;
    }

    const result = await persistScanHitToMysql(row, { vulnerabilityType: 'fastgpt' });
    (report.dbPersistLog as unknown[]).push({
      ...result,
      at: new Date().toISOString(),
    });

    if (!result.ok && 'error' in result) {
      (report.errors as { phase: string; id: string; message: string }[]).push({
        phase: 'db-persist',
        id: row.library_id,
        message: result.error,
      });
      console.log(`[db-persist 失败] ${row.library_id}: ${result.error.slice(0, 160)}`);
    } else if (result.ok) {
      console.log(
        `[db-persist] ${row.library_id} → vulnerability_id=${result.vulnerabilityId} attack_command_id=${result.attackCommandId}`,
      );
    }
  };

  const buildSummary = () => {
    const exploitHits = report.exploitHits as unknown[];
    const refusalAssessments = report.refusalAssessments as { status: string }[];
    const vulnRefusal = refusalAssessments.filter((r) => r.status === 'vulnerable').length;
    const attackCommandHits = report.attackCommandHits as AttackCommandHitRow[];
    const dbLog = report.dbPersistLog as { ok?: boolean }[];
    const dbPersistOk = dbLog.filter((x) => x && x.ok === true).length;
    const dbPersistFail = dbLog.filter((x) => x && x.ok === false).length;
    return {
      exploitHitCount: exploitHits.length,
      refusalPassCount: refusalAssessments.filter((r) => r.status === 'pass').length,
      refusalVulnerableCount: vulnRefusal,
      refusalReviewCount: refusalAssessments.filter((r) => r.status === 'review').length,
      attackCommandHitCount: attackCommandHits.length,
      dbPersistSuccessCount: dbPersistOk,
      dbPersistFailureCount: dbPersistFail,
      errorCount: (report.errors as unknown[]).length,
    };
  };

  const flushReport = (state: 'running' | 'complete') => {
    if (!args.outJson) return;
    report.summary = buildSummary();
    report.scanState = state;
    if (state === 'running') {
      report.scanNote =
        '扫描进行中：blocking 模式下每条需等待 FastGPT/模型返回；中断 Ctrl+C 前可随时查看本文件已有条目。';
    } else {
      delete report.scanNote;
    }
    fs.writeFileSync(args.outJson, JSON.stringify(report, null, 2), 'utf8');
  };

  const runPayload = args.profile === 'payloads' || args.profile === 'all';
  const runRefusal = args.profile === 'refusal' || args.profile === 'all';

  flushReport('running');

  if (runPayload) {
    const doc = readPayloads(args.payloadsPath);
    const refusalRes = compileRegexes(doc.refusalHints || []);
    let attacks = doc.attacks;
    if (args.ids) attacks = attacks.filter((a) => args.ids!.has(a.id));
    if (args.limit !== undefined && args.limit > 0) attacks = attacks.slice(0, args.limit);

    const leakModeDesc =
      args.judgeMode === 'regex'
        ? '正则命中 = 疑似漏洞'
        : args.judgeMode === 'llm'
          ? '豆包裁决 verdict=vulnerable = 疑似漏洞'
          : '正则命中 或 豆包裁决 vulnerable = 疑似漏洞';

    console.log(`\n[expect_leak] 执行 ${attacks.length} 条（${leakModeDesc}）\n`);

    for (const attack of attacks) {
      const patterns = compileRegexes(attack.hitRegexes || []);
      let turns: DifyChatTurn[];
      try {
        turns = getDifyChatTurnsFromYaml(
          { query: attack.query, inputs: attack.inputs, steps: attack.steps },
          `payloads.${attack.id}`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        (report.errors as { phase: string; id: string; message: string }[]).push({
          phase: 'payloads',
          id: attack.id,
          message,
        });
        console.log(`[结构错误] ${attack.id}: ${message}`);
        flushReport('running');
        await sleep(args.delayMs);
        continue;
      }

      try {
        const { lastRaw, lastAnswer, chatId, turnSummaries } = await runFastgptMultiTurnChat(
          args.baseUrl,
          args.apiKey,
          turns,
          args.delayMs,
          sleep,
        );

        const scanText =
          lastRaw.length > 80000
            ? `${lastRaw.slice(0, 40000)}\n...[truncated]...\n${lastRaw.slice(-40000)}`
            : lastRaw;

        const matched: string[] = [];
        for (const r of patterns) {
          if (r.test(scanText)) matched.push(r.source);
        }
        const regexHit = matched.length > 0;

        let llmJudge: LlmJudgeResult | undefined;
        let llmJudgeError: string | undefined;

        if (arkConfig) {
          const bodyToJudge = truncateForJudge(
            lastAnswer.trim().length > 0 ? lastAnswer : scanText,
            MAX_LLM_JUDGE_CHARS,
          );

          const userContent = buildExpectLeakUserPayload({
            libraryId: attack.id,
            name: attack.name,
            category: attack.category,
            riskLevel: attack.riskLevel,
            expectedSuccessHint: payloadExpectedSuccessText(attack),
            nonVulnerabilityHint: payloadNonVulnerabilityText(attack),
            notes: attack.notes,
            bodyToJudge,
          });

          try {
            const { judge } = await callArkJudge(arkConfig, userContent);
            llmJudge = judge;
          } catch (e) {
            llmJudgeError = e instanceof Error ? e.message : String(e);
            if (args.judgeMode === 'llm') {
              (report.errors as { phase: string; id: string; message: string }[]).push({
                phase: 'payloads-llm-judge',
                id: attack.id,
                message: llmJudgeError,
              });
            }
          }
        }

        const llmVulnerable = llmJudge?.verdict === 'vulnerable';
        let hit = computePayloadHit(args.judgeMode, regexHit, llmVulnerable);
        if (args.judgeMode === 'both' && llmJudgeError) hit = regexHit;
        if (args.judgeMode === 'llm' && llmJudgeError) hit = false;
        if (args.llmRequireEvidence && hit && llmVulnerable && !regexHit) {
          hit = false;
        }

        if (hit) {
          const patternForRow =
            matched.length > 0
              ? matched
              : llmVulnerable
                ? [`llm:vulnerable:${llmJudge?.confidence ?? 'unknown'}`]
                : matched;

          (report.exploitHits as unknown[]).push({
            id: attack.id,
            name: attack.name,
            category: attack.category,
            riskLevel: attack.riskLevel,
            matchedPatterns: matched,
            judgeMode: args.judgeMode,
            regexHit,
            llmJudge,
            llmJudgeError,
            answerPreview: lastAnswer.slice(0, 4000),
            turnCount: turns.length,
            conversationId: chatId,
            multiTurn: turns.length > 1,
            turnSummaries,
          });

          const shouldPersist =
            args.persistPolicy === 'hit' ? true : Boolean(llmJudge && llmJudge.verdict === 'vulnerable' && !llmJudgeError);

          await pushAttackCommandHitAndPersist(
            {
            library_id: attack.id,
            name: attack.name,
            content: payloadSerializedContent(attack),
            expected_success: payloadExpectedSuccessText(attack),
            non_vulnerability: payloadNonVulnerabilityText(attack),
            attack_mode: attack.attack_mode || (turns.length > 1 ? 'multi_turn' : 'direct'),
            risk_level: attack.riskLevel,
            category: attack.category,
            evaluation_profile: 'expect_leak',
            matched_patterns: patternForRow,
            },
            shouldPersist,
          );

          const via =
            args.judgeMode === 'regex'
              ? '正则'
              : args.judgeMode === 'llm'
                ? 'LLM'
                : regexHit && llmVulnerable
                  ? '正则+LLM'
                  : regexHit
                    ? '正则'
                    : 'LLM';

          console.log(
            `[泄露命中·${via}] ${attack.id}${turns.length > 1 ? ` (${turns.length} 轮)` : ''} → 已写入 attackCommandHits`,
          );
        } else {
          const softRefuse =
            lastAnswer.length > 0 && lastAnswer.length < 12000 && matchAny(lastAnswer, refusalRes);
          console.log(
            softRefuse ? `[未命中·有拒答话术] ${attack.id}` : `[未命中·需复核] ${attack.id}`,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        (report.errors as { phase: string; id: string; message: string }[]).push({
          phase: 'payloads',
          id: attack.id,
          message,
        });
        console.log(`[错误] ${attack.id}: ${message.slice(0, 120)}`);
      }

      flushReport('running');
      await sleep(args.delayMs);
    }
  }

  if (runRefusal) {
    const doc = readRefusal(args.refusalPath);
    const refuseRe = compileRegexes(doc.refusal_patterns);
    const leakRe = compileRegexes(doc.leak_risk_patterns);
    let items = doc.items;
    if (args.ids) items = items.filter((it) => args.ids!.has(it.id));
    if (args.limit !== undefined && args.limit > 0) items = items.slice(0, args.limit);

    const refusalModeDesc =
      args.judgeMode === 'regex'
        ? '泄露正则命中 = 漏洞；拒答且无泄露正则 = 通过'
        : args.judgeMode === 'llm'
          ? '豆包裁决：vulnerable=漏洞，safe=通过，uncertain=待人工'
          : '正则与豆包并行：任一方判漏洞则漏洞；否则拒答正则或 LLM safe 则通过';

    console.log(`\n[expect_refusal] 执行 ${items.length} 条（${refusalModeDesc}）\n`);

    for (const it of items) {
      let turns: DifyChatTurn[];
      try {
        turns = getDifyChatTurnsFromYaml(it.attack, `refusal.${it.id}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        (report.errors as { phase: string; id: string; message: string }[]).push({
          phase: 'refusal',
          id: it.id,
          message,
        });
        console.log(`[结构错误] ${it.id}: ${message}`);
        flushReport('running');
        await sleep(args.delayMs);
        continue;
      }

      try {
        const { lastRaw, lastAnswer, chatId, turnSummaries } = await runFastgptMultiTurnChat(
          args.baseUrl,
          args.apiKey,
          turns,
          args.delayMs,
          sleep,
        );

        const scanText =
          lastRaw.length > 80000
            ? `${lastRaw.slice(0, 40000)}\n...[truncated]...\n${lastRaw.slice(-40000)}`
            : lastRaw;

        const leaked = matchAny(scanText, leakRe);
        const refused = matchAny(lastAnswer, refuseRe) || matchAny(scanText, refuseRe);
        const matchedLeaks = matchAllSources(scanText, doc.leak_risk_patterns);

        let llmJudge: LlmJudgeResult | undefined;
        let llmJudgeError: string | undefined;

        if (arkConfig) {
          const bodyToJudge = truncateForJudge(
            lastAnswer.trim().length > 0 ? lastAnswer : scanText,
            MAX_LLM_JUDGE_CHARS,
          );

          const userContent = buildExpectRefusalUserPayload({
            libraryId: it.id,
            name: it.vulnerability.name,
            category: it.vulnerability.category,
            riskLevel: it.vulnerability.risk_level,
            expectedSecureBehavior: it.expected_secure_behavior,
            insecureIndicates: it.insecure_indicates,
            notes: it.notes,
            bodyToJudge,
          });

          try {
            const { judge } = await callArkJudge(arkConfig, userContent);
            llmJudge = judge;
          } catch (e) {
            llmJudgeError = e instanceof Error ? e.message : String(e);
            if (args.judgeMode === 'llm') {
              (report.errors as { phase: string; id: string; message: string }[]).push({
                phase: 'refusal-llm-judge',
                id: it.id,
                message: llmJudgeError,
              });
            }
          }
        }

        const llmVerdict: LlmJudgeResult['verdict'] | null =
          llmJudge && !llmJudgeError ? llmJudge.verdict : null;

        let status = computeRefusalStatus(args.judgeMode, leaked, refused, llmVerdict);
        if (args.judgeMode === 'both' && llmJudgeError) status = computeRefusalStatus('regex', leaked, refused, null);
        if (args.judgeMode === 'llm' && llmJudgeError) status = 'review';
        if (args.llmRequireEvidence && status === 'vulnerable' && llmVerdict === 'vulnerable' && !leaked) {
          status = 'review';
        }

        (report.refusalAssessments as unknown[]).push({
          id: it.id,
          name: it.vulnerability.name,
          status,
          answerPreview: lastAnswer.slice(0, 3000),
          refused,
          leaked,
          leakPatternHits: matchedLeaks,
          judgeMode: args.judgeMode,
          llmJudge,
          llmJudgeError,
          turnCount: turns.length,
          conversationId: chatId,
          multiTurn: turns.length > 1,
          turnSummaries,
        });

        if (status === 'vulnerable') {
          const patternForRow =
            matchedLeaks.length > 0
              ? matchedLeaks
              : llmVerdict === 'vulnerable'
                ? [`llm:vulnerable:${llmJudge?.confidence ?? 'unknown'}`]
                : matchedLeaks;

          const shouldPersist =
            args.persistPolicy === 'hit' ? true : llmVerdict === 'vulnerable';

          await pushAttackCommandHitAndPersist(
            {
            library_id: it.id,
            name: it.vulnerability.name,
            content: refusalSerializedContent(it),
            expected_success: it.insecure_indicates,
            non_vulnerability: it.expected_secure_behavior,
            attack_mode: it.attack_mode || (turns.length > 1 ? 'multi_turn' : 'direct'),
            risk_level: it.vulnerability.risk_level,
            category: it.vulnerability.category,
            evaluation_profile: 'expect_refusal',
            matched_patterns: patternForRow,
            },
            shouldPersist,
          );
        }

        const tag = status === 'pass' ? '[拒答·通过]' : status === 'vulnerable' ? '[泄露·漏洞倾向]' : '[待人工]';
        console.log(
          `${tag} ${it.id}${turns.length > 1 ? ` (${turns.length} 轮)` : ''}${status === 'vulnerable' ? ' → 已写入 attackCommandHits' : ''}`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        (report.errors as { phase: string; id: string; message: string }[]).push({
          phase: 'refusal',
          id: it.id,
          message,
        });
        console.log(`[错误] ${it.id}: ${message.slice(0, 120)}`);
      }

      flushReport('running');
      await sleep(args.delayMs);
    }
  }

  const exploitHits = report.exploitHits as unknown[];
  const refusalAssessments = report.refusalAssessments as { status: string }[];
  const vulnRefusal = refusalAssessments.filter((r) => r.status === 'vulnerable').length;

  report.summary = buildSummary();
  delete report.scanState;
  delete report.scanNote;

  console.log('\n--- 汇总 ---', JSON.stringify(report.summary, null, 2));

  if (args.outJson) {
    fs.writeFileSync(args.outJson, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n报告: ${args.outJson}`);
  }

  const shouldFail = args.failOnHit && (exploitHits.length > 0 || vulnRefusal > 0);
  return shouldFail ? 2 : 0;
}

// --- main ---

function printGlobalHelp() {
  console.log(`
fastgpt-api-vuln-library — 漏洞库校验 / 合并 / 扫描

用法:
  npx tsx scripts/fastgpt-api-vuln-library.ts <validate|merge|scan> [选项]

validate
  [--payloads-yaml PATH] [--refusal-yaml PATH]

merge
  [--payloads-yaml PATH] [--refusal-yaml PATH] [--out PATH]
  默认输出: docs/fastgpt-api-vuln-library.unified.json

scan
  --profile payloads|refusal|all
  [--base-url URL] [--api-key KEY]
  base-url 为 API 根（如 http://localhost:端口），不要含 /api/v1/chat/completions
  [--delay-ms N] [--limit N] [--ids id1,id2] [--out report.json] [--fail-on-hit]
  [--judge-mode regex|llm|both] [--ark-model 端点模型ID]
  [--persist-hits-db]  命中时写入 MySQL vulnerabilities + attack_commands（须 DB_TYPE=mysql）
  [--persist-policy hit|llm_vulnerable_only]  入库策略：hit=命中即入库；llm_vulnerable_only=仅 LLM 判 vulnerable 才入库（推荐）
  [--llm-require-evidence]  启用后：LLM 判 vulnerable 仍需命中证据正则（payload: hitRegexes；refusal: leak_risk_patterns）

豆包裁决环境变量：ARK_API_KEY、ARK_MODEL（必填）；可选 ARK_API_BASE_URL、ARK_TIMEOUT_MS
FastGPT：FASTGPT_API_BASE_URL、FASTGPT_API_KEY
入库开关（可选）：FASTGPT_SCAN_PERSIST_HITS_DB=true
详见: 仓库 README-DODOGUARD.md 与 package.json 中 fastgpt:vuln / fastgpt:chat-scan 等脚本。
`);
}

async function main() {
  const sub = process.argv[2];
  if (!sub || sub === '-h' || sub === '--help') {
    printGlobalHelp();
    process.exit(0);
  }

  let payloadsPath = DEFAULT_PAYLOADS;
  let refusalPath = DEFAULT_REFUSAL;

  if (sub === 'validate') {
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--payloads-yaml' && process.argv[i + 1]) payloadsPath = path.resolve(process.argv[++i]!);
      else if (process.argv[i] === '--refusal-yaml' && process.argv[i + 1]) refusalPath = path.resolve(process.argv[++i]!);
    }
    cmdValidate(payloadsPath, refusalPath);
    return;
  }

  if (sub === 'merge') {
    let outPath = DEFAULT_MERGE_OUT;
    for (let i = 3; i < process.argv.length; i++) {
      if (process.argv[i] === '--payloads-yaml' && process.argv[i + 1]) payloadsPath = path.resolve(process.argv[++i]!);
      else if (process.argv[i] === '--refusal-yaml' && process.argv[i + 1]) refusalPath = path.resolve(process.argv[++i]!);
      else if (process.argv[i] === '--out' && process.argv[i + 1]) outPath = path.resolve(process.argv[++i]!);
    }
    cmdValidate(payloadsPath, refusalPath);
    cmdMerge(payloadsPath, refusalPath, outPath);
    return;
  }

  if (sub === 'scan') {
    const defaults: ScanCli = {
      payloadsPath: DEFAULT_PAYLOADS,
      refusalPath: DEFAULT_REFUSAL,
      profile: 'all',
      delayMs: 800,
      failOnHit: false,
      judgeMode: 'regex',
      persistHitsToDb:
        process.env.FASTGPT_SCAN_PERSIST_HITS_DB === '1' || process.env.FASTGPT_SCAN_PERSIST_HITS_DB === 'true',
      persistPolicy:
        (process.env.FASTGPT_SCAN_PERSIST_POLICY as PersistPolicy) === 'llm_vulnerable_only'
          ? 'llm_vulnerable_only'
          : 'hit',
      llmRequireEvidence:
        process.env.FASTGPT_SCAN_LLM_REQUIRE_EVIDENCE === '1' ||
        process.env.FASTGPT_SCAN_LLM_REQUIRE_EVIDENCE === 'true',
    };

    const args = parseScanArgs(process.argv, defaults);
    const code = await cmdScan(args);
    process.exit(code);
  }

  console.error(`未知子命令: ${sub}`);
  printGlobalHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

