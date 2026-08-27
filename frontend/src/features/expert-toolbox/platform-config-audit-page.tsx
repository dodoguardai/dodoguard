/**
 * Agent config file risk audit — MCP-style hub (overview / run / history).
 */

import { useNavigate, useSearch } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Eye,
  FileCode2,
  FileJson,
  FileText,
  History,
  MoreHorizontal,
  Trash2,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAuditModule } from '@/features/audit/audit-registry';
import { riskLevelZh } from '@/features/reports/config-audit-report-chrome';
import { riskVariant } from '@/features/dify-config-audit/utils';
import { cn } from '@/lib/utils';
import { AuditWizard as DifyAuditWizard } from '@/features/dify-config-audit/audit-wizard';
import { CozeConfigAuditWizard } from '@/features/coze-config-audit/audit-wizard';
import { FastGptConfigAuditWizard } from '@/features/fastgpt-config-audit/audit-wizard';
import { N8nConfigAuditWizard } from '@/features/n8n-config-audit/audit-wizard';
import type { DifyConfigAuditData } from '@/services/api/dify-config-audit';

export const PLATFORM_CONFIG_TABS = ['dify', 'coze', 'fastgpt', 'n8n'] as const;
export type PlatformConfigTab = (typeof PLATFORM_CONFIG_TABS)[number];

export const PLATFORM_CONFIG_VIEWS = ['overview', 'run', 'history'] as const;
export type PlatformConfigView = (typeof PLATFORM_CONFIG_VIEWS)[number];

function isPlatformConfigTab(value: string): value is PlatformConfigTab {
  return PLATFORM_CONFIG_TABS.includes(value as PlatformConfigTab);
}

function isPlatformConfigView(value: string): value is PlatformConfigView {
  return PLATFORM_CONFIG_VIEWS.includes(value as PlatformConfigView);
}

type PlatformMeta = {
  id: PlatformConfigTab;
  labelZh: string;
  labelEn: string;
  formatZh: string;
  formatEn: string;
  briefZh: string;
  briefEn: string;
  descZh: string;
  descEn: string;
  howZh: string[];
  howEn: string[];
  disclaimerZh: string;
  disclaimerEn: string;
  icon: typeof FileCode2;
  auditType: 'dify-config' | 'coze-config' | 'fastgpt-config' | 'n8n-config';
  historyDetailPath:
    | '/dify-config-audit/history/$id'
    | '/coze-config-audit/history/$id'
    | '/fastgpt-config-audit/history/$id'
    | '/n8n-config-audit/history/$id';
};

const PLATFORMS: PlatformMeta[] = [
  {
    id: 'dify',
    labelZh: 'Dify',
    labelEn: 'Dify',
    formatZh: 'YAML',
    formatEn: 'YAML',
    briefZh: '应用 DSL / 工作流导出静态审计',
    briefEn: 'Static audit for app DSL / workflow exports',
    descZh:
      '上传 Dify 应用导出文件（YAML）。服务端解析并脱敏后交由审查模型，返回摘要、风险等级与发现项。',
    descEn:
      'Upload a Dify app export (YAML). The server sanitizes it and returns structured security findings.',
    howZh: [
      '读取 YAML 并校验 Dify 应用导出结构',
      '提取与安全相关的子集并对密钥脱敏',
      '按服务端审计指令调用你选择的模型',
      '校验模型返回的 JSON 并渲染结果',
    ],
    howEn: [
      'Read the YAML and validate Dify app export shape',
      'Extract a security-focused subset and redact secrets',
      'Call your chosen model with server-side audit instructions',
      'Validate the model JSON response and render results',
    ],
    disclaimerZh:
      '结果仅基于已上传的配置，可能遗漏运行时问题。请勿上传生产环境密钥；服务端会对常见密钥字段做脱敏处理。',
    disclaimerEn:
      'Results are based only on the uploaded configuration. They may miss runtime issues. Do not share production secrets.',
    icon: FileCode2,
    auditType: 'dify-config',
    historyDetailPath: '/dify-config-audit/history/$id',
  },
  {
    id: 'coze',
    labelZh: 'Coze',
    labelEn: 'Coze',
    formatZh: 'YAML',
    formatEn: 'YAML',
    briefZh: '工作流插件与敏感配置审查',
    briefEn: 'Workflow plugin and sensitive config review',
    descZh: '上传 Coze 工作流导出（YAML），静态审查插件、工具与敏感配置风险。',
    descEn: 'Upload a Coze workflow export (YAML) for static plugin and config risk review.',
    howZh: ['校验 Coze 工作流导出结构', '脱敏敏感字段', '调用审核模型', '展示风险与发现项'],
    howEn: ['Validate Coze workflow export', 'Redact secrets', 'Run reviewer model', 'Render findings'],
    disclaimerZh: '审计结果仅反映静态配置，不能替代运行时渗透测试。',
    disclaimerEn: 'Audit results reflect static configuration only, not runtime penetration testing.',
    icon: Workflow,
    auditType: 'coze-config',
    historyDetailPath: '/coze-config-audit/history/$id',
  },
  {
    id: 'fastgpt',
    labelZh: 'FastGPT',
    labelEn: 'FastGPT',
    formatZh: 'JSON',
    formatEn: 'JSON',
    briefZh: '应用 / 工作流 JSON 配置审计',
    briefEn: 'App / workflow JSON configuration audit',
    descZh: '上传 FastGPT 应用/工作流 JSON 导出，进行静态安全配置审计。',
    descEn: 'Upload FastGPT app/workflow JSON export for static security configuration audit.',
    howZh: ['解析 FastGPT JSON 结构', '脱敏密钥与凭据', '调用审核模型', '输出风险摘要'],
    howEn: ['Parse FastGPT JSON', 'Redact credentials', 'Run reviewer model', 'Output risk summary'],
    disclaimerZh: '请使用测试环境导出，避免上传生产密钥。',
    disclaimerEn: 'Use test-environment exports; avoid uploading production secrets.',
    icon: FileJson,
    auditType: 'fastgpt-config',
    historyDetailPath: '/fastgpt-config-audit/history/$id',
  },
  {
    id: 'n8n',
    labelZh: 'n8n',
    labelEn: 'n8n',
    formatZh: 'JSON',
    formatEn: 'JSON',
    briefZh: '节点、凭据与自动化逻辑审计',
    briefEn: 'Nodes, credentials, and automation logic audit',
    descZh: '上传 n8n 工作流 JSON，审计节点、凭据引用与高危自动化逻辑。',
    descEn: 'Upload n8n workflow JSON to audit nodes, credential references, and risky automation.',
    howZh: ['解析 n8n 工作流 JSON', '识别凭据与 HTTP 节点风险', '调用审核模型', '生成发现项列表'],
    howEn: ['Parse n8n workflow JSON', 'Flag credential and HTTP risks', 'Run reviewer model', 'List findings'],
    disclaimerZh: '静态审计无法覆盖运行时凭据泄露与执行路径。',
    disclaimerEn: 'Static audit cannot cover runtime credential leakage or execution paths.',
    icon: FileText,
    auditType: 'n8n-config',
    historyDetailPath: '/n8n-config-audit/history/$id',
  },
];

const navClass =
  'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
const navActiveClass = 'bg-muted text-foreground';

function PlatformWizard({ platformId, embedded }: { platformId: PlatformConfigTab; embedded?: boolean }) {
  if (platformId === 'dify') {
    return <DifyAuditWizard embedded={embedded} />;
  }
  if (platformId === 'coze') {
    return <CozeConfigAuditWizard embedded={embedded} />;
  }
  if (platformId === 'fastgpt') {
    return <FastGptConfigAuditWizard embedded={embedded} />;
  }
  return <N8nConfigAuditWizard embedded={embedded} />;
}

function OverviewSection({
  onStart,
}: {
  onStart: (platform: PlatformConfigTab) => void;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  return (
    <>
      <div className="mb-8 flex items-start gap-3">
        <FileCode2 className="size-9 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tr('Agent Config File Risk Audit', '智能体配置文件风险检测')}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            {tr(
              'Static security audit for Dify, Coze, FastGPT, and n8n agent configuration exports. Pick a platform to start, or review local audit history.',
              '对 Dify、Coze、FastGPT、n8n 等平台导出的 Agent 配置文件进行静态安全审计。选择平台开始检测，或在审计历史中查看本机记录。',
            )}
          </p>
        </div>
      </div>

      <div className="space-y-8 border-t pt-10">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">
            {tr('Audit entry', '配置审计入口')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {tr(
              'Upload a platform export and run LLM-assisted static review. History is kept in this browser.',
              '上传各平台导出文件并运行 LLM 辅助静态审查。历史记录保存在本浏览器。',
            )}
          </p>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight">
            {tr('Supported platforms', '支持的平台')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => onStart(platform.id)}
                  className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <Icon className="text-muted-foreground size-7 shrink-0 transition-colors group-hover:text-foreground" />
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                      {tr(platform.formatEn, platform.formatZh)}
                    </Badge>
                  </div>
                  <div className="mb-1 text-base font-semibold tracking-tight">
                    {tr(platform.labelEn, platform.labelZh)}
                  </div>
                  <p className="text-muted-foreground mb-4 line-clamp-2 min-h-10 flex-1 text-xs leading-relaxed">
                    {tr(platform.briefEn, platform.briefZh)}
                  </p>
                  <span className="text-primary text-sm font-medium">
                    {tr('Start audit →', '开始审计 →')}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function RunSection({
  platform,
  onPlatformChange,
}: {
  platform: PlatformMeta;
  onPlatformChange: (id: PlatformConfigTab) => void;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const Icon = platform.icon;

  return (
    <>
      <div className="mb-6 flex items-start gap-2">
        <Icon className="size-8 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tr(`${platform.labelEn} config audit`, `${platform.labelZh} 配置审计`)}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {tr(platform.descEn, platform.descZh)}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3" role="tablist">
        {PLATFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === platform.id}
            className={cn(navClass, item.id === platform.id ? navActiveClass : '')}
            onClick={() => onPlatformChange(item.id)}
          >
            {tr(item.labelEn, item.labelZh)}
          </button>
        ))}
      </div>

      <Collapsible defaultOpen={false} className="group/collapse mb-6">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-muted bg-muted/30 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
          >
            {tr('How it works & Disclaimer', '工作原理与免责声明')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 rounded-b-md border border-t-0 border-muted bg-muted/20 px-4 py-3">
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{tr('How it works', '工作原理')}</AlertTitle>
              <AlertDescription className="space-y-1 text-xs text-muted-foreground">
                <ol className="list-inside list-decimal space-y-1">
                  {(isZh ? platform.howZh : platform.howEn).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </AlertDescription>
            </Alert>
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{tr('Disclaimer', '免责声明')}</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                {tr(platform.disclaimerEn, platform.disclaimerZh)}
              </AlertDescription>
            </Alert>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <PlatformWizard platformId={platform.id} embedded />
    </>
  );
}

type HistoryRow = {
  id: string;
  platform: PlatformMeta;
  fileName?: string;
  overallRisk: string;
  summary: string;
  createdAt: string;
};

function loadHistoryRows(): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const platform of PLATFORMS) {
    const mod = getAuditModule(platform.auditType);
    if (!mod?.storage) {
      continue;
    }
    const list = mod.storage.list() as Array<{
      id: string;
      result: DifyConfigAuditData;
      metadata?: { fileName?: string; overallRisk?: string };
      createdAt: string;
    }>;
    for (const item of list) {
      rows.push({
        id: item.id,
        platform,
        fileName: item.metadata?.fileName,
        overallRisk: item.metadata?.overallRisk ?? item.result.overallRisk ?? 'medium',
        summary: item.result.summary ?? '',
        createdAt: item.createdAt,
      });
    }
  }
  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function HistorySection({ onStart }: { onStart: (platform?: PlatformConfigTab) => void }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [revision, setRevision] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);

  const items = useMemo(() => loadHistoryRows(), [revision]);

  const handleView = useCallback(
    (item: HistoryRow) => {
      void navigate({
        to: item.platform.historyDetailPath,
        params: { id: item.id },
      });
    },
    [navigate],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) {
      return;
    }
    const mod = getAuditModule(deleteTarget.platform.auditType);
    const ok = mod?.storage.remove(deleteTarget.id) ?? false;
    if (ok) {
      toast.success(tr('Deleted', '已删除'));
      setRevision((n) => n + 1);
    } else {
      toast.error(tr('Delete failed', '删除失败'));
    }
    setDeleteTarget(null);
  }, [deleteTarget, isZh]);

  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <History className="size-8" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tr('Config audit history', '配置审计历史')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {tr(
              'History is stored only in this browser and is not synced across devices.',
              '历史记录仅保存在本浏览器，不会跨设备同步。',
            )}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileCode2 className="text-muted-foreground mx-auto mb-4 size-12" />
          <p className="text-muted-foreground">
            {tr('No audit history yet.', '暂无审计历史。')}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {tr(
              'Run a config audit to build your history.',
              '运行一次配置审计后，记录会出现在这里。',
            )}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => onStart('dify')}>
              {tr('Run audit', '运行审计')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Platform', '平台')}</TableHead>
                  <TableHead>{tr('File', '文件')}</TableHead>
                  <TableHead>{tr('Risk', '风险')}</TableHead>
                  <TableHead>{tr('Summary', '摘要')}</TableHead>
                  <TableHead>{tr('Time', '时间')}</TableHead>
                  <TableHead className="w-25 text-end">{tr('Actions', '操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.platform.id}-${item.id}`}>
                    <TableCell>
                      <Badge variant="outline">
                        {tr(item.platform.labelEn, item.platform.labelZh)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.fileName || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={riskVariant(
                          item.overallRisk as DifyConfigAuditData['overallRisk'],
                        )}
                      >
                        {isZh ? riskLevelZh(item.overallRisk) : item.overallRisk}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-70 truncate text-sm">
                      {item.summary}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={tr('Actions', '操作')}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel>{tr('Actions', '操作')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleView(item)}>
                              <Eye className="size-4" />
                              {tr('View', '查看')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="size-4" />
                              {tr('Delete', '删除')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={() => onStart()}>
              {tr('New audit', '新建审计')}
            </Button>
          </div>
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('Delete this record?', '确认删除？')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                `This will remove “${deleteTarget?.fileName || '—'}” from local history. This cannot be undone.`,
                `将删除本机历史中的「${deleteTarget?.fileName || '—'}」，此操作不可恢复。`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr('Cancel', '取消')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {tr('Delete', '确认删除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PlatformConfigAuditPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_authenticated/expert-toolbox/platform-config-audit' });
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const view: PlatformConfigView = isPlatformConfigView(search.view) ? search.view : 'overview';
  const activePlatformId: PlatformConfigTab = isPlatformConfigTab(search.platform)
    ? search.platform
    : 'dify';
  const activePlatform =
    PLATFORMS.find((p) => p.id === activePlatformId) ?? PLATFORMS[0];

  const setView = (next: PlatformConfigView, platform?: PlatformConfigTab) => {
    void navigate({
      to: '/expert-toolbox/platform-config-audit',
      search: {
        view: next,
        platform: platform ?? activePlatformId,
      },
    });
  };

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <nav
          className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3"
          aria-label={tr('Config audit', '配置审计')}
        >
          <button
            type="button"
            className={cn(navClass, view === 'overview' ? navActiveClass : '')}
            onClick={() => setView('overview')}
          >
            {tr('Overview', '概览')}
          </button>
          <button
            type="button"
            className={cn(navClass, view === 'run' ? navActiveClass : '')}
            onClick={() => setView('run')}
          >
            {tr('Run audit', '运行审计')}
          </button>
          <button
            type="button"
            className={cn(navClass, view === 'history' ? navActiveClass : '')}
            onClick={() => setView('history')}
          >
            {tr('Audit history', '审计历史')}
          </button>
        </nav>

        {view === 'overview' ? (
          <OverviewSection onStart={(platform) => setView('run', platform)} />
        ) : null}
        {view === 'run' ? (
          <RunSection
            platform={activePlatform}
            onPlatformChange={(platform) => setView('run', platform)}
          />
        ) : null}
        {view === 'history' ? (
          <HistorySection onStart={(platform) => setView('run', platform)} />
        ) : null}
      </Main>
    </>
  );
}
