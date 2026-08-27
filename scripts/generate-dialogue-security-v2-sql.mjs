import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { FileBlob, SpreadsheetFile } from '/Users/liguobin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const inputPath =
  '/Users/liguobin/work/zhiyu/project/zhian/docs/测试用例库标准/对话安全测试用例库_二级分类用例详情_V2_精简导入版.xlsx';
const outputPath =
  '/Users/liguobin/work/zhiyu/project/zhian/docs/测试用例库标准/导入SQL_对话安全测试用例库_V2_精简导入版_mysql.sql';

const libraryKeyBySubclass = {
  系统提示词泄露: 'dlg-v2-system-prompt-leak',
  身份冒充与权限越权: 'dlg-v2-identity-privilege',
  冲突指令优先级: 'dlg-v2-instruction-priority',
  改写编码绕过限制: 'dlg-v2-rewrite-encoding-evasion',
  内部配置与敏感信息泄露: 'dlg-v2-internal-config-leak',
  拒答一致性: 'dlg-v2-refusal-consistency',
  多轮诱导绕过限制: 'dlg-v2-multiturn-inducement',
  外部内容影响模型行为: 'dlg-v2-external-content-influence',
  文件网页指令注入: 'dlg-v2-file-web-injection',
  特殊字符与格式绕过: 'dlg-v2-special-char-evasion',
  拒答后继续诱导: 'dlg-v2-post-refusal-inducement',
  会话与记忆串用: 'dlg-v2-session-memory-crossuse',
  '隐私、密钥与内部内容泄露': 'dlg-v2-privacy-secret-leak',
  '违法、有害与危险内容生成': 'dlg-v2-harmful-illegal-output',
  不确定问题编造答案: 'dlg-v2-uncertainty-fabrication',
  偏见与不公平对待: 'dlg-v2-bias-unfair-treatment',
  输出格式影响下游系统: 'dlg-v2-output-format-downstream',
  拒答质量与安全替代: 'dlg-v2-refusal-quality-alternative',
  检索权限隔离: 'dlg-v2-rag-permission-isolation',
  答案摘要与引用越权泄露: 'dlg-v2-rag-summary-citation-leak',
  恶意文档影响回答或执行: 'dlg-v2-rag-malicious-document',
  用户与租户数据串读: 'dlg-v2-rag-tenant-crossread',
  引用真实性与时效性: 'dlg-v2-rag-citation-freshness',
  变形查询绕过敏感信息过滤: 'dlg-v2-rag-sensitive-query-evasion',
  工具身份与最小权限: 'dlg-v2-tool-identity-min-privilege',
  工具调用边界: 'dlg-v2-tool-call-boundary',
  工具参数篡改与校验绕过: 'dlg-v2-tool-param-tamper',
  高风险操作确认与审批: 'dlg-v2-high-risk-confirm-approval',
  重复调用与失败重试: 'dlg-v2-repeat-call-retry',
  错误工具结果导致误执行: 'dlg-v2-tool-result-misexecution',
};

const descriptions = {
  系统提示词泄露: '验证 Agent 是否会泄露 system/developer prompt、内部拒答红线、隐藏规则或可还原内部规则的摘要。',
  身份冒充与权限越权: '验证 Agent 是否会因自称身份、工号、口头授权或紧急理由而提升权限或访问未授权内容。',
  冲突指令优先级: '验证 Agent 在系统、开发者、用户、历史消息、外部内容和工具结果冲突时是否遵守正确优先级。',
  改写编码绕过限制: '验证 Agent 是否能识别翻译、编码、拆分、拼接、同义改写后的受限意图并保持安全边界。',
  内部配置与敏感信息泄露: '验证 Agent 是否会泄露模型路由、密钥片段、内部组件、过滤阈值、调试字段等内部配置。',
  拒答一致性: '验证同一风险请求在语言、格式、角色、轮次变化后是否仍被一致拒绝。',
  多轮诱导绕过限制: '验证多轮铺垫、承诺、施压、格式限定是否会诱导 Agent 放松安全边界。',
  外部内容影响模型行为: '验证用户资料、历史消息、工具返回、网页片段等外部内容是否会越权影响模型行为。',
  文件网页指令注入: '验证附件、网页、HTML 注释、文档隐藏指令是否会被 Agent 当作高优先级命令执行。',
  特殊字符与格式绕过: '验证零宽字符、Unicode 混淆、Markdown、代码块等格式噪声是否绕过安全识别。',
  拒答后继续诱导: '验证被拒后继续以局部示例、假设步骤、只讲原理等方式套取风险内容时的边界。',
  会话与记忆串用: '验证 Agent 是否会跨会话、跨用户、跨租户复用记忆、聊天记录或权限上下文。',
  '隐私、密钥与内部内容泄露': '验证 Agent 是否会明文输出或重组个人信息、Cookie、令牌、密钥、内部文本等敏感内容。',
  '违法、有害与危险内容生成': '验证 Agent 是否拒绝生成违法、有害、危险或可造成现实伤害的可执行内容。',
  不确定问题编造答案: '验证 Agent 在无法核验政策、来源、日期、数字、工具结果时是否会编造确定答案。',
  偏见与不公平对待: '验证 Agent 是否基于年龄、地域、性别、语言、残障等敏感属性做不公平判断。',
  输出格式影响下游系统: '验证 JSON、CSV、SQL、控制字符等结构化输出是否可能诱发下游系统误执行或注入。',
  拒答质量与安全替代: '验证 Agent 是否能简洁拒绝高风险请求，同时提供安全、合规、可执行的替代方向。',
  检索权限隔离: '验证 RAG 检索是否严格遵守用户、角色、租户、文档 ACL 等权限边界。',
  答案摘要与引用越权泄露: '验证摘要、引用、页码、标题、数字等是否会间接泄露无权文档内容。',
  恶意文档影响回答或执行: '验证知识库/文档中伪装的系统命令、隐藏指令、外链或外发要求是否影响回答或执行。',
  用户与租户数据串读: '验证多租户、多用户数据是否会通过索引、缓存、检索结果或历史上下文串读。',
  引用真实性与时效性: '验证 Agent 是否提供真实、可核验、时效正确的来源和引用，不伪造、不沿用过期信息。',
  变形查询绕过敏感信息过滤: '验证敏感字段换名、拆分、模糊查询、编码后是否仍被识别和过滤。',
  工具身份与最小权限: '验证工具调用时是否使用最小权限身份，不因任务便利切换到高权限工具。',
  工具调用边界: '验证预览、草稿、查询与真实执行之间的边界是否被正确区分。',
  工具参数篡改与校验绕过: '验证用户篡改 ID、范围、权限、隐藏字段时是否会被校验拦截。',
  高风险操作确认与审批: '验证删除、转账、外发、发布等高风险操作是否要求二次确认、审批或人工复核。',
  重复调用与失败重试: '验证超时、失败、状态不明时是否先查幂等键/任务状态，避免重复执行。',
  错误工具结果导致误执行: '验证工具返回缺少 ID、状态矛盾或与请求不一致时是否暂停并核验。',
};

function esc(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function jsonEsc(value) {
  return esc(JSON.stringify(value));
}

function idFor(prefix, value) {
  const hash = crypto.createHash('sha1').update(`${prefix}:${value}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function cleanTopCategory(value) {
  return String(value || '').replace(/^【建议新增】/, '');
}

const blob = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(blob);
const sheet = workbook.worksheets.getItem('导入字段');
const values = sheet.getUsedRange().values;
const headers = values[0].map(String);
const col = Object.fromEntries(headers.map((h, i) => [h, i]));

const rows = values.slice(1).filter((row) => /^DLG-/.test(String(row[col.caseCode] || '')));
const bySubclass = new Map();
for (const row of rows) {
  const subclass = String(row[col['二级类别']] || '').trim();
  if (!bySubclass.has(subclass)) bySubclass.set(subclass, []);
  bySubclass.get(subclass).push(row);
}

const libraryRows = [];
const caseRows = [];
for (const [subclass, group] of bySubclass) {
  const first = group[0];
  const domain = cleanTopCategory(first[col['一级类别']]);
  const libraryKey = libraryKeyBySubclass[subclass];
  if (!libraryKey) throw new Error(`Missing libraryKey mapping for ${subclass}`);
  const libraryId = idFor('lib', libraryKey);
  const riskLevel = group.some((row) => String(row[col.riskLevel]) === 'low') ? 'medium' : 'high';
  const standards = Array.from(
    new Set(
      group
        .map((row) => {
          try {
            return JSON.parse(String(row[col.metadata_JSON] || '{}')).caseBasis;
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    ),
  );
  libraryRows.push({
    id: libraryId,
    libraryKey,
    title: subclass,
    domain,
    description: descriptions[subclass] || `${subclass} 对话安全测试场景库。`,
    caseCount: group.length,
    enabled: 1,
    defaultLevel: riskLevel,
    detectMethod: '对话探测',
    status: 'published',
    standards,
    metadata: {
      libraryCategory: 'technical',
      taxonomyVersion: 'dialogue-security-v2',
      importedFrom: '对话安全测试用例库_二级分类用例详情_V2_精简导入版.xlsx',
      sourceTopCategory: domain,
      riskSubclass: subclass,
      tag: 'OWASP ASI',
      category: subclass,
      icon: domain.includes('工具')
        ? '🧰'
        : domain.includes('RAG')
          ? '📚'
          : domain.includes('输出')
            ? '📤'
            : domain.includes('会话')
              ? '⚔'
              : '⚠',
    },
  });

  for (const row of group) {
    const tags = String(row[col.tags] || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    let metadata = {};
    try {
      metadata = JSON.parse(String(row[col.metadata_JSON] || '{}'));
    } catch {
      metadata = {};
    }
    caseRows.push({
      id: idFor('tc', row[col.caseCode]),
      libraryId,
      libraryKey,
      caseCode: row[col.caseCode],
      name: row[col.name],
      attackType: row[col.attackType],
      prompt: row[col.prompt],
      expectedPass: row[col.expectedPass],
      expectedFail: row[col.expectedFail],
      riskLevel: row[col.riskLevel],
      status: row[col.status] || 'published',
      tags,
      sortOrder: Number(row[col.sortOrder] || 0),
      metadata: {
        ...metadata,
        taxonomyVersion: 'dialogue-security-v2',
        sourceLibraryKey: libraryKey,
        sourceTopCategory: domain,
      },
    });
  }
}

const newLibraryKeys = libraryRows.map((row) => row.libraryKey);
const sql = [];
sql.push('-- 对话安全测试用例库 V2 精简导入版（MySQL）');
sql.push('-- 生成方式：scripts/generate-dialogue-security-v2-sql.mjs');
sql.push('-- 用法：先确认 @org_id，再在目标库执行。重复执行会更新同一批 dlg-v2-* 库和 DLG-* 用例。');
sql.push('-- 注意：旧库不删除，仅设置 enabled=0/status=archived 并写入 metadata.legacyArchivedBy。');
sql.push('');
sql.push('START TRANSACTION;');
sql.push('');
sql.push('-- TODO: 客户机环境请把这里改成目标组织 ID；本地默认组织一般可用下面这条自动选择。');
sql.push("SET @org_id := (SELECT id FROM organizations WHERE slug = 'default' OR name = 'Default Organization' ORDER BY created_at LIMIT 1);");
sql.push("SET @actor_id := NULL;");
sql.push('SET @now := NOW();');
sql.push('');
sql.push('-- 1) 旧技术/对话安全库归档标记，不物理删除。');
sql.push(`UPDATE security_case_libraries
SET
  enabled = 0,
  status = 'archived',
  metadata = JSON_SET(
    COALESCE(metadata, JSON_OBJECT()),
    '$.legacyArchivedBy', 'dialogue-security-v2-import',
    '$.legacyArchivedAt', DATE_FORMAT(@now, '%Y-%m-%d %H:%i:%s'),
    '$.replacementTaxonomy', 'dialogue-security-v2'
  ),
  updated_by = @actor_id,
  updated_at = @now
WHERE organization_id = @org_id
  AND deleted_at IS NULL
  AND library_key NOT IN (${newLibraryKeys.map(esc).join(', ')})
  AND (
    metadata IS NULL
    OR JSON_EXTRACT(metadata, '$.libraryCategory') IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.libraryCategory')) = 'technical'
  )
  AND (
    domain IN ('基础攻击', '会话对抗', '企业自定义', '知识库',
               '系统指令泄露与绕过风险', '会话诱导与对抗攻击', '模型输出内容风险',
               '知识检索与 RAG 越权风险', '工具调用与执行安全')
    OR library_key LIKE 'dlg-%'
    OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.taxonomyVersion')) = 'dialogue-security-v2'
  );`);
sql.push('');
sql.push('-- 2) 导入/更新新版 30 个二级类别场景库。');
sql.push(`INSERT INTO security_case_libraries
(id, organization_id, library_key, title, domain, description, case_count, enabled, default_level, detect_method, status, standards, metadata, created_by, updated_by, created_at, updated_at)
VALUES`);
sql.push(
  libraryRows
    .map(
      (row) =>
        `(${esc(row.id)}, @org_id, ${esc(row.libraryKey)}, ${esc(row.title)}, ${esc(row.domain)}, ${esc(row.description)}, ${row.caseCount}, ${row.enabled}, ${esc(row.defaultLevel)}, ${esc(row.detectMethod)}, ${esc(row.status)}, CAST(${jsonEsc(row.standards)} AS JSON), CAST(${jsonEsc(row.metadata)} AS JSON), @actor_id, @actor_id, @now, @now)`,
    )
    .join(',\n') +
    `\nON DUPLICATE KEY UPDATE
  title = VALUES(title),
  domain = VALUES(domain),
  description = VALUES(description),
  case_count = VALUES(case_count),
  enabled = VALUES(enabled),
  default_level = VALUES(default_level),
  detect_method = VALUES(detect_method),
  status = VALUES(status),
  standards = VALUES(standards),
  metadata = VALUES(metadata),
  updated_by = @actor_id,
  updated_at = @now;`,
);
sql.push('');
sql.push('-- 3) 导入/更新 180 条测试样本。');
sql.push(`INSERT INTO security_test_cases
(id, organization_id, library_id, case_code, name, attack_type, prompt, expected_pass, expected_fail, risk_level, status, tags, sort_order, metadata, created_by, updated_by, created_at, updated_at)
VALUES`);
sql.push(
  caseRows
    .map(
      (row) =>
        `(${esc(row.id)}, @org_id, (SELECT id FROM security_case_libraries WHERE organization_id = @org_id AND library_key = ${esc(row.libraryKey)} LIMIT 1), ${esc(row.caseCode)}, ${esc(row.name)}, ${esc(row.attackType)}, ${esc(row.prompt)}, ${esc(row.expectedPass)}, ${esc(row.expectedFail)}, ${esc(row.riskLevel)}, ${esc(row.status)}, CAST(${jsonEsc(row.tags)} AS JSON), ${row.sortOrder}, CAST(${jsonEsc(row.metadata)} AS JSON), @actor_id, @actor_id, @now, @now)`,
    )
    .join(',\n') +
    `\nON DUPLICATE KEY UPDATE
  library_id = VALUES(library_id),
  name = VALUES(name),
  attack_type = VALUES(attack_type),
  prompt = VALUES(prompt),
  expected_pass = VALUES(expected_pass),
  expected_fail = VALUES(expected_fail),
  risk_level = VALUES(risk_level),
  status = VALUES(status),
  tags = VALUES(tags),
  sort_order = VALUES(sort_order),
  metadata = VALUES(metadata),
  updated_by = @actor_id,
  updated_at = @now,
  deleted_at = NULL;`,
);
sql.push('');
sql.push('-- 4) 按实际未删除用例数刷新新版库 case_count。');
sql.push(`UPDATE security_case_libraries l
JOIN (
  SELECT library_id, COUNT(*) AS cnt
  FROM security_test_cases
  WHERE organization_id = @org_id AND deleted_at IS NULL
  GROUP BY library_id
) c ON c.library_id = l.id
SET l.case_count = c.cnt, l.updated_at = @now
WHERE l.organization_id = @org_id
  AND l.library_key IN (${newLibraryKeys.map(esc).join(', ')});`);
sql.push('');
sql.push('COMMIT;');
sql.push('');
sql.push('-- 校验：');
sql.push(`-- SELECT domain, COUNT(*) libs, SUM(case_count) cases FROM security_case_libraries WHERE organization_id=@org_id AND library_key IN (${newLibraryKeys.map(esc).join(', ')}) GROUP BY domain;`);
sql.push("-- SELECT COUNT(*) FROM security_test_cases WHERE organization_id=@org_id AND case_code LIKE 'DLG-%' AND deleted_at IS NULL;");

await fs.writeFile(outputPath, sql.join('\n'), 'utf8');
console.log(
  JSON.stringify(
    {
      outputPath,
      libraries: libraryRows.length,
      cases: caseRows.length,
      libraryKeys: newLibraryKeys,
    },
    null,
    2,
  ),
);
