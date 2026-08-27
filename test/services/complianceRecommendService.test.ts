import {
  deriveComplianceCapabilitySignals,
  pickComplianceLibrariesByScore,
  scoreComplianceLibraryForPortrait,
} from '../../backend/src/services/complianceRecommendSignals';
import { buildComplianceRulesPlan } from '../../backend/src/services/complianceRecommendService';

describe('complianceRecommendSignals', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const financeAsset = {
    functionIntro: '企业员工报销审批助手，支持费用单提交与支付状态查询',
    businessScene: '财务报销',
    businessSystem: '费控系统',
    tags: ['审批', '金融'],
    sensitiveData: true,
    exposureLevel: 'internal',
  };

  const plainAsset = {
    functionIntro: '内部办公问答助手',
    businessScene: '办公',
    tags: [] as string[],
    sensitiveData: false,
    exposureLevel: 'internal',
  };

  const sampleLibs = [
    {
      id: 'lib-general',
      title: '通用合规基线',
      domain: '通用合规',
      description: '通用合规控制项',
      caseCount: 20,
    },
    {
      id: 'lib-finance',
      title: '金融合规控制库',
      domain: '金融合规',
      description: '金融业务与支付审批合规检测',
      caseCount: 18,
    },
    {
      id: 'lib-gov',
      title: '政务合规控制库',
      domain: '政务/国企',
      description: '政务数据与审计合规',
      caseCount: 12,
    },
    {
      id: 'lib-pii',
      title: '个人信息保护库',
      domain: '个人信息',
      description: '个人信息与隐私保护',
      caseCount: 15,
    },
  ];

  it('derives finance and pii signals from functionIntro', () => {
    expect(deriveComplianceCapabilitySignals(financeAsset)).toEqual({
      isFinance: true,
      isGov: false,
      handlesPii: true,
      handlesDataSecurity: true,
      isCustomerFacing: false,
      isIndustrySpecific: false,
    });
  });

  it('boosts finance libraries for报销审批 portrait', () => {
    const signals = deriveComplianceCapabilitySignals(financeAsset);
    const portraitText = [
      financeAsset.functionIntro,
      financeAsset.businessScene,
      ...(financeAsset.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    const financeScore = scoreComplianceLibraryForPortrait(
      sampleLibs[1],
      signals,
      portraitText,
      '金融合规',
    );
    const govScore = scoreComplianceLibraryForPortrait(
      sampleLibs[2],
      signals,
      portraitText,
      '金融合规',
    );

    expect(financeScore.excluded).toBe(false);
    expect(financeScore.reasonHints.some((h) => /金融/.test(h))).toBe(true);
    expect(govScore.excluded).toBe(true);
    expect(financeScore.score).toBeGreaterThan(0);
  });

  it('excludes finance libraries without finance evidence', () => {
    const signals = deriveComplianceCapabilitySignals(plainAsset);
    const score = scoreComplianceLibraryForPortrait(
      sampleLibs[1],
      signals,
      plainAsset.functionIntro!.toLowerCase(),
      '通用合规',
    );
    expect(score).toEqual({
      score: -100,
      excluded: true,
      excludeReason: '画像无金融场景证据，排除金融合规库',
      reasonHints: [],
    });
  });

  it('pickComplianceLibrariesByScore anchors recommended domain', () => {
    const signals = deriveComplianceCapabilitySignals(plainAsset);
    const { include } = pickComplianceLibrariesByScore({
      libraries: sampleLibs,
      signals,
      portraitText: '',
      recommendedDomain: '通用合规',
    });

    expect(include.some((p) => p.lib.domain === '通用合规')).toBe(true);
    expect(include.some((p) => p.lib.id === 'lib-finance')).toBe(false);
    expect(include.some((p) => p.lib.id === 'lib-gov')).toBe(false);
  });
});

describe('buildComplianceRulesPlan (function-aware)', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const libraries = [
    {
      id: 'lib-general',
      title: '通用合规基线',
      domain: '通用合规',
      description: '通用合规控制项',
      caseCount: 20,
      enabled: true,
      status: 'published',
    },
    {
      id: 'lib-finance',
      title: '金融合规控制库',
      domain: '金融合规',
      description: '金融业务与支付审批合规检测',
      caseCount: 18,
      enabled: true,
      status: 'published',
    },
    {
      id: 'lib-gov',
      title: '政务合规控制库',
      domain: '政务/国企',
      description: '政务数据与审计合规',
      caseCount: 12,
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

    const plan = buildComplianceRulesPlan({
      asset,
      libraries,
      recommendedDomain: '金融合规',
    });
    const includeIds = plan.include.map((i) => i.libraryId);

    expect(includeIds).toContain('lib-finance');
    expect(includeIds).not.toContain('lib-gov');

    const financeItem = plan.include.find((i) => i.libraryId === 'lib-finance');
    expect(financeItem?.reason).toMatch(/金融|功能|匹配推荐域/);
    expect(plan.rationaleSummary).toMatch(/功能介绍/);
  });

  it('excludes finance and gov for plain office assistant', () => {
    const asset = {
      id: 'a2',
      name: '办公助手',
      agentType: 'http',
      platformFamily: 'custom',
      functionIntro: '内部办公问答',
      businessScene: '办公',
      sensitiveData: false,
      exposureLevel: 'internal',
      environment: 'dev',
      components: [],
    };

    const plan = buildComplianceRulesPlan({
      asset,
      libraries,
      recommendedDomain: '通用合规',
    });
    const includeIds = plan.include.map((i) => i.libraryId);
    const excludeIds = plan.exclude.map((i) => i.libraryId);

    expect(includeIds).toContain('lib-general');
    expect(includeIds).not.toContain('lib-finance');
    expect(includeIds).not.toContain('lib-gov');
    expect(excludeIds).toContain('lib-finance');
    expect(excludeIds).toContain('lib-gov');
  });

  it('still returns baseline plan for minimal portrait', () => {
    const asset = {
      id: 'a3',
      name: '未完善',
      agentType: 'http',
      platformFamily: 'custom',
      functionIntro: '',
      businessScene: '',
      sensitiveData: false,
      exposureLevel: '',
      components: [],
    };

    const plan = buildComplianceRulesPlan({
      asset,
      libraries,
      recommendedDomain: '通用合规',
    });

    expect(plan.source).toBe('rules');
    expect(plan.include.length).toBeGreaterThan(0);
    expect(plan.missingPortraitFields).toEqual(
      expect.arrayContaining(['functionIntro', 'businessScene', 'components', 'exposureLevel']),
    );
  });
});
