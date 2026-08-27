/**
 * Vulnerabilities Management Page
 * Redesigned with card grid layout and category navigation
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import {
  Plus,
  Search as SearchIcon,
  Filter,
  RefreshCw,
  Bot,
  Brain,
  GitBranch,
  Plug,
  Layers,
  Workflow,
  MessagesSquare,
  Sparkles,
  Network,
  Library,
  Scale,
  Landmark,
} from 'lucide-react';
import { CreateVulnerabilityDialog } from './components/create-vulnerability-dialog';
import { Pagination } from '@/components/ui/pagination';

// 分类配置
const CATEGORIES = {
  agent: {
    name: 'AI Agent Vulnerabilities',
    icon: Bot,
    subcategories: [
      'Prompt Injection',
      'Jailbreak Attacks',
      'Tool Function Abuse',
      'Data Leakage',
      'Context Manipulation',
      'Authentication Bypass',
      'Misconfiguration',
      'Business Logic Flaws',
    ],
  },
  model: {
    name: 'LLM Model Vulnerabilities',
    icon: Brain,
    subcategories: [
      'Training Data Poisoning',
      'Model Extraction',
      'Inference Attacks',
      'Adversarial Examples',
      'Membership Inference',
      'Property Inference',
      'Backdoor Attacks',
      'Transfer Learning Attacks',
    ],
  },
  mcp: {
    name: 'MCP Protocol Vulnerabilities',
    icon: GitBranch,
    subcategories: [
      'Protocol Vulnerabilities',
      'Authentication Flaws',
      'Serialization Issues',
      'Resource Management',
      'State Management',
      'Message Validation',
      'Transport Security',
      'Implementation Bugs',
    ],
  },
  tool: {
    name: 'Tool Plugin Vulnerabilities',
    icon: Plug,
    subcategories: [
      'Sandbox Escape',
      'API Abuse',
      'Permission Escalation',
      'Input Validation',
      'Memory Safety',
      'Dependency Vulnerabilities',
      'Integration Flaws',
      'Resource Exhaustion',
    ],
  },
  platform: {
    name: 'Dev Platform Vulnerabilities',
    icon: Layers,
    subcategories: [
      'Access Control',
      'Code/Config Injection',
      'Data Security',
      'API Security',
      'Deployment Flaws',
      'Monitoring Bypass',
      'Workflow Vulnerabilities',
      'Orchestration Issues',
    ],
  },
  dify: {
    name: 'Dify Vulnerabilities',
    icon: Workflow,
    subcategories: ['Dify API', 'Dify Config'],
  },
  coze: {
    name: 'Coze Vulnerabilities',
    icon: MessagesSquare,
    subcategories: ['Coze API', 'Coze Config'],
  },
  fastgpt: {
    name: 'FastGPT Vulnerabilities',
    icon: Sparkles,
    subcategories: ['FastGPT API', 'FastGPT Config'],
  },
  n8n: {
    name: 'N8N Vulnerabilities',
    icon: Network,
    subcategories: ['N8N API', 'N8N Config'],
  },
  /** 与 docs/national-law-vulnerabilities-100.sql 中 avd_id 前缀 AVD-GBAI-LAW-20260212- 对齐；子类为四部法规全称（与生成脚本一致） */
  nationalLaw: {
    name: 'National Laws & Standards (GBAI)',
    icon: Scale,
    subcategories: [
      '《中华人民共和国个人信息保护法》',
      '《中华人民共和国数据安全法》',
      '《网络数据安全管理条例》',
      '《银行保险机构数据安全管理办法》',
    ],
  },
  /** 与 docs/三类漏洞 批量脚本 avd_id 前缀 AVD-FIN-COMP-20260213- 对齐；子类为六条标准/办法全称 */
  financeCompliance: {
    name: 'Financial Industry Compliance',
    icon: Landmark,
    subcategories: [
      'JR/T 0197-2020《金融数据安全 数据安全分级指南》',
      'JR/T 0223-2021《金融数据安全 数据生命周期安全规范》',
      'GB/T 22239-2019《信息安全技术 网络安全等级保护基本要求》',
      '《生成式人工智能服务管理暂行办法》',
      '《人工智能安全治理框架》1.0',
      '《银行保险机构消费者权益保护管理办法》',
    ],
  },
  /** 演示用：与 docs/historical-accumulation-vulnerabilities-seed.sql 中 avd_id 前缀 AVD-HIST-20260512- 对齐 */
  historical: {
    name: 'Historical Accumulation',
    icon: Library,
    subcategories: ['建行', '工商银行', '招商银行无锡分行', '招商银行上海分行', '国铁集团'],
  },
} as const;

/** 与导入 SQL / 侧栏筛选一致，用于统计与列表默认 search */
const HISTORICAL_AVD_SEARCH = 'AVD-HIST-20260512';
const NATIONAL_LAW_AVD_SEARCH = 'AVD-GBAI-LAW-20260212';
const FINANCE_COMPLIANCE_AVD_SEARCH = 'AVD-FIN-COMP-20260213';

/** 专题库卡片：按 avd_id 前缀识别（与侧栏三类一致） */
function topicLibraryShortLabel(
  avdId: string | undefined,
  tr: (en: string, zh: string) => string,
): string | null {
  if (!avdId) return null;
  if (avdId.includes(HISTORICAL_AVD_SEARCH)) return tr('Historical', '历史积累');
  if (avdId.includes(NATIONAL_LAW_AVD_SEARCH)) return tr('National laws', '国家法规');
  if (avdId.includes(FINANCE_COMPLIANCE_AVD_SEARCH)) return tr('Finance compliance', '金融合规');
  return null;
}

type CategoryKey = keyof typeof CATEGORIES;

/** 统计卡片：用列表接口返回的 `total`，避免只拉一页数据导致大批量导入后其它类型显示为 0 */
const EMPTY_VULN_STATS: Record<
  | 'agent'
  | 'model'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'dify'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'historical'
  | 'nationalLaw'
  | 'financeCompliance',
  number
> = {
  agent: 0,
  model: 0,
  mcp: 0,
  tool: 0,
  platform: 0,
  dify: 0,
  coze: 0,
  fastgpt: 0,
  n8n: 0,
  historical: 0,
  nationalLaw: 0,
  financeCompliance: 0,
};

export function Vulnerabilities() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [searchTerm, setSearchTerm] = useState('');
  // 默认显示所有类型，让用户能看到数据
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | 'all'>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12); // 每页显示12个卡片（3列x4行）

  // 将前端分类键映射到数据库类型值
  const getTypeFromCategory = (category: CategoryKey | 'all'): string | undefined => {
    if (category === 'all') return undefined;
    if (category === 'historical') return undefined;
    if (category === 'nationalLaw') return undefined;
    if (category === 'financeCompliance') return undefined;
    if (category === 'model') return 'llm';
    return category;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'vulnerabilities',
      searchTerm,
      selectedCategory,
      selectedSubcategory,
      selectedRiskLevel,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      try {
        const isHistorical = selectedCategory === 'historical';
        const isNationalLaw = selectedCategory === 'nationalLaw';
        const isFinanceCompliance = selectedCategory === 'financeCompliance';
        const listSearch = isHistorical
          ? searchTerm.trim() || HISTORICAL_AVD_SEARCH
          : isNationalLaw
            ? searchTerm.trim() || NATIONAL_LAW_AVD_SEARCH
            : isFinanceCompliance
              ? searchTerm.trim() || FINANCE_COMPLIANCE_AVD_SEARCH
              : searchTerm || undefined;
        const skipTypeAndCategoryFilter = isHistorical || isNationalLaw || isFinanceCompliance;
        const sub = selectedSubcategory?.trim() || '';
        const result = await vulnerabilitiesApi.list({
          search: listSearch,
          type: (skipTypeAndCategoryFilter
            ? undefined
            : getTypeFromCategory(selectedCategory)) as
            | 'agent'
            | 'mcp'
            | 'llm'
            | 'tool'
            | 'platform'
            | 'dify'
            | 'coze'
            | 'fastgpt'
            | 'n8n'
            | undefined,
          /** 子分类统一走 vulnerabilities.category（历史/法规/金融 与 Dify 子类相同） */
          category: sub || undefined,
          riskLevel:
            selectedRiskLevel !== 'all'
              ? (selectedRiskLevel as 'critical' | 'high' | 'medium' | 'low')
              : undefined,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        });
        console.log('[Vulnerabilities] API response:', {
          result,
          selectedCategory,
          dataLength: result?.data?.length,
          total: result?.total,
          hasData: !!result?.data,
        });
        return result;
      } catch (err) {
        console.error('[Vulnerabilities] API error:', err);
        throw err;
      }
    },
    retry: 1,
  });

  const vulnerabilities = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize) || 1;

  // 根据分类和子分类过滤漏洞（前端过滤作为备用，API已经按type和category过滤了）
  const filteredVulnerabilities = useMemo(() => {
    let filtered = vulnerabilities;

    // 如果选择了子分类，在前端也进行过滤（作为双重保障）
    // 注意：只有当selectedSubcategory有值时才过滤，空字符串表示显示该分类下的所有漏洞
    if (selectedSubcategory?.trim()) {
      const sub = selectedSubcategory.trim();
      filtered = filtered.filter((v) => (v.category || '').trim() === sub);
    }

    return filtered;
  }, [vulnerabilities, selectedSubcategory]);

  // 调试信息
  useEffect(() => {
    console.log('[Vulnerabilities] Page state:', {
      isLoading,
      error: error ? (error instanceof Error ? error.message : String(error)) : null,
      rawData: data,
      vulnerabilitiesCount: vulnerabilities.length,
      total,
      selectedCategory,
      selectedSubcategory,
      filteredCount: filteredVulnerabilities.length,
      firstVuln: vulnerabilities[0],
    });
  }, [
    isLoading,
    error,
    data,
    vulnerabilities.length,
    total,
    selectedCategory,
    selectedSubcategory,
    filteredVulnerabilities.length,
  ]);

  // 当分类改变时，重置到第一页
  const handleCategoryChange = (category: CategoryKey | 'all') => {
    setSelectedCategory(category);
    // 不自动设置子分类，让用户可以选择"全部"或具体子分类
    setSelectedSubcategory('');
    setCurrentPage(1);
  };

  // 当搜索或过滤条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRiskLevel, selectedSubcategory]);

  // 统计面板：按 type / 专题 search 各查一次 total（limit=1 即可），与全库真实条数一致
  const { data: statsTotals } = useQuery({
    queryKey: ['vulnerabilities-stats-totals'],
    queryFn: async () => {
      const types = [
        'agent',
        'llm',
        'mcp',
        'tool',
        'platform',
        'dify',
        'coze',
        'fastgpt',
        'n8n',
      ] as const;
      const [typeResults, hist, nat, fin] = await Promise.all([
        Promise.all(types.map((type) => vulnerabilitiesApi.list({ type, limit: 1, offset: 0 }))),
        vulnerabilitiesApi.list({ search: HISTORICAL_AVD_SEARCH, limit: 1, offset: 0 }),
        vulnerabilitiesApi.list({ search: NATIONAL_LAW_AVD_SEARCH, limit: 1, offset: 0 }),
        vulnerabilitiesApi.list({ search: FINANCE_COMPLIANCE_AVD_SEARCH, limit: 1, offset: 0 }),
      ]);
      return {
        agent: typeResults[0].total,
        model: typeResults[1].total,
        mcp: typeResults[2].total,
        tool: typeResults[3].total,
        platform: typeResults[4].total,
        dify: typeResults[5].total,
        coze: typeResults[6].total,
        fastgpt: typeResults[7].total,
        n8n: typeResults[8].total,
        historical: hist.total,
        nationalLaw: nat.total,
        financeCompliance: fin.total,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = { ...EMPTY_VULN_STATS, ...(statsTotals ?? {}) };

  // 获取CVSS分数（如果有，否则根据riskLevel映射）
  const getCVSSScore = (vuln: (typeof vulnerabilities)[0]) => {
    const raw = vuln.cvssScore as number | string | null | undefined;
    if (raw !== undefined && raw !== null && raw !== '') {
      const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      if (Number.isFinite(n)) {
        return n;
      }
    }
    // 根据风险等级映射默认CVSS分数
    const scoreMap: Record<string, number> = {
      critical: 9.8,
      high: 8.2,
      medium: 6.5,
      low: 3.2,
    };
    return scoreMap[vuln.riskLevel] || 5.0;
  };

  // 获取CVSS分数颜色
  const getCVSSColor = (score: number) => {
    if (score >= 9.0) return 'bg-red-500 text-white';
    if (score >= 7.0) return 'bg-orange-500 text-white';
    if (score >= 4.0) return 'bg-yellow-500 text-white';
    return 'bg-gray-400 text-white';
  };

  // 获取类型标签颜色
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      agent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      llm: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      model: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      mcp: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      tool: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      platform: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      dify: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
      coze: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100',
      fastgpt: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
      n8n: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100',
    };
    return colorMap[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  // 处理分页变化
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // 重置到第一页
  };

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        {/* 页面标题 */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {tr('AI Security Vulnerabilities', 'AI 安全漏洞')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {tr(
                'Comprehensive vulnerability database for AI systems and components',
                '面向 AI 系统与组件的综合漏洞库',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              {tr('Sync CVE Database', '同步 CVE 数据库')}
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {tr('Add Vulnerability', '新增漏洞')}
            </Button>
          </div>
        </div>

        {/* 统计面板：8 类 type + 3 类专题库（avd_id 前缀） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.agent}</div>
              <div className="text-sm text-muted-foreground">
                {tr('AI Agent Vulns', 'AI Agent 漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.model}</div>
              <div className="text-sm text-muted-foreground">
                {tr('LLM Model Vulns', 'LLM 模型漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.mcp}</div>
              <div className="text-sm text-muted-foreground">
                {tr('MCP Protocol Vulns', 'MCP 协议漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.tool}</div>
              <div className="text-sm text-muted-foreground">
                {tr('Tool Plugin Vulns', '工具插件漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.platform}</div>
              <div className="text-sm text-muted-foreground">
                {tr('Platform Vulns', '平台漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.dify}</div>
              <div className="text-sm text-muted-foreground">{tr('Dify Vulns', 'Dify 漏洞')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.coze}</div>
              <div className="text-sm text-muted-foreground">{tr('Coze Vulns', 'Coze 漏洞')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.fastgpt}</div>
              <div className="text-sm text-muted-foreground">
                {tr('FastGPT Vulns', 'FastGPT 漏洞')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.n8n}</div>
              <div className="text-sm text-muted-foreground">{tr('N8N Vulns', 'N8N 漏洞')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.historical}</div>
              <div className="text-sm text-muted-foreground">
                {tr('Historical Accumulation', '历史积累')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.nationalLaw}</div>
              <div className="text-sm text-muted-foreground">
                {tr('National Laws & Standards', '国家法规')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{stats.financeCompliance}</div>
              <div className="text-sm text-muted-foreground">
                {tr('Financial Industry Compliance', '金融行业合规')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 过滤栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[250px]">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tr('Search vulnerabilities...', '搜索漏洞...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedRiskLevel} onValueChange={setSelectedRiskLevel}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={tr('All Severity', '全部严重级别')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('All Severity', '全部严重级别')}</SelectItem>
              <SelectItem value="critical">{tr('Critical (9.0-10.0)', '严重 (9.0-10.0)')}</SelectItem>
              <SelectItem value="high">{tr('High (7.0-8.9)', '高危 (7.0-8.9)')}</SelectItem>
              <SelectItem value="medium">{tr('Medium (4.0-6.9)', '中危 (4.0-6.9)')}</SelectItem>
              <SelectItem value="low">{tr('Low (0.1-3.9)', '低危 (0.1-3.9)')}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" placeholder={tr('From date', '开始日期')} />
          <Input type="date" className="w-40" placeholder={tr('To date', '结束日期')} />
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            {tr('Filter', '筛选')}
          </Button>
        </div>

        {/* 主要内容区域 */}
        <div className="flex gap-6 h-[calc(100vh-500px)] min-h-[600px]">
          {/* 左侧分类导航 */}
          <div className="w-72 shrink-0 space-y-4 overflow-y-auto">
            {/* 主分类 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr('Categories', '分类')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  onClick={() => handleCategoryChange('all')}
                  className={`px-4 py-3 cursor-pointer border-b hover:bg-accent transition-colors ${
                    selectedCategory === 'all' ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <span className="text-sm">{tr('All Vulnerabilities', '全部漏洞')}</span>
                </div>
                {Object.entries(CATEGORIES).map(([key, category]) => {
                  const IconComponent = category.icon;
                  return (
                    <div
                      key={key}
                      onClick={() => handleCategoryChange(key as CategoryKey)}
                      className={`px-4 py-3 cursor-pointer border-b last:border-b-0 hover:bg-accent transition-colors ${
                        selectedCategory === key ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      <IconComponent className="mr-2 h-4 w-4 inline" />
                      {key === 'historical'
                        ? tr('Historical Accumulation', '历史积累')
                        : key === 'nationalLaw'
                          ? tr('National Laws & Standards', '国家法规')
                          : key === 'financeCompliance'
                            ? tr('Financial Industry Compliance', '金融行业合规')
                            : isZh
                            ? category.name
                                .replace('Vulnerabilities', '漏洞')
                                .replace('AI Agent', 'AI Agent')
                                .replace('LLM Model', 'LLM 模型')
                                .replace('MCP Protocol', 'MCP 协议')
                                .replace('Tool Plugin', '工具插件')
                                .replace('Dev Platform', '开发平台')
                            : category.name}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* 子分类（有子项的主类才展示卡片） */}
            {selectedCategory !== 'all' && CATEGORIES[selectedCategory].subcategories.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{tr('Subcategories', '子分类')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div
                    onClick={() => setSelectedSubcategory('')}
                    className={`px-4 py-2 cursor-pointer hover:bg-accent transition-colors ${
                      selectedSubcategory?.trim() ? '' : 'bg-accent font-medium'
                    }`}
                  >
                    {tr('All', '全部')}
                  </div>
                  {CATEGORIES[selectedCategory].subcategories.map((subcat) => (
                    <div
                      key={subcat}
                      onClick={() => setSelectedSubcategory(subcat)}
                      className={`px-4 py-2 cursor-pointer hover:bg-accent transition-colors ${
                        selectedSubcategory === subcat ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      {subcat}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧漏洞卡片网格 */}
          <div className="flex-1 overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              {selectedCategory === 'all'
                ? tr('All Vulnerabilities', '全部漏洞')
                : selectedCategory === 'historical'
                  ? tr('Historical Accumulation', '历史积累')
                : selectedCategory === 'nationalLaw'
                  ? tr('National Laws & Standards', '国家法规')
                  : selectedCategory === 'financeCompliance'
                    ? tr('Financial Industry Compliance', '金融行业合规')
                    : CATEGORIES[selectedCategory].name}
              {selectedSubcategory?.trim() && selectedCategory !== 'all' && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({selectedSubcategory})
                </span>
              )}
            </h2>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center text-destructive py-12">
                <p className="text-lg mb-2">{tr('Error loading vulnerabilities', '加载漏洞失败')}</p>
                <p className="text-sm">
                  {error instanceof Error ? error.message : tr('Unknown error', '未知错误')}
                </p>
              </div>
            ) : filteredVulnerabilities.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <p className="text-lg mb-2">{tr('No vulnerabilities found.', '未找到漏洞。')}</p>
                <p className="text-sm mb-4">
                  {selectedCategory !== 'all'
                    ? tr(`No ${CATEGORIES[selectedCategory].name.toLowerCase()} found.`, '当前分类下未找到漏洞。')
                    : tr('Try adjusting your filters or search terms.', '请尝试调整筛选条件或搜索词。')}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(true)}
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {tr('Add First Vulnerability', '添加首个漏洞')}
                </Button>
              </div>
            ) : (
              <>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}
                >
                  {filteredVulnerabilities.map((vuln) => {
                    const cvssScore = getCVSSScore(vuln);
                    const topicLab = topicLibraryShortLabel(vuln.avdId, tr);
                    return (
                      <Card
                        key={vuln.id}
                        className="cursor-pointer hover:border-primary transition-all hover:shadow-md h-full flex flex-col p-5"
                        onClick={() => navigate({ to: `/vulnerabilities/${vuln.id}` })}
                      >
                        <CardHeader className="p-0">
                          <div className="flex justify-between items-start gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">
                                {vuln.name}
                              </CardTitle>
                              <div className="text-xs text-muted-foreground font-mono">
                                {vuln.avdId}
                              </div>
                            </div>
                            <Badge
                              className={`${getCVSSColor(cvssScore)} text-xs font-semibold px-3 py-1 shrink-0 rounded-full`}
                            >
                              {cvssScore.toFixed(1)}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col">
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {vuln.description || tr('No description available.', '暂无描述。')}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {topicLab ? (
                              <>
                                <Badge
                                  variant="secondary"
                                  className="text-xs px-2 py-0.5 shrink-0 font-medium"
                                  title={tr(
                                    'Topic library (by avd_id prefix), not the technical surface type.',
                                    '专题库（按 avd_id 前缀），区别于右侧技术类型。',
                                  )}
                                >
                                  {topicLab}
                                </Badge>
                                {vuln.category ? (
                                  <Badge
                                    variant="outline"
                                    className="text-xs px-2 py-0.5 max-w-[11rem] truncate font-normal text-foreground"
                                    title={vuln.category}
                                  >
                                    {vuln.category}
                                  </Badge>
                                ) : null}
                              </>
                            ) : null}
                            <Badge
                              variant="outline"
                              className={`text-xs px-2 py-0.5 ${getTypeColor(vuln.type)}`}
                              title={tr(
                                'Technical type from DB column `type` (agent/llm/dify/…)',
                                '数据库字段 type：技术类型（agent/llm/dify 等），用于测评路由与平台能力。',
                              )}
                            >
                              {vuln.type.toUpperCase()}
                            </Badge>
                            <span>•</span>
                            <span>
                              {vuln.disclosedAt
                                ? new Date(vuln.disclosedAt).toLocaleDateString()
                                : new Date(vuln.createdAt).toLocaleDateString()}
                            </span>
                            <span>•</span>
                            <span className="capitalize">{vuln.riskLevel}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* 分页组件 */}
                {totalPages > 1 && (
                  <div className="mt-6">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      total={total}
                      onPageChange={handlePageChange}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <CreateVulnerabilityDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </Main>
    </>
  );
}
