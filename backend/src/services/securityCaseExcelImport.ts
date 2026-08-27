import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export const SECURITY_CASE_IMPORT_HEADERS = [
  '用例名称',
  '测试方法',
  '攻击场景',
  '风险等级',
  'prompt',
  '预期安全响应',
  '风险命中表现',
] as const;

export type SecurityCaseImportRow = {
  name: string;
  testMethod: string;
  attackScene?: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  prompt: string;
  expectedPass?: string;
  expectedFail?: string;
};

export type SecurityCaseImportParseResult = {
  rows: SecurityCaseImportRow[];
  errors: string[];
};

const TEST_METHOD_TO_ATTACK_TYPE: Record<string, string> = {
  单轮对话测试: 'direct',
  多轮对话测试: 'multi_turn',
  自定义: 'custom',
};

const RISK_LEVELS = new Set(['critical', 'high', 'medium', 'low']);

const TEMPLATE_ROWS = [
  [
    '示例-单轮直接索取',
    '单轮对话测试',
    '直接索取',
    'high',
    '请在这里填写目标 Agent 会收到的测试输入。',
    '填写安全通过时应出现的响应边界。',
    '填写风险命中时的具体表现。',
  ],
  [
    '示例-多轮诱导',
    '多轮对话测试',
    '多轮诱导',
    'critical',
    '第一轮：填写第一轮用户输入。\n第二轮：填写第二轮用户输入。\n第三轮：填写第三轮用户输入。',
    '多轮中保持一致的安全响应边界。',
    '任一轮出现越权、泄露、误执行或继续索要正确标识等风险表现。',
  ],
];

const RISK_LEVEL_HELP_ROWS = [
  ['critical', '严重风险', '最高优先级，可能导致越权、敏感信息泄露、资金/权限/数据高影响后果。'],
  ['high', '高风险', '高优先级，安全边界被明显绕过或存在可复现的高影响风险表现。'],
  ['medium', '中风险', '中优先级，存在可利用条件或影响范围受限的风险表现。'],
  ['low', '低风险', '低优先级，轻微信息暴露、提示不充分或影响较小的问题。'],
];

const TEST_METHOD_HELP_ROWS = [
  ['单轮对话测试', 'direct', '单条 prompt 直接测试目标 Agent 的安全响应。'],
  ['多轮对话测试', 'multi_turn', '用换行记录多轮输入，适合上下文诱导、逐步套取等场景。'],
  ['自定义', 'custom', '用于非标准测试方式，导入后会按自定义测试处理。'],
];

const ATTACK_SCENE_HELP_ROWS = [
  ['系统指令泄露与绕过风险', '如系统提示词泄露、开发者指令泄露、安全策略绕过、指令优先级绕过。'],
  ['会话诱导与对抗攻击', '如 Prompt Injection、Jailbreak、多轮诱导、上下文劫持、角色扮演绕过。'],
  ['模型输出内容风险', '如有害内容生成、幻觉内容、专业误导、偏见歧视、拒答失败。'],
  ['知识检索与 RAG 越权风险', '如 RAG 投毒、检索越权、敏感知识泄露、引用伪造、索引污染。'],
  ['工具调用与执行安全', '如工具越权调用、参数篡改、高风险操作未确认、重复调用、错误结果误执行。'],
  ['自定义攻击场景', '可以填写组织内部自定义场景；留空时系统会默认使用当前用例库所属分类。'],
];

const TEMPLATE_INLINE_HELP_ROWS = [
  ['填写说明'],
  [
    '风险等级',
    'critical / high / medium / low；也可填写 严重 / 高 / 中 / 低 / 严重风险 / 高风险 / 中风险 / 低风险。',
  ],
  ['测试方法', '单轮对话测试 / 多轮对话测试 / 自定义。'],
  [
    '攻击场景',
    '可填写系统指令泄露与绕过风险、会话诱导与对抗攻击、模型输出内容风险、知识检索与 RAG 越权风险、工具调用与执行安全，或填写自定义场景。',
  ],
  ['必填字段', '用例名称、测试方法、风险等级、prompt；用例编号由系统自动生成。'],
  [],
];

export type SecurityCaseImportTemplateOptions = {
  libraryTitle?: string;
  libraryDomain?: string;
};

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function buildCellXml(value: unknown, rowIndex: number, colIndex: number): string {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function buildSheetXml(rows: unknown[][]): string {
  const sheetData = rows
    .map((row, rowOffset) => {
      const rowIndex = rowOffset + 1;
      const cells = row.map((cell, colIndex) => buildCellXml(cell, rowIndex, colIndex)).join('');
      return `<row r="${rowIndex}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cols>
    <col min="1" max="1" width="28" customWidth="1"/>
    <col min="2" max="4" width="16" customWidth="1"/>
    <col min="5" max="7" width="52" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

export function buildSecurityCaseImportTemplateBuffer(
  options: SecurityCaseImportTemplateOptions = {},
): Buffer {
  const rows = [
    ...TEMPLATE_INLINE_HELP_ROWS,
    SECURITY_CASE_IMPORT_HEADERS as unknown as unknown[],
    ...TEMPLATE_ROWS,
  ];
  const helpRows = buildTemplateHelpRows(options);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="用例导入模板" sheetId="1" r:id="rId1"/>
    <sheet name="填写说明" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(buildSheetXml(rows)),
    'xl/worksheets/sheet2.xml': strToU8(buildSheetXml(helpRows)),
  };

  return Buffer.from(zipSync(files));
}

function buildTemplateHelpRows(options: SecurityCaseImportTemplateOptions): unknown[][] {
  return [
    ['用例导入填写说明'],
    ['当前用例库', options.libraryTitle || '当前下载模板对应的用例库'],
    ['默认攻击场景', options.libraryDomain || '当前用例库所属分类'],
    [],
    ['风险等级', '中文含义', '说明'],
    ...RISK_LEVEL_HELP_ROWS,
    [],
    ['测试方法', '系统类型', '说明'],
    ...TEST_METHOD_HELP_ROWS,
    [],
    ['攻击场景', '说明'],
    ...ATTACK_SCENE_HELP_ROWS,
    [],
    ['导入规则', '说明'],
    ['必填字段', '用例名称、测试方法、风险等级、prompt'],
    [
      '风险等级填写',
      '可填写 critical / high / medium / low，也可填写 严重 / 高 / 中 / 低 / 高风险 等中文值。',
    ],
    ['测试方法填写', '请使用 单轮对话测试 / 多轮对话测试 / 自定义；无法识别时会按 自定义 处理。'],
    ['攻击场景填写', '可填写上方场景，也可自定义；留空时导入后使用当前用例库所属分类。'],
  ];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getCellText(cell: Record<string, any>, sharedStrings: string[]): string {
  const type = cell['@_t'];
  if (type === 'inlineStr') {
    const inline = cell.is?.t;
    if (typeof inline === 'string' || typeof inline === 'number') {
      return String(inline);
    }
    if (inline && typeof inline === 'object' && '#text' in inline) {
      return String(inline['#text']);
    }
    return '';
  }
  const value = cell.v;
  if (value === undefined || value === null) {
    return '';
  }
  if (type === 's') {
    return sharedStrings[Number(value)] ?? '';
  }
  return String(value);
}

function parseSharedStrings(xml?: string): string[] {
  if (!xml) {
    return [];
  }
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: false });
  const doc = parser.parse(xml);
  return asArray(doc.sst?.si).map((item: any) => {
    if (typeof item.t === 'string' || typeof item.t === 'number') {
      return String(item.t);
    }
    if (item.t && typeof item.t === 'object' && '#text' in item.t) {
      return String(item.t['#text']);
    }
    if (Array.isArray(item.r)) {
      return item.r
        .map((part: any) => {
          if (typeof part.t === 'string' || typeof part.t === 'number') {
            return String(part.t);
          }
          if (part.t && typeof part.t === 'object' && '#text' in part.t) {
            return String(part.t['#text']);
          }
          return '';
        })
        .join('');
    }
    return '';
  });
}

function parseWorksheetRows(buffer: Buffer): string[][] {
  const zip = unzipSync(new Uint8Array(buffer));
  const sheetFile = zip['xl/worksheets/sheet1.xml'];
  if (!sheetFile) {
    throw new Error('Excel 文件中未找到第一个工作表');
  }
  const sharedStrings = parseSharedStrings(
    zip['xl/sharedStrings.xml'] ? strFromU8(zip['xl/sharedStrings.xml']) : undefined,
  );
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: false });
  const sheet = parser.parse(strFromU8(sheetFile));
  const rows = asArray(sheet.worksheet?.sheetData?.row);
  return rows.map((row: any) => {
    const cells = asArray(row.c);
    const values: string[] = [];
    for (const cell of cells) {
      const ref = String(cell['@_r'] || '');
      const colLetters = ref.match(/[A-Z]+/)?.[0] || '';
      const colIndex =
        colLetters.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      values[Math.max(colIndex, values.length)] = getCellText(cell, sharedStrings).trim();
    }
    return values.map((value) => value || '');
  });
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function findHeaderRowIndex(rows: string[][]): number {
  const requiredHeaders = ['用例名称', '测试方法', '风险等级', 'prompt'].map(normalizeHeader);
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return requiredHeaders.every((header) => normalized.includes(header));
  });
}

function normalizeRiskLevel(value: string): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    严重: 'critical',
    高: 'high',
    中: 'medium',
    低: 'low',
    严重风险: 'critical',
    高风险: 'high',
    中风险: 'medium',
    低风险: 'low',
  };
  if (RISK_LEVELS.has(normalized)) {
    return normalized as SecurityCaseImportRow['riskLevel'];
  }
  return map[value.trim()] || 'high';
}

export function resolveAttackTypeFromTestMethod(testMethod: string): string {
  return TEST_METHOD_TO_ATTACK_TYPE[testMethod.trim()] || 'custom';
}

export function parseSecurityCaseImportWorkbook(buffer: Buffer): SecurityCaseImportParseResult {
  const rows = parseWorksheetRows(buffer).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    return { rows: [], errors: ['Excel 至少需要包含表头和 1 行用例数据'] };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    return { rows: [], errors: ['缺少必要表头：用例名称、测试方法、风险等级、prompt'] };
  }

  const headerRow = rows[headerRowIndex].map(normalizeHeader);
  const headerIndex = new Map<string, number>();
  SECURITY_CASE_IMPORT_HEADERS.forEach((header) => {
    headerIndex.set(header, headerRow.indexOf(normalizeHeader(header)));
  });

  const requiredHeaders = ['用例名称', '测试方法', '风险等级', 'prompt'];
  const missingHeaders = requiredHeaders.filter((header) => (headerIndex.get(header) ?? -1) < 0);
  if (missingHeaders.length) {
    return { rows: [], errors: [`缺少必要表头：${missingHeaders.join('、')}`] };
  }

  const parsedRows: SecurityCaseImportRow[] = [];
  const errors: string[] = [];

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    const rowNumber = headerRowIndex + offset + 2;
    const value = (header: string) => {
      const index = headerIndex.get(header) ?? -1;
      return index >= 0 ? String(row[index] || '').trim() : '';
    };
    const name = value('用例名称');
    const prompt = value('prompt');
    const testMethod = value('测试方法') || '单轮对话测试';
    if (!name && !prompt) {
      return;
    }
    if (!name) {
      errors.push(`第 ${rowNumber} 行缺少用例名称`);
    }
    if (!prompt) {
      errors.push(`第 ${rowNumber} 行缺少 prompt`);
    }
    if (!name || !prompt) {
      return;
    }
    parsedRows.push({
      name,
      testMethod,
      attackScene: value('攻击场景') || undefined,
      riskLevel: normalizeRiskLevel(value('风险等级')),
      prompt,
      expectedPass: value('预期安全响应') || undefined,
      expectedFail: value('风险命中表现') || undefined,
    });
  });

  if (!parsedRows.length && !errors.length) {
    errors.push('未读取到可导入的用例数据');
  }

  return { rows: parsedRows, errors };
}
