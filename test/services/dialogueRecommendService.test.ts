import {
  deriveCapabilitySignals,
  isToolOrientedLibrary,
  pickLibrariesByScore,
  scoreLibraryForPortrait,
} from '../../backend/src/services/dialogueRecommendSignals';
import { buildRulesPlan } from '../../backend/src/services/dialogueRecommendService';

describe('dialogueRecommendSignals', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const financeAsset = {
    functionIntro: '企业员工报销审批助手，支持费用单提交、审批流转与支付状态查询',
    businessScene: '财务报销',
    businessSystem: '费控系统',
    tags: ['审批', '报销'],
    sensitiveData: true,
    components: [{ componentType: 'tool', componentName: '支付查询', enabled: true }],
  };

  const plainChatAsset = {
    functionIntro: '通用闲聊问答机器人',
    businessScene: '内部助手',
    components: [] as Array<{ componentType: string; componentName: string }>,
  };

  const sampleLibs = [
    {
      id: 'lib-baseline-attack',
      libraryKey: 'dev-instruction-leak',
      title: '开发者指令泄露',
      domain: '基础攻击',
      description: '诱导泄露 developer message',
      caseCount: 10,
    },
    {
      id: 'lib-baseline-session',
      libraryKey: 'sa-prompt-injection',
      title: 'Prompt Injection',
      domain: '会话对抗',
      description: '提示词注入',
      caseCount: 12,
    },
    {
      id: 'lib-tool',
      libraryKey: 'tool-call-rule-leak',
      title: '工具调用规则泄露',
      domain: '基础攻击',
      description: '诱导泄露 tool call policy、函数调用白名单',
      caseCount: 8,
      scope: '启用工具的 Agent',
    },
    {
      id: 'lib-tool-abuse',
      libraryKey: 'tool-abuse',
      title: '工具调用滥用诱导',
      domain: '会话对抗',
      description: '诱导 Agent 滥用已授权工具：越权调用、批量导出',
      caseCount: 6,
    },
    {
      id: 'lib-finance',
      libraryKey: 'finance-approval',
      title: '报销审批越权',
      domain: '企业自定义',
      description: '针对报销审批与支付额度越权绕过的检测',
      caseCount: 15,
    },
    {
      id: 'lib-rag',
      libraryKey: 'rag-leak',
      title: '知识库越权检索',
      domain: '知识库',
      description: 'RAG 知识库越权',
      caseCount: 9,
    },
    {
      id: 'lib-harm',
      libraryKey: 'mo-harmful-content',
      title: '有害内容生成',
      domain: '企业自定义',
      description: '是否生成违法危险内容',
      caseCount: 20,
    },
  ];

  it('derives finance and tool signals from functionIntro', () => {
    expect(deriveCapabilitySignals(financeAsset)).toEqual({
      hasRag: false,
      hasTools: true,
      handlesFinance: true,
      handlesPii: true,
      isCustomerService: false,
      isCodeAssistant: false,
      isContentGen: false,
      isDataQuery: true,
    });
  });

  it('boosts finance libraries for报销审批 portrait', () => {
    const signals = deriveCapabilitySignals(financeAsset);
    const portraitText = [
      financeAsset.functionIntro,
      financeAsset.businessScene,
      ...(financeAsset.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    const financeScore = scoreLibraryForPortrait(sampleLibs[4], signals, portraitText);
    const harmScore = scoreLibraryForPortrait(sampleLibs[6], signals, portraitText);

    expect(financeScore.excluded).toBe(false);
    expect(financeScore.reasonHints.some((h) => /金融|报销|审批/.test(h))).toBe(true);
    expect(financeScore.score).toBeGreaterThan(harmScore.score);
  });

  it('excludes tool libraries when portrait has no tools', () => {
    const signals = deriveCapabilitySignals(plainChatAsset);
    expect(signals.hasTools).toBe(false);
    expect(isToolOrientedLibrary(sampleLibs[2])).toBe(true);

    const toolScore = scoreLibraryForPortrait(
      sampleLibs[2],
      signals,
      plainChatAsset.functionIntro!.toLowerCase(),
    );
    expect(toolScore).toEqual({
      score: -100,
      excluded: true,
      excludeReason: '画像无 tool/mcp 挂载，排除工具向用例库',
      reasonHints: [],
    });
  });

  it('excludes knowledge domain without RAG signal', () => {
    const signals = deriveCapabilitySignals(plainChatAsset);
    const ragScore = scoreLibraryForPortrait(
      sampleLibs[5],
      signals,
      plainChatAsset.functionIntro!.toLowerCase(),
    );
    expect(ragScore).toEqual({
      score: -100,
      excluded: true,
      excludeReason: '画像无知识库/RAG 信号，排除知识库域',
      reasonHints: [],
    });
  });

  it('pickLibrariesByScore keeps baseline domains for minimal portrait', () => {
    const minimal = { functionIntro: '', businessScene: '', components: [] };
    const signals = deriveCapabilitySignals(minimal);
    const { include } = pickLibrariesByScore({
      libraries: sampleLibs,
      signals,
      portraitText: '',
      assessScenario: 'launch',
    });

    const domains = new Set(include.map((p) => p.lib.domain));
    expect(domains.has('基础攻击')).toBe(true);
    expect(domains.has('会话对抗')).toBe(true);
    expect(include.some((p) => p.lib.id === 'lib-rag')).toBe(false);
    expect(include.some((p) => isToolOrientedLibrary(p.lib))).toBe(false);
  });

  it('pickLibrariesByScore expands patrol recommendations for new technical library taxonomy', () => {
    const patrolAsset = {
      functionIntro: '面向客户的知识库问答与报销审批助手，可调用 MCP 工具查询账单',
      businessScene: '客户服务与财务审批',
      sensitiveData: true,
      components: [
        { componentType: 'knowledge_base', componentName: '政策知识库', enabled: true },
        { componentType: 'mcp', componentName: '账单查询 MCP', enabled: true },
      ],
    };
    const signals = deriveCapabilitySignals(patrolAsset);
    const { include } = pickLibrariesByScore({
      libraries: sampleLibs,
      signals,
      portraitText: [patrolAsset.functionIntro, patrolAsset.businessScene].join(' ').toLowerCase(),
      assessScenario: 'patrol',
    });
    const includeIds = include.map((p) => p.lib.id);

    expect(includeIds).toContain('lib-baseline-attack');
    expect(includeIds).toContain('lib-baseline-session');
    expect(includeIds).toContain('lib-finance');
    expect(includeIds).toContain('lib-rag');
    expect(includeIds).toContain('lib-tool-abuse');
  });
});

describe('buildRulesPlan (function-aware)', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const libraries = [
    {
      id: 'lib-baseline-attack',
      libraryKey: 'dev-instruction-leak',
      title: '开发者指令泄露',
      domain: '基础攻击',
      description: '诱导泄露 developer message',
      caseCount: 10,
      enabled: true,
      status: 'published',
    },
    {
      id: 'lib-baseline-session',
      libraryKey: 'sa-prompt-injection',
      title: 'Prompt Injection',
      domain: '会话对抗',
      description: '提示词注入',
      caseCount: 12,
      enabled: true,
      status: 'published',
    },
    {
      id: 'lib-tool',
      libraryKey: 'tool-call-rule-leak',
      title: '工具调用规则泄露',
      domain: '基础攻击',
      description: '诱导泄露 tool call policy',
      caseCount: 8,
      enabled: true,
      status: 'published',
      metadata: { scope: '启用工具的 Agent' },
    },
    {
      id: 'lib-finance',
      libraryKey: 'finance-approval',
      title: '报销审批越权',
      domain: '企业自定义',
      description: '针对报销审批与支付额度越权绕过的检测',
      caseCount: 15,
      enabled: true,
      status: 'published',
    },
    {
      id: 'lib-rag',
      libraryKey: 'rag-leak',
      title: '知识库越权检索',
      domain: '知识库',
      description: 'RAG 知识库越权',
      caseCount: 9,
      enabled: true,
      status: 'published',
    },
  ];

  it('includes finance-weighted libraries and mentions function in reason', () => {
    const asset = {
      id: 'a1',
      name: '报销助手',
      agentType: 'http',
      platformFamily: 'custom',
      functionIntro: '企业员工报销审批助手，支持费用单提交与审批流转',
      businessScene: '财务报销',
      sensitiveData: true,
      exposureLevel: 'internal',
      environment: 'prod',
      components: [{ componentType: 'tool', componentName: '审批工具', enabled: true }],
    };

    const plan = buildRulesPlan(asset, libraries, 'launch');
    const includeIds = plan.include.map((i) => i.libraryId);

    expect(includeIds).toContain('lib-finance');
    expect(includeIds).toContain('lib-baseline-attack');
    expect(includeIds).toContain('lib-baseline-session');
    expect(includeIds).not.toContain('lib-rag');

    const financeItem = plan.include.find((i) => i.libraryId === 'lib-finance');
    expect(financeItem?.reason).toMatch(/金融|报销|审批|功能/);
    expect(plan.rationaleSummary).toMatch(/功能介绍/);
  });

  it('excludes tool and rag libraries for plain chat without capabilities', () => {
    const asset = {
      id: 'a2',
      name: '闲聊',
      agentType: 'http',
      platformFamily: 'custom',
      functionIntro: '通用闲聊',
      businessScene: '内部助手',
      sensitiveData: false,
      exposureLevel: 'internal',
      environment: 'dev',
      components: [],
    };

    const plan = buildRulesPlan(asset, libraries, 'launch');
    const includeIds = plan.include.map((i) => i.libraryId);
    const excludeIds = plan.exclude.map((i) => i.libraryId);

    expect(includeIds).toContain('lib-baseline-attack');
    expect(includeIds).toContain('lib-baseline-session');
    expect(includeIds).not.toContain('lib-tool');
    expect(includeIds).not.toContain('lib-rag');
    expect(excludeIds).toContain('lib-tool');
    expect(excludeIds).toContain('lib-rag');

    const toolExclude = plan.exclude.find((i) => i.libraryId === 'lib-tool');
    expect(toolExclude?.reason).toMatch(/tool|mcp|工具/i);
  });
});
