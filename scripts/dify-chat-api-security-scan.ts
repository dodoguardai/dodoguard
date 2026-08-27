/**
 * Dify POST /v1/chat-messages 黑盒安全扫描入口
 *
 * 用法:
 *   DIFY_API_BASE_URL=http://localhost DIFY_API_KEY=app-xxx npx tsx scripts/dify-chat-api-security-scan.ts
 *   npx tsx scripts/dify-chat-api-security-scan.ts --base-url http://localhost --api-key app-xxx --out ./dify-chat-hits.json
 *
 * 说明: 命中依据为 YAML 中 hitRegexes 与全文响应的匹配；存在误报/漏报，请人工复核 answer。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import yaml from 'js-yaml';
import { compileYamlPatternToRegExp } from './lib/compileYamlRegex';
import { getDifyChatTurnsFromYaml, runDifyMultiTurnChat } from './lib/difyChatMessagesClient';
import { normalizeDifyApiBaseUrl } from './lib/normalizeDifyApiBaseUrl';

const DEFAULT_YAML = path.join(__dirname, '../docs/dify-api-chat-messages-payloads.yaml');

interface AttackPayload {
  id: string;
  name: string;
  category: string;
  riskLevel: string;
  query?: string;
  inputs?: Record<string, unknown>;
  steps?: { query: string; inputs?: Record<string, unknown> }[];
  hitRegexes?: string[];
  notes?: string;
}

interface PayloadDoc {
  version?: number;
  attacks: AttackPayload[];
  refusalHints?: string[];
}

interface ScanHit {
  id: string;
  name: string;
  category: string;
  riskLevel: string;
  matchedPatterns: string[];
  answerPreview: string;
  notes?: string;
}

interface ScanSummary {
  startedAt: string;
  baseUrl: string;
  yamlPath: string;
  total: number;
  hits: ScanHit[];
  errors: { id: string; message: string }[];
}

function parseArgs(argv: string[]) {
  const out: {
    baseUrl?: string;
    apiKey?: string;
    yamlPath: string;
    delayMs: number;
    limit?: number;
    ids?: Set<string>;
    outJson?: string;
    failOnHit: boolean;
    help: boolean;
  } = {
    yamlPath: DEFAULT_YAML,
    delayMs: 800,
    failOnHit: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a === '--base-url' && argv[i + 1]) {
      out.baseUrl = argv[++i];
    } else if (a === '--api-key' && argv[i + 1]) {
      out.apiKey = argv[++i];
    } else if (a === '--yaml' && argv[i + 1]) {
      out.yamlPath = path.resolve(argv[++i]);
    } else if (a === '--delay-ms' && argv[i + 1]) {
      out.delayMs = Number(argv[++i]);
    } else if (a === '--limit' && argv[i + 1]) {
      out.limit = Number(argv[++i]);
    } else if (a === '--ids' && argv[i + 1]) {
      out.ids = new Set(
        argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (a === '--out' && argv[i + 1]) {
      out.outJson = path.resolve(argv[++i]);
    } else if (a === '--fail-on-hit') {
      out.failOnHit = true;
    }
  }

  out.baseUrl = out.baseUrl || process.env.DIFY_API_BASE_URL;
  out.apiKey = out.apiKey || process.env.DIFY_API_KEY;

  return out;
}

function printHelp() {
  console.log(`
Dify /v1/chat-messages 安全扫描

环境变量:
  DIFY_API_BASE_URL   API 根地址，勿带 /v1/chat-messages
  DIFY_API_KEY        例如 app-xxxxx

参数:
  --base-url <url>    覆盖环境变量
  --api-key <key>     覆盖环境变量
  --yaml <path>       载荷文件，默认 docs/dify-api-chat-messages-payloads.yaml
  --delay-ms <n>      每条请求间隔，默认 800
  --limit <n>         只跑前 n 条
  --ids id1,id2       只跑指定 id
  --out <path.json>   将命中条目写入 JSON
  --fail-on-hit         若存在命中则进程退出码为 2（便于 CI）

多轮: 载荷 YAML 中可使用 steps（与 npm run dify:vuln scan 相同语义）。
`);
}

function compileRegexes(patterns: string[]): RegExp[] {
  return patterns.map((p) => compileYamlPatternToRegExp(p));
}

function matchPatterns(text: string, regexes: RegExp[]): string[] {
  const matched: string[] = [];
  for (const r of regexes) {
    if (r.test(text)) {
      matched.push(r.source);
    }
  }
  return matched;
}

function looksLikeRefusal(text: string, hints: RegExp[]): boolean {
  if (text.length > 12000) {
    return false;
  }
  return hints.some((h) => h.test(text));
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.baseUrl || !args.apiKey) {
    console.error('错误: 请设置 DIFY_API_BASE_URL 与 DIFY_API_KEY，或使用 --base-url / --api-key');
    printHelp();
    process.exit(1);
  }

  args.baseUrl = normalizeDifyApiBaseUrl(args.baseUrl);

  if (!fs.existsSync(args.yamlPath)) {
    console.error(`错误: 找不到载荷文件: ${args.yamlPath}`);
    process.exit(1);
  }

  const doc = yaml.load(fs.readFileSync(args.yamlPath, 'utf8')) as PayloadDoc;
  const refusalRes = (doc.refusalHints || []).map((p) => new RegExp(p));
  let attacks = doc.attacks || [];

  if (args.ids) {
    attacks = attacks.filter((a) => args.ids!.has(a.id));
  }
  if (args.limit !== undefined && args.limit > 0) {
    attacks = attacks.slice(0, args.limit);
  }

  const summary: ScanSummary = {
    startedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    yamlPath: args.yamlPath,
    total: attacks.length,
    hits: [],
    errors: [],
  };

  console.log(`\n开始扫描: ${args.baseUrl}，共 ${attacks.length} 条载荷，间隔 ${args.delayMs}ms\n`);

  for (const attack of attacks) {
    const patterns = compileRegexes(attack.hitRegexes || []);
    let turns;
    try {
      turns = getDifyChatTurnsFromYaml(
        { query: attack.query, inputs: attack.inputs, steps: attack.steps },
        `payloads.${attack.id}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ id: attack.id, message });
      console.log(`[结构错误] ${attack.id}: ${message.slice(0, 200)}`);
      await sleep(args.delayMs);
      continue;
    }

    try {
      const { lastRaw, lastAnswer } = await runDifyMultiTurnChat(
        args.baseUrl,
        args.apiKey,
        turns,
        'dodoguard-chat-scan',
        args.delayMs,
        sleep,
      );
      const scanText =
        lastRaw.length > 80000
          ? `${lastRaw.slice(0, 40000)}\n...[truncated]...\n${lastRaw.slice(-40000)}`
          : lastRaw;
      const matched = matchPatterns(scanText, patterns);

      const refusalOnly =
        matched.length === 0 && lastAnswer.length > 0 && looksLikeRefusal(lastAnswer, refusalRes);

      if (matched.length > 0) {
        summary.hits.push({
          id: attack.id,
          name: attack.name,
          category: attack.category,
          riskLevel: attack.riskLevel,
          matchedPatterns: matched,
          answerPreview: lastAnswer.slice(0, 4000),
          notes: attack.notes,
        });
        console.log(
          `[命中] ${attack.id} (${attack.riskLevel}) — ${attack.name}${turns.length > 1 ? ` [${turns.length} 轮]` : ''}`,
        );
        console.log(`       匹配正则数: ${matched.length}`);
      } else if (refusalOnly) {
        console.log(`[拒答/未发现特征] ${attack.id} — ${attack.name}`);
      } else {
        console.log(
          `[未命中正则] ${attack.id} — ${attack.name}（请人工查看 answer 是否仍泄露信息）`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ id: attack.id, message });
      console.log(`[请求失败] ${attack.id}: ${message.slice(0, 200)}`);
    }

    await sleep(args.delayMs);
  }

  console.log(
    `\n完成。命中 ${summary.hits.length} / ${summary.total}，请求失败 ${summary.errors.length}。\n`,
  );

  if (summary.hits.length > 0) {
    console.log('--- 命中条目（攻击成功 = 平台在该启发式下表现为不安全，请人工复核）---');
    for (const h of summary.hits) {
      console.log(`\n* ${h.id}: ${h.name}`);
      console.log(`  分类: ${h.category}  风险: ${h.riskLevel}`);
      if (h.notes) {
        console.log(`  备注: ${h.notes}`);
      }
      console.log(
        `  answer 摘要:\n${h.answerPreview.slice(0, 1200)}${h.answerPreview.length > 1200 ? '\n...(截断)' : ''}`,
      );
    }
  }

  if (args.outJson) {
    fs.writeFileSync(args.outJson, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n已写入: ${args.outJson}`);
  }

  const exitCode = args.failOnHit && summary.hits.length > 0 ? 2 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
