export const TECHNICAL_DETECT_MODES = [
  '对话探测',
  '配置检查',
  '组件扫描',
  '运行时验证',
  '日志审计',
] as const;

export const TECHNICAL_SOURCE_TAGS = [
  '参考',
  'OWASP',
  'OWASP LLM Top 10',
  'OWASP ASI',
  'MITRE ATLAS',
  'NIST AI RMF',
  'CWE',
  'ISO/IEC 42001',
  '等保 2.0',
  '企业标准',
  '行业模板',
  '红队样本',
] as const;

export const TECHNICAL_SOURCE_TAG_DESCRIPTIONS: Record<
  (typeof TECHNICAL_SOURCE_TAGS)[number],
  string
> = {
  参考: '临时或补充来源，适合尚未归入正式标准的依据',
  OWASP: '开放 Web 应用安全项目的通用安全参考',
  'OWASP LLM Top 10': '面向大模型应用的十大常见安全风险',
  'OWASP ASI': '面向智能体系统的安全风险分类与测试参考',
  'MITRE ATLAS': 'AI 系统攻击技术、战术与案例知识库',
  'NIST AI RMF': 'NIST 人工智能风险管理框架',
  CWE: '通用软件缺陷与弱点分类',
  'ISO/IEC 42001': '人工智能管理体系标准',
  '等保 2.0': '国内网络安全等级保护合规要求',
  企业标准: '企业内部安全基线、红线或验收标准',
  行业模板: '金融、政务等行业场景的通用检测模板',
  红队样本: '来自攻防演练、渗透测试或实战复盘的样本',
};

export const TECHNICAL_BASIS_PRESETS = [
  'OWASP ASI01 目标劫持 / Prompt Injection',
  'OWASP ASI02 敏感信息泄露',
  'OWASP ASI07 系统 Prompt 泄露',
  'OWASP ASI09 过度依赖与错误输出',
  'OWASP ASI10 无界消耗',
  'OWASP LLM Top 10 · Prompt Injection',
  'OWASP LLM Top 10 · Sensitive Information Disclosure',
  '企业内部智能体安全基线',
  '行业合规检测要求（金融 / 政务）',
  '红队攻击样本库',
] as const;

export const TECHNICAL_SCOPE_PRESETS = [
  '全部 Agent',
  '对外 Agent',
  '涉敏 Agent',
  '生产 Agent',
] as const;

export const TECHNICAL_LIBRARY_ICONS = [
  { value: '⚠', label: '⚠ 警告' },
  { value: '⌁', label: '⌁ 注入' },
  { value: '🔐', label: '🔐 泄露' },
  { value: '📤', label: '📤 输出' },
  { value: '📋', label: '📋 提示' },
  { value: '∞', label: '∞ 资源' },
  { value: '⛓', label: '⛓ 越狱' },
  { value: '🛡', label: '🛡 防护' },
  { value: '↗', label: '↗ 外泄' },
  { value: '📦', label: '📦 供应链' },
  { value: '⚡', label: '⚡ 代理' },
  { value: '🔑', label: '🔑 权限' },
  { value: '◆', label: '◆ Skill' },
  { value: '📚', label: '📚 知识库' },
  { value: '☣', label: '☣ 投毒' },
  { value: '🔒', label: '🔒 越权' },
  { value: '⟳', label: '⟳ 工作流' },
] as const;
