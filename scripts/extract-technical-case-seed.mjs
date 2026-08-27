#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'docs/新版本/agent_security_platform_prototype_V2.8.html');
const outPath = path.join(root, 'backend/src/server/routes/api/v1/technical-seed-data.json');

const DOMAIN_MAP = {
  agentBasicRiskLibs: '基础攻击',
  agentSessionAdversarialLibs: '会话对抗',
  agentModelOutputRiskLibs: '企业自定义',
  agentKbRiskLibs: '知识库',
};

function mapLibLevel(value) {
  const text = String(value || '');
  if (text.includes('严重')) return 'critical';
  if (text.includes('高危') || text.includes('高')) return 'high';
  if (text.includes('中危') || text.includes('中')) return 'medium';
  return 'low';
}

function mapSampleLevel(value) {
  return mapLibLevel(value);
}

function buildPrompt(sample) {
  if (typeof sample.userPrompt === 'string' && sample.userPrompt.trim()) {
    return sample.userPrompt.trim();
  }
  if (Array.isArray(sample.turnSteps) && sample.turnSteps.length) {
    return sample.turnSteps
      .map((step, index) => `[轮次 ${index + 1}] ${step.userInput || step.content || ''}`)
      .join('\n\n');
  }
  if (Array.isArray(sample.turns) && sample.turns.length) {
    return sample.turns
      .map((step, index) => `[轮次 ${index + 1}] ${step.content || step.userInput || ''}`)
      .join('\n\n');
  }
  if (typeof sample.indirectPayload === 'string' && sample.indirectPayload.trim()) {
    return sample.indirectPayload.trim();
  }
  return sample.name || '检测样本';
}

function buildTurns(sample) {
  if (Array.isArray(sample.turnSteps) && sample.turnSteps.length) {
    return sample.turnSteps.map((step) => ({
      role: 'user',
      content: step.userInput || step.content || '',
      expectedSafe: step.expectedSafe,
    }));
  }
  if (Array.isArray(sample.turns) && sample.turns.length) {
    return sample.turns.map((step) => ({
      role: step.role || 'user',
      content: step.content || step.userInput || '',
      expectedSafe: step.expectedSafe,
    }));
  }
  return undefined;
}

function parseArrayFromHtml(html, name) {
  const marker = `const ${name}=`;
  const startIndex = html.indexOf(marker);
  if (startIndex < 0) {
    throw new Error(`Missing ${name} in prototype HTML`);
  }
  const arrayStart = html.indexOf('[', startIndex);
  let depth = 0;
  for (let i = arrayStart; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        // eslint-disable-next-line no-eval
        return eval(html.slice(arrayStart, i + 1));
      }
    }
  }
  throw new Error(`Unterminated array for ${name}`);
}

function toStandards(lib) {
  const items = [];
  if (lib.tag) items.push(String(lib.tag));
  if (lib.standards) items.push(String(lib.standards));
  if (lib.basis) items.push(String(lib.basis));
  return [...new Set(items.filter(Boolean))];
}

function transformLibrary(lib, domain) {
  const key = lib.id;
  const samples = (lib.samples || []).map((sample, index) => {
    const caseCode = `TC-${key}-${String(index + 1).padStart(2, '0')}`;
    const turns = buildTurns(sample);
    const entry = {
      caseCode,
      name: sample.name || caseCode,
      attackType: sample.attackType || 'direct',
      prompt: buildPrompt(sample),
      expectedPass: sample.expectedPass || '符合安全边界',
      expectedFail: sample.expectedFail || '触发安全风险',
      riskLevel: mapSampleLevel(sample.riskLevel),
      testMethod: sample.testMethod || undefined,
      caseBasis: sample.caseBasis || lib.basis || undefined,
      riskSubclass: sample.riskSubclass || lib.category || undefined,
    };
    if (turns?.length) {
      entry.turns = turns;
    }
    if (sample.indirectPayload) {
      entry.indirectPayload = sample.indirectPayload;
    }
    if (sample.contextSource) {
      entry.contextSource = sample.contextSource;
    }
    return entry;
  });

  return {
    key,
    title: lib.title,
    domain,
    description: lib.desc || lib.description || '',
    defaultLevel: mapLibLevel(lib.defaultLevel),
    detectMethod: lib.detectMode || lib.detectMethod || '对话探测',
    standards: toStandards(lib),
    enabled: lib.enabled !== false,
    icon: lib.icon || '⚠',
    tag: lib.tag || 'OWASP ASI',
    basis: lib.basis || '',
    scope: lib.scope || '全部 Agent',
    category: lib.category || domain,
    samples,
  };
}

const html = fs.readFileSync(htmlPath, 'utf8');
const libraries = [];

for (const [arrayName, domain] of Object.entries(DOMAIN_MAP)) {
  const rows = parseArrayFromHtml(html, arrayName);
  for (const lib of rows) {
    libraries.push(transformLibrary(lib, domain));
  }
}

const payload = { libraries };
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const sampleCount = libraries.reduce((sum, lib) => sum + lib.samples.length, 0);
console.log(`Wrote ${libraries.length} libraries and ${sampleCount} samples to ${outPath}`);
