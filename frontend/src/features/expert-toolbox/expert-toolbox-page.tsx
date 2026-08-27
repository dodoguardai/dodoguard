import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  FileCode2,
  FileSpreadsheet,
  Layers3,
  type LucideIcon,
  Radar,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHead, Shell } from '@/features/compliance-case-library/shared';
import { isSingleTestTask } from '@/features/tasks/run-source-label';
import { getTaskKindFromMetadata } from '@/features/tasks/task-type-label';
import { reportsApi } from '@/services/api/reports';
import { tasksApi } from '@/services/api/tasks';
import type { AttackTask, Report } from '@/types/entities';

type ToolboxTool = {
  id: string;
  title: string;
  desc: string;
  category: string;
  phase: 'probe' | 'audit' | 'report';
  icon: LucideIcon;
  to: string;
  meta: string;
};

const BUILTIN_TOOLS: ToolboxTool[] = [
  {
    id: 'probe',
    title: '单次测试',
    desc: '对目标 Agent 发起单次或批量对话探测，快速验证运行时风险与策略有效性。',
    category: '单次测试',
    phase: 'probe',
    icon: Radar,
    to: '/expert-toolbox/dynamic-probe',
    meta: '单次 / 批量 / 多轮',
  },
  {
    id: 'platform',
    title: '智能体配置文件风险检测',
    desc: '对 Dify、Coze、FastGPT、n8n 等平台导出的 Agent 配置进行静态安全审计。',
    category: '配置审计',
    phase: 'audit',
    icon: FileCode2,
    to: '/expert-toolbox/platform-config-audit',
    meta: 'Dify / Coze / FastGPT / n8n',
  },
  {
    id: 'manual-report',
    title: '手动报告生成',
    desc: '上传 Excel 问答测评记录，补充报告标题与测试对象后生成统一版式的 PDF 报告。',
    category: '报告交付',
    phase: 'report',
    icon: FileSpreadsheet,
    to: '/reports/qna-excel',
    meta: 'Excel 问答 / PDF',
  },
];

const phaseCounts = BUILTIN_TOOLS.reduce(
  (acc, tool) => {
    acc[tool.phase] += 1;
    return acc;
  },
  { audit: 0, probe: 0, report: 0 } satisfies Record<ToolboxTool['phase'], number>,
);

const categoryCount = new Set(BUILTIN_TOOLS.map((tool) => tool.category)).size;

function isStaticAuditTask(task: AttackTask): boolean {
  const metadata = task.metadata as Record<string, unknown> | undefined;
  const kind = getTaskKindFromMetadata(metadata);
  return (
    kind === 'config_audit' ||
    kind === 'config_static' ||
    task.scanMode === 'static' ||
    task.scanMode === 'hybrid'
  );
}

function isStaticAuditReport(report: Report): boolean {
  return [
    'dify_config_audit',
    'dify_config_static',
    'coze_config_audit',
    'coze_config_static',
    'fastgpt_config_audit',
    'fastgpt_config_static',
    'n8n_config_audit',
    'skills_md_audit',
    'mcp_source_audit',
  ].includes(report.reportType ?? '');
}

export function ExpertToolboxPage() {
  const navigate = useNavigate();
  const {
    data: tasksPage,
    isError: tasksError,
    isLoading: tasksLoading,
  } = useQuery({
    queryKey: ['expert-toolbox', 'usage', 'tasks'],
    queryFn: () => tasksApi.list({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });
  const {
    data: reportsPage,
    isError: reportsError,
    isLoading: reportsLoading,
  } = useQuery({
    queryKey: ['expert-toolbox', 'usage', 'reports'],
    queryFn: () => reportsApi.list({ limit: 200, offset: 0 }),
    staleTime: 60_000,
  });

  const usageStats = useMemo(() => {
    const tasks = tasksPage?.data ?? [];
    const reports = reportsPage?.data ?? [];

    return {
      dynamicProbeRecords: tasks.filter((task) =>
        isSingleTestTask(task.metadata as Record<string, unknown> | undefined),
      ).length,
      staticAuditRecords:
        tasks.filter(isStaticAuditTask).length + reports.filter(isStaticAuditReport).length,
      reportRecords: reportsPage?.total ?? reports.length,
    };
  }, [reportsPage, tasksPage]);

  const usageLoading = tasksLoading || reportsLoading;
  const usageHasError = tasksError || reportsError;
  const usageItems = [
    {
      label: '单次测试记录',
      value: usageStats.dynamicProbeRecords,
      hint: '来自单次 / 多轮 / Excel 批量探测任务',
    },
    {
      label: '静态审计记录',
      value: usageStats.staticAuditRecords,
      hint: '来自配置审计任务与组件审计报告',
    },
    {
      label: '报告生成记录',
      value: usageStats.reportRecords,
      hint: '来自报告中心已保存报告',
    },
  ];

  return (
    <Shell>
      <PageHead
        title="工具箱总览"
        desc="专家工具箱 · 动手探测 / 批量对抗 / 静态审计 / 报告交付 · 非对话助手"
      />

      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] xl:items-start">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md">
                专家工作台
              </Badge>
              <Badge variant="outline" className="rounded-md">
                {categoryCount} 类能力
              </Badge>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              从探测、审计到报告的一站式工具入口
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              将高频专家工具统一收纳在这里，既能进入运行时动态验证，也能处理配置与组件静态审计，并补齐人工上传记录后的报告生成流程。
            </p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">近期使用记录</h2>
                <p className="text-xs text-muted-foreground">按任务与报告记录汇总</p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {usageItems.map((item) => (
                <div key={item.label} className="rounded-lg border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className="text-lg font-semibold leading-none tabular-nums">
                      {usageLoading ? '—' : usageHasError ? '异常' : item.value}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground" title={item.hint}>
                    {item.hint}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {usageHasError
                ? '部分使用记录获取失败，请稍后刷新。'
                : '统计最近 200 条任务 / 报告；手动报告若仅下载不入库，则不会硬计入次数。'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/50">
              <Wrench className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">工具总数</p>
              <p className="text-2xl font-semibold tabular-nums">{BUILTIN_TOOLS.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/50">
              <Radar className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">动态验证</p>
              <p className="text-2xl font-semibold tabular-nums">{phaseCounts.probe}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/50">
              <Layers3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">静态审计</p>
              <p className="text-2xl font-semibold tabular-nums">{phaseCounts.audit}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/50">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">报告交付</p>
              <p className="text-2xl font-semibold tabular-nums">{phaseCounts.report}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>工具目录</CardTitle>
              <CardDescription>
                点击卡片进入对应工具 · 侧边栏「专家工具箱」可快速切换
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-md">
              {BUILTIN_TOOLS.length} 项已接入
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BUILTIN_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className="group flex min-h-48 flex-col rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => navigate({ to: tool.to })}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-muted/50">
                      <Icon className="h-5 w-5 text-foreground/80" />
                    </div>
                    <span className="rounded-md border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {tool.category}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold">{tool.title}</h3>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {tool.desc}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                    <span className="truncate text-xs text-muted-foreground" title={tool.meta}>
                      {tool.meta}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      打开
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}
