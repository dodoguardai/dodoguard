import type { OwnerType } from '@/services/api/agent-governance';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Loader2,
  Pencil,
  ScanSearch,
  Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import { labelFromOptions } from '@/features/launch-monitoring/periodic-plan-config';
import { RiskDetailDrawer } from '@/features/risk-closed-loop/risk-detail-drawer';
import {
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  formatRemediationListTitle,
  formatTaskDisplayLabel,
  isClosedDisplayStatus,
  resolveRiskRowLibraryLabel,
  type EnrichedRiskRow,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { assetIntakeApi } from '@/services/api/asset-intake';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type {
  AgentAsset,
  AgentAssetComponent,
  AgentAssetComponentType,
  TargetAgent,
} from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type ProfileConfigSection = 'ownership' | 'governance' | 'access' | 'connectivity';

type RiskProfileDomain = 'dialog' | 'compliance' | 'component' | 'model' | 'data' | 'access';

const environmentOptions = [
  ['dev', '开发'],
  ['test', '测试'],
  ['staging', '预生产'],
  ['prod', '生产'],
] as const;

const runtimeOptions = [
  ['not_launched', '未上线'],
  ['running', '运行中'],
  ['offline', '已下线'],
] as const;

const admissionOptions = [
  ['not_checked', '未检测'],
  ['failed', '需整改'],
  ['passed', '通过'],
] as const;

const admissionLegacyLabels: Record<string, string> = {
  checking: '检测中',
  retest: '复测中',
  conditional_passed: '条件通过',
};

const riskOptions = [
  ['normal', '正常'],
  ['low', '低危'],
  ['medium', '中危'],
  ['high', '高危'],
  ['critical', '严重'],
] as const;

const exposureOptions = [
  ['internal', '内部'],
  ['external_customer', '外部客户'],
  ['public', '公网'],
] as const;

const agentTypeOptions = [
  ['qa', '问答型'],
  ['task', '任务型'],
  ['tool', '工具型'],
  ['workflow', '流程型'],
  ['multi_agent', '多智能体型'],
] as const;

const componentTypeOptions: Array<[AgentAssetComponentType, string]> = [
  ['tool', '工具'],
  ['skill', 'Skills'],
  ['mcp', 'MCP'],
  ['model', '大模型'],
  ['knowledge_base', '知识库'],
];

const labelFrom = labelFromOptions;

const LIFECYCLE_EVENT_LABELS: Record<string, string> = {
  created: '已创建',
  updated: '资产信息已更新',
  workflow_stage_changed: '治理阶段已变更',
  status_changed: '生命周期状态已变更',
  component_changed: '能力组件已变更',
  archived: '已归档',
  claimed: '已认领',
};

const GOVERNANCE_STAGE_LABELS: Record<string, string> = {
  asset_intake: '资产入库',
  component_identification: '组件识别',
  component_detection: '组件级检测',
  agent_detection: '智能体整体检测',
  risk_assessment: '综合风险评估',
  remediation: '风险整改',
  retest: '复测验证',
  report_audit: '报告审计',
  launch_monitoring: '上线监测',
};

const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  registered: '已登记',
  active: '运行中',
  archived: '已归档',
  draft: '草稿',
};

const CHANGED_FIELD_LABELS: Record<string, string> = {
  name: '资产名称',
  riskLevel: '风险等级',
  admissionStatus: '放行结论',
  runtimeStatus: '运行状态',
  lifecycleStatus: '生命周期',
  environment: '部署环境',
  exposureLevel: '暴露级别',
  version: '版本',
  metadata: '元数据',
  owners: '负责人',
  components: '能力组件',
};

function lifecycleEventLabel(eventType?: string | null) {
  if (!eventType) {
    return '其他事件';
  }
  return LIFECYCLE_EVENT_LABELS[eventType] || '其他事件';
}

function lifecycleStatusLabel(status?: string | null) {
  if (!status) {
    return '—';
  }
  return LIFECYCLE_STATUS_LABELS[status] || status;
}

function lifecycleEventActor(event: { actorId?: string | null; eventDetail?: Record<string, unknown> }) {
  const detailName = event.eventDetail?.actorName;
  if (typeof detailName === 'string' && detailName.trim()) {
    return detailName.trim();
  }
  if (event.actorId) {
    return event.actorId.length > 12 ? `${event.actorId.slice(0, 8)}…` : event.actorId;
  }
  return '系统';
}

function lifecycleEventDetail(event: {
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  eventDetail?: Record<string, unknown>;
}) {
  const detail = event.eventDetail || {};

  if (event.eventType === 'workflow_stage_changed') {
    const stage =
      typeof detail.stage === 'string'
        ? GOVERNANCE_STAGE_LABELS[detail.stage] || detail.stage
        : '未知阶段';
    const status = typeof detail.status === 'string' ? detail.status : '';
    const note = typeof detail.note === 'string' && detail.note.trim() ? detail.note.trim() : '';
    const statusText = status ? ` · 状态 ${status}` : '';
    const noteText = note ? ` · ${note}` : '';
    return `推进至「${stage}」${statusText}${noteText}`;
  }

  if (event.eventType === 'component_changed') {
    const count = typeof detail.count === 'number' ? detail.count : undefined;
    return count != null ? `更新挂载组件，共 ${count} 个` : '更新挂载组件';
  }

  if (event.eventType === 'created') {
    return '完成资产登记并入台账';
  }

  if (event.eventType === 'claimed') {
    return '认领已发现资产并完成入库';
  }

  if (event.eventType === 'archived') {
    return `生命周期由「${lifecycleStatusLabel(event.fromStatus)}」变更为「${lifecycleStatusLabel(event.toStatus)}」`;
  }

  if (event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus) {
    return `状态由「${lifecycleStatusLabel(event.fromStatus)}」变更为「${lifecycleStatusLabel(event.toStatus)}」`;
  }

  const changedFields = Array.isArray(detail.changedFields)
    ? detail.changedFields
        .map((field) => (typeof field === 'string' ? CHANGED_FIELD_LABELS[field] || field : ''))
        .filter(Boolean)
    : [];
  if (changedFields.length > 0) {
    return `更新字段：${changedFields.join('、')}`;
  }

  return '—';
}

function LifecycleEventList({ events }: { events: NonNullable<AgentAsset['events']> }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const total = events.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageItems = events.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!total) {
    return <p className="text-sm text-muted-foreground">暂无生命周期事件</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 w-[168px]">时间</TableHead>
              <TableHead className="h-9 w-[140px]">操作</TableHead>
              <TableHead className="h-9 w-[120px]">操作人员</TableHead>
              <TableHead className="h-9">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="py-2 align-top text-xs text-muted-foreground">
                  {formatAssetTime(event.createdAt)}
                </TableCell>
                <TableCell className="py-2 align-top text-sm font-medium">
                  {lifecycleEventLabel(event.eventType)}
                </TableCell>
                <TableCell className="py-2 align-top text-sm">
                  {lifecycleEventActor(event)}
                </TableCell>
                <TableCell className="py-2 align-top text-sm text-muted-foreground">
                  {lifecycleEventDetail(event)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > 0 ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          itemLabels={{ singular: '条事件', plural: '条事件' }}
        />
      ) : null}
    </div>
  );
}

const RISK_DOMAINS: Array<{
  id: RiskProfileDomain;
  label: string;
  subtitle: string;
  tabSub: string;
}> = [
  {
    id: 'dialog',
    label: '对话风险',
    subtitle: '展示对话过程中的攻击、越权、敏感输出和异常交互风险',
    tabSub: '注入 / 越权 / 敏感输出',
  },
  {
    id: 'compliance',
    label: '合规风险',
    subtitle: '展示数据合规、内容合规与监管要求相关的风险项',
    tabSub: '数据合规 / 内容合规',
  },
  {
    id: 'component',
    label: '组件风险',
    subtitle: '展示 Skill、MCP、工具、知识库等能力组件相关风险',
    tabSub: 'Skill / 制品 / 权限边界',
  },
  {
    id: 'model',
    label: '模型风险',
    subtitle: '展示模型策略、稳定性与推理行为相关风险',
    tabSub: '模型策略 / 稳定性',
  },
  {
    id: 'data',
    label: '数据风险',
    subtitle: '展示数据类型、敏感级别与数据流转相关风险',
    tabSub: '数据类型 / 敏感级别',
  },
  {
    id: 'access',
    label: '权限与运行风险',
    subtitle: '展示 API Key、暴露面、连通性与运行权限相关风险',
    tabSub: 'API Key / 暴露 / 连通性',
  },
];

const PROFILE_ANCHORS = [
  { id: 'profile-risk', label: '风险详情' },
  { id: 'profile-basic', label: '基础信息' },
  { id: 'profile-owner', label: '归属与负责人' },
  { id: 'profile-access', label: '接入配置' },
  { id: 'profile-connect', label: '连通性说明' },
  { id: 'profile-governance', label: '治理与检测' },
  { id: 'profile-portrait', label: '能力组件' },
  { id: 'profile-timeline', label: '生命周期事件' },
] as const;

const displayUnknown = (value: unknown, fallback = '未设置'): string => {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length
      ? value
          .map((item) => displayUnknown(item, ''))
          .filter(Boolean)
          .join(' / ')
      : fallback;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
};

const maskSecret = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '未配置';
  }
  if (value.length <= 8) {
    return '已配置';
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
};

const formatAssetTime = (value?: string | null) => {
  if (!value) {
    return '未记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN');
};

const ledgerRuntimeLabel = (value?: string | null) => labelFrom(runtimeOptions, value);

const ledgerAdmissionLabel = (value?: string | null) => {
  if (!value) {
    return '未检测';
  }
  if (value === 'checking') {
    return '检测中';
  }
  if (value === 'retest') {
    return '待复测';
  }
  if (admissionLegacyLabels[value]) {
    return admissionLegacyLabels[value];
  }
  return labelFrom(admissionOptions, value);
};

const assetMetadataText = (asset: AgentAsset, keys: string[]) => {
  const metadata = asset.metadata || {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
};

function runtimeConfigOf(asset: AgentAsset) {
  const metadata = asset.metadata || {};
  return metadata.runtimeConfig &&
    typeof metadata.runtimeConfig === 'object' &&
    !Array.isArray(metadata.runtimeConfig)
    ? (metadata.runtimeConfig as Record<string, unknown>)
    : {};
}

function probeOf(runtimeConfig: Record<string, unknown>) {
  return runtimeConfig.lastProbe &&
    typeof runtimeConfig.lastProbe === 'object' &&
    !Array.isArray(runtimeConfig.lastProbe)
    ? (runtimeConfig.lastProbe as Record<string, unknown>)
    : undefined;
}

function probePayloadFromAsset(asset: AgentAsset) {
  const config = runtimeConfigOf(asset);
  return {
    type: String(config.agentType || 'http') as TargetAgent['type'],
    name: asset.name,
    config,
  };
}

function ownerByType(asset: AgentAsset, ownerType: OwnerType) {
  return asset.owners?.find((owner) => owner.ownerType === ownerType);
}

function ownerDisplay(asset: AgentAsset, ownerType: OwnerType) {
  return ownerByType(asset, ownerType)?.ownerName || '未指派';
}

function accessMethodLabel(runtimeConfig: Record<string, unknown>) {
  const method = displayUnknown(runtimeConfig.method, '');
  if (method === 'sdk') {
    return 'SDK 接入';
  }
  if (method === 'webhook') {
    return 'Webhook';
  }
  if (method === 'proxy') {
    return '代理模式';
  }
  if (method === 'platform') {
    return '平台接入';
  }
  if (method === 'file') {
    return '文件导入';
  }
  if (method === 'offline') {
    return '离线评测';
  }
  if (runtimeConfig.webhookUrl) {
    return 'Webhook';
  }
  if (runtimeConfig.agentType || runtimeConfig.apiBaseUrl) {
    return 'API 接入';
  }
  return '未配置';
}

function runtimeConnectorLabel(runtimeConfig: Record<string, unknown>, asset: AgentAsset) {
  const value = displayUnknown(
    runtimeConfig.agentType || runtimeConfig.protocol || asset.platformFamily,
  );
  if (value === 'tencent-adp') {
    return '腾讯 ADP';
  }
  if (value === 'api-stream') {
    return '流式 API';
  }
  if (value === 'api') {
    return '通用 API';
  }
  if (value === 'custom') {
    return '自定义';
  }
  return value;
}

function runtimeEndpoint(runtimeConfig: Record<string, unknown>) {
  const baseUrl = displayUnknown(runtimeConfig.apiBaseUrl, '');
  const webhookUrl = displayUnknown(runtimeConfig.webhookUrl, '');
  const path = displayUnknown(runtimeConfig.chatPath || runtimeConfig.webhookPath, '');
  if (webhookUrl) {
    return webhookUrl;
  }
  if (baseUrl && path) {
    return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return baseUrl || '未配置';
}

function runtimeTypeFields(runtimeConfig: Record<string, unknown>) {
  const agentType = runtimeConfig.agentType;
  if (agentType === 'dify') {
    return [
      ['API 类型', runtimeConfig.apiType === 'workflow' ? 'Workflow' : 'Chat'],
      ['Response Mode', displayUnknown(runtimeConfig.responseMode, 'blocking')],
      ['Workflow Input Key', displayUnknown(runtimeConfig.workflowInputKey, 'query')],
      ['User ID', displayUnknown(runtimeConfig.userId)],
      ['Conversation ID', displayUnknown(runtimeConfig.conversationId)],
    ] as Array<[string, string]>;
  }
  if (agentType === 'coze') {
    return [
      ['Bot ID', displayUnknown(runtimeConfig.botId)],
      ['Connector ID', displayUnknown(runtimeConfig.connectorId)],
      ['Chat Path', displayUnknown(runtimeConfig.chatPath, '/v1/chat/completions')],
      ['Auth Header', displayUnknown(runtimeConfig.authHeaderName, 'Authorization')],
      ['Response Mode', displayUnknown(runtimeConfig.responseMode, 'blocking')],
    ] as Array<[string, string]>;
  }
  return [
    ['Chat Path', displayUnknown(runtimeConfig.chatPath, '/v1/chat/completions')],
    ['Auth Header', displayUnknown(runtimeConfig.authHeaderName, 'Authorization')],
    ['Response Mode', displayUnknown(runtimeConfig.responseMode, 'blocking')],
  ] as Array<[string, string]>;
}

function configFilesOf(asset: AgentAsset) {
  return Array.isArray(asset.metadata?.configFiles) ? asset.metadata.configFiles : [];
}

function countComponents(asset: AgentAsset) {
  return (asset.components || []).reduce<Record<string, number>>((acc, component) => {
    acc[component.componentType] = (acc[component.componentType] || 0) + 1;
    return acc;
  }, {});
}

function rowMatchesAsset(row: EnrichedRiskRow, asset: AgentAsset) {
  if (row.assetId === asset.id) {
    return true;
  }
  if (row.scanTask?.assetId === asset.id) {
    return true;
  }
  const runConfig =
    row.scanTask?.runConfig && typeof row.scanTask.runConfig === 'object'
      ? (row.scanTask.runConfig as Record<string, unknown>)
      : null;
  if (runConfig?.sourceAssetId === asset.id) {
    return true;
  }
  return false;
}

function classifyRiskProfileDomain(row: EnrichedRiskRow): RiskProfileDomain {
  const title = (row.title || '').toLowerCase();
  const category = String(row.finding?.category || row.metadata?.category || '').toLowerCase();
  const text = `${title} ${category}`;

  if (row.riskKind === 'compliance') {
    return 'compliance';
  }
  if (row.riskKind === 'component') {
    return 'component';
  }
  if (/模型|llm|大模型|model|prompt|稳定性|推理/.test(text)) {
    return 'model';
  }
  if (/数据|敏感|pii|个人信息|隐私|脱敏|涉敏/.test(text)) {
    return 'data';
  }
  if (/权限|api.?key|暴露|连通|鉴权|auth|access|运行|越权|密钥/.test(text)) {
    return 'access';
  }
  return 'dialog';
}

function computeRiskScore(rows: EnrichedRiskRow[]) {
  let score = 100;
  for (const row of rows) {
    if (row.riskLevel === 'critical') {
      score -= 15;
    } else if (row.riskLevel === 'high') {
      score -= 10;
    } else if (row.riskLevel === 'medium') {
      score -= 5;
    } else {
      score -= 2;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function riskScoreLabel(score: number) {
  if (score >= 80) {
    return { text: '低风险', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }
  if (score >= 60) {
    return { text: '中风险 · 需整改', className: 'border-amber-200 bg-amber-50 text-amber-800' };
  }
  return { text: '高风险', className: 'border-red-200 bg-red-50 text-red-700' };
}

function connectionStatusBadge(probe?: Record<string, unknown>) {
  if (!probe) {
    return <Badge variant="secondary">未测试</Badge>;
  }
  if (probe.status === 'success') {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        已联通
      </Badge>
    );
  }
  return <Badge variant="destructive">未联通</Badge>;
}

function admissionChipClass(value?: string | null) {
  if (value === 'failed') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (value === 'passed' || value === 'conditional_passed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'retest' || value === 'checking') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function PortraitLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-sm text-foreground">{value || '未设置'}</span>
    </div>
  );
}

function InfoCell({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-gradient-to-b from-white to-slate-50/80 px-3 py-3 dark:from-background dark:to-muted/20',
        className,
      )}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SectionCard({
  id,
  title,
  subtitle,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn('gap-0 overflow-hidden py-0 shadow-sm', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/10 px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function RiskListItem({
  row,
  onOpen,
}: {
  row: EnrichedRiskRow;
  onOpen: (row: EnrichedRiskRow) => void;
}) {
  const code = row.violationNo || row.findingId || row.id;

  return (
    <div
      className="grid cursor-pointer grid-cols-1 items-center gap-3 border-t px-3.5 py-3 text-sm transition hover:bg-muted/30 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(96px,0.7fr)_minmax(96px,0.6fr)_auto]"
      onClick={() => onOpen(row)}
    >
      <div className="min-w-0">
        <div className="truncate font-medium leading-snug">
          {formatRemediationListTitle(row.title)}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{code}</div>
      </div>
      <div className="min-w-0 text-xs">
        <div className="truncate">{resolveRiskRowLibraryLabel(row)}</div>
        <div className="mt-1 truncate text-muted-foreground">
          {formatTaskDisplayLabel(row.taskId, row.scanTask?.name || row.taskId)}
        </div>
      </div>
      <div className="min-w-0 text-xs">
        <div className="truncate">{row.ownerName || '未指派'}</div>
        <div className="mt-1">
          <RiskBadge level={row.riskLevel} />
        </div>
      </div>
      <div className="min-w-0">
        <Badge variant="outline" className={DISPLAY_STATUS_CLASS[row.displayStatus]}>
          {DISPLAY_STATUS_LABEL[row.displayStatus]}
        </Badge>
      </div>
      <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
        <Button variant="outline" size="sm" onClick={() => onOpen(row)}>
          详情
        </Button>
      </div>
    </div>
  );
}

function RiskProfileList({
  rows,
  domainId,
  onOpen,
}: {
  rows: EnrichedRiskRow[];
  domainId: RiskProfileDomain;
  onOpen: (row: EnrichedRiskRow) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    setPage(1);
  }, [domainId]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageItems = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(96px,0.7fr)_minmax(96px,0.6fr)_auto] gap-3 bg-muted/40 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground sm:grid">
          <div>风险标题</div>
          <div>场景库 / 任务</div>
          <div>责任人</div>
          <div>状态</div>
          <div className="text-right">操作</div>
        </div>
        {pageItems.map((row) => (
          <RiskListItem key={row.id} row={row} onOpen={onOpen} />
        ))}
      </div>
      {total > 0 ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          itemLabels={{ singular: '项风险', plural: '项风险' }}
        />
      ) : null}
    </div>
  );
}

function RiskDomainTabs({
  activeDomain,
  openRowsByDomain,
  onChange,
}: {
  activeDomain: RiskProfileDomain;
  openRowsByDomain: Record<RiskProfileDomain, EnrichedRiskRow[]>;
  onChange: (domain: RiskProfileDomain) => void;
}) {
  return (
    <nav
      className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-muted/60 p-1"
      aria-label="风险域筛选"
    >
      {RISK_DOMAINS.map((domain) => {
        const openCount = openRowsByDomain[domain.id].length;
        const active = activeDomain === domain.id;
        return (
          <button
            key={domain.id}
            type="button"
            title={domain.tabSub}
            onClick={() => onChange(domain.id)}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-muted-foreground transition',
              active && 'bg-background text-blue-600 shadow-sm',
              !active && openCount === 0 && 'opacity-60',
              !active && openCount > 0 && 'hover:text-foreground',
            )}
          >
            {domain.label}
            <span
              className={cn(
                'ml-1.5 tabular-nums',
                active ? 'text-blue-600' : openCount > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {openCount}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ComponentProfileList({
  asset,
  activeType,
}: {
  asset: AgentAsset;
  activeType: AgentAssetComponentType;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const components = asset.components || [];
  const filtered = components.filter((component) => component.componentType === activeType);

  useEffect(() => {
    setPage(1);
  }, [activeType, asset.id]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const typeLabel = componentTypeLabel(activeType);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          已挂载 {total} 个 · 来源于能力组件管理
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          暂未挂载{typeLabel}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9">名称</TableHead>
                  <TableHead className="h-9">标识 / 版本</TableHead>
                  <TableHead className="h-9 w-[72px]">高危</TableHead>
                  <TableHead className="h-9">来源平台</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((component) => (
                  <TableRow key={component.id}>
                    <TableCell className="py-2 font-medium">{component.componentName}</TableCell>
                    <TableCell className="py-2 text-muted-foreground">
                      {component.componentKey || '—'}
                      {component.version ? ` · ${component.version}` : ''}
                    </TableCell>
                    <TableCell className="py-2">
                      {component.highRisk ? (
                        <Badge variant="destructive">高危</Badge>
                      ) : (
                        <Badge variant="outline">否</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="secondary">{componentSourcePlatform(component)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {total > 0 ? (
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              itemLabels={{ singular: '个组件', plural: '个组件' }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function componentTypeLabel(type?: string | null) {
  return componentTypeOptions.find(([value]) => value === type)?.[1] || type || '组件';
}

function componentSourcePlatform(component: AgentAssetComponent) {
  const snapshot = component.configSnapshot;
  if (snapshot && typeof snapshot.sourcePlatform === 'string' && snapshot.sourcePlatform.trim()) {
    return snapshot.sourcePlatform;
  }
  if (
    component.sourceType &&
    !['manual', 'risk_library', 'capability_component'].includes(component.sourceType)
  ) {
    return component.sourceType;
  }
  return '自研';
}

function AssetProfileHero({
  asset,
  probe,
  highSignalCount,
  riskScore,
  scoreMeta,
  onEdit,
  onCreateDetection,
  onOpenRemediation,
}: {
  asset: AgentAsset;
  probe?: Record<string, unknown>;
  highSignalCount: number;
  riskScore: number;
  scoreMeta: { text: string; className: string };
  onEdit: () => void;
  onCreateDetection: () => void;
  onOpenRemediation: () => void;
}) {
  const intro =
    typeof asset.functionIntro === 'string' && asset.functionIntro.trim().length > 1
      ? asset.functionIntro.trim()
      : '集中查看 Agent 基础档案、接入配置、治理流程以及六域风险数据。';

  return (
    <Card className="gap-0 overflow-hidden border-blue-100/70 bg-gradient-to-br from-white via-slate-50/70 to-blue-50/40 py-0 shadow-sm dark:border-blue-900/40 dark:from-background dark:via-background dark:to-blue-950/20">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-muted-foreground">Agent 风险画像总览</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            编辑基础信息
          </Button>
          <Button variant="outline" size="sm" onClick={onCreateDetection}>
            <ScanSearch className="mr-2 h-4 w-4" />
            发起检测
          </Button>
          <Button size="sm" onClick={onOpenRemediation}>
            风险闭环
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_10px_24px_rgba(79,124,255,0.25)] ring-1 ring-white/30">
            <Bot className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-2xl font-bold leading-tight tracking-tight">{asset.name}</h2>
            <p className="mt-1 font-mono text-xs text-blue-600">
              {asset.assetCode} / {asset.platformFamily} / {asset.version || '未设置版本'}
            </p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{intro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full border px-2.5 py-1 text-xs',
                  admissionChipClass(asset.admissionStatus),
                )}
              >
                准入：{ledgerAdmissionLabel(asset.admissionStatus)}
              </span>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                环境：{labelFrom(environmentOptions, asset.environment)}
              </span>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                状态：{ledgerRuntimeLabel(asset.runtimeStatus)}
              </span>
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                连通性：{probe?.status === 'success' ? '已联通' : probe ? '未联通' : '未测试'}
              </span>
              {highSignalCount > 0 && (
                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700">
                  高危信号：{highSignalCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border bg-gradient-to-b from-slate-50 to-white p-3 dark:from-muted/20 dark:to-background">
          <div className="text-[10px] font-medium text-muted-foreground">综合风险指数</div>
          <div className="mt-1 flex items-end gap-1">
            <span className="text-3xl font-extrabold leading-none text-amber-600 tabular-nums">
              {riskScore}
            </span>
            <span className="pb-0.5 text-xs text-muted-foreground">/100</span>
          </div>
          <span
            className={cn(
              'mt-1.5 inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px]',
              scoreMeta.className,
            )}
          >
            {scoreMeta.text}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function AssetProfilePanel({
  asset,
  onEdit,
  onEditSection,
  onCreateDetection,
  className,
}: {
  asset: AgentAsset;
  onEdit: () => void;
  onEditSection: (section: ProfileConfigSection) => void;
  onCreateDetection: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeAnchor, setActiveAnchor] = useState<string>('profile-risk');
  const [activeRiskDomain, setActiveRiskDomain] = useState<RiskProfileDomain>('dialog');
  const [selectedRisk, setSelectedRisk] = useState<EnrichedRiskRow | null>(null);
  const [activeComponentType, setActiveComponentType] =
    useState<AgentAssetComponentType>('tool');

  const remediationsQuery = useQuery({
    queryKey: ['security-remediations', 'asset-profile', asset.id],
    queryFn: () => detectionScanningApi.listRemediations({ limit: 200 }),
  });
  const findingsQuery = useQuery({
    queryKey: ['security-scan-findings', 'asset-profile', asset.id],
    queryFn: () => detectionScanningApi.listFindings({ limit: 200 }),
  });
  const tasksQuery = useQuery({
    queryKey: ['security-scan-tasks', 'asset-profile', asset.id],
    queryFn: () => detectionScanningApi.listTasks({ limit: 200 }),
  });

  const riskRows = useMemo(() => {
    const enriched = enrichRemediationRows(
      remediationsQuery.data?.data || [],
      findingsQuery.data?.data || [],
      (tasksQuery.data?.data || []).filter((task) => task.source !== 'risk_retest'),
    );
    return filterClosedLoopProductionRows(enriched).filter((row) => rowMatchesAsset(row, asset));
  }, [asset, remediationsQuery.data?.data, findingsQuery.data?.data, tasksQuery.data?.data]);

  const openRiskRows = useMemo(
    () => riskRows.filter((row) => !isClosedDisplayStatus(row.displayStatus)),
    [riskRows],
  );

  const openRowsByDomain = useMemo(() => {
    const grouped = Object.fromEntries(
      RISK_DOMAINS.map((domain) => [domain.id, [] as EnrichedRiskRow[]]),
    ) as Record<RiskProfileDomain, EnrichedRiskRow[]>;
    for (const row of openRiskRows) {
      grouped[classifyRiskProfileDomain(row)].push(row);
    }
    return grouped;
  }, [openRiskRows]);

  const riskScore = computeRiskScore(openRiskRows);
  const scoreMeta = riskScoreLabel(riskScore);
  const highSignalCount = openRiskRows.filter(
    (row) => row.riskLevel === 'critical' || row.riskLevel === 'high',
  ).length;
  const activeDomain = RISK_DOMAINS.find((domain) => domain.id === activeRiskDomain) || RISK_DOMAINS[0];
  const activeDomainRows = openRowsByDomain[activeRiskDomain] || [];

  const runtimeConfig = runtimeConfigOf(asset);
  const probe = probeOf(runtimeConfig);
  const configFiles = configFilesOf(asset);
  const counts = countComponents(asset);
  const runtimeFields = runtimeTypeFields(runtimeConfig);
  const lastDetect =
    assetMetadataText(asset, ['lastDetect', 'lastDetectedAt', 'lastDetectionAt']) ||
    asset.events?.find((event) => event.eventType.includes('detect'))?.createdAt;
  const nextDetect =
    assetMetadataText(asset, ['nextDetect', 'nextDetectAt', 'nextDetectionAt']) || '未设置';
  const risksLoading =
    remediationsQuery.isLoading || findingsQuery.isLoading || tasksQuery.isLoading;

  const openRiskInWorkbench = (row: EnrichedRiskRow) => {
    setSelectedRisk(row);
  };

  const probeMutation = useMutation({
    mutationFn: async () => {
      const result = await assetIntakeApi.probeRuntime(probePayloadFromAsset(asset));
      const checkedAt = new Date().toISOString();
      await assetIntakeApi.updateAgent(asset.id, {
        metadata: {
          ...(asset.metadata || {}),
          runtimeConfig: {
            ...runtimeConfig,
            enabled: true,
            lastProbe: { ...result, checkedAt },
            lastConnTest: checkedAt,
            connMsg: result.message,
          },
        },
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['asset-agent', asset.id] });
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] });
      if (result.status === 'success') {
        toast.success(result.message || '联通性测试通过');
      } else {
        toast.error(result.message || '联通性测试失败');
      }
    },
    onError: (error: Error) => toast.error(error.message || '联通性测试失败'),
  });

  return (
    <div className={cn('grid gap-4', className)}>
      <AssetProfileHero
        asset={asset}
        probe={probe}
        highSignalCount={highSignalCount}
        riskScore={riskScore}
        scoreMeta={scoreMeta}
        onEdit={onEdit}
        onCreateDetection={onCreateDetection}
        onOpenRemediation={() =>
          navigate({
            to: '/scan/remediation',
            search: { tab: 'workbench', taskId: undefined, riskId: undefined },
          })
        }
      />

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <Card className="h-fit gap-0 overflow-hidden py-0 shadow-sm lg:sticky lg:top-20">
          <CardContent className="grid gap-1 p-3">
            <div className="border-b px-2 pb-2 pt-1 text-[10px] font-medium tracking-wider text-muted-foreground">
              资产详情
            </div>
            {PROFILE_ANCHORS.map((anchor) => (
              <button
                key={anchor.id}
                type="button"
                onClick={() => setActiveAnchor(anchor.id)}
                className={cn(
                  'rounded-lg border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-blue-50 hover:text-blue-700',
                  activeAnchor === anchor.id && 'border-blue-200 bg-blue-50 font-medium text-blue-700',
                )}
              >
                {anchor.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-4">
          <SectionCard
            id="profile-risk"
            title="风险详情"
            subtitle={`未关闭风险 ${openRiskRows.length} 项 · ${activeDomain.subtitle}`}
            className={activeAnchor !== 'profile-risk' ? 'hidden' : undefined}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: '/scan/remediation',
                    search: { tab: 'workbench', taskId: undefined, riskId: undefined },
                  })
                }
              >
                前往风险闭环工作台
              </Button>
            }
          >
            <RiskDomainTabs
              activeDomain={activeRiskDomain}
              openRowsByDomain={openRowsByDomain}
              onChange={setActiveRiskDomain}
            />
            {risksLoading ? (
              <div className="grid gap-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : activeDomainRows.length > 0 ? (
              <RiskProfileList
                rows={activeDomainRows}
                domainId={activeRiskDomain}
                onOpen={openRiskInWorkbench}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                当前域暂无未关闭风险
                {openRiskRows.length > 0 ? '，可切换其他风险域查看' : '，可发起检测任务后在工作台确认推送'}
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="profile-basic"
            title="基础信息"
            subtitle="资产编号、类型、场景与生命周期"
            className={activeAnchor !== 'profile-basic' ? 'hidden' : undefined}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoCell label="资产编号" value={<span className="font-mono text-blue-600">{asset.assetCode}</span>} />
              <InfoCell label="平台类型" value={asset.platformFamily || '未设置'} />
              <InfoCell label="当前版本" value={asset.version || '未设置'} />
              <InfoCell label="Agent 类型" value={labelFrom(agentTypeOptions, asset.agentType)} />
              <InfoCell label="业务场景" value={asset.businessScene || '未设置'} />
              <InfoCell label="生命周期" value={asset.lifecycleStatus || '未设置'} />
              <InfoCell label="部署环境" value={labelFrom(environmentOptions, asset.environment)} />
              <InfoCell label="暴露级别" value={labelFrom(exposureOptions, asset.exposureLevel)} />
              <InfoCell label="功能介绍" value={asset.functionIntro || '未设置'} className="md:col-span-2 xl:col-span-4" />
              <InfoCell label="暴露面说明" value={asset.exposureSurface || '未设置'} className="md:col-span-2 xl:col-span-4" />
            </div>
          </SectionCard>

          <SectionCard
            id="profile-owner"
            title="归属与负责人"
            subtitle="部门、业务系统与各角色负责人"
            className={activeAnchor !== 'profile-owner' ? 'hidden' : undefined}
            action={
              <Button variant="outline" size="sm" onClick={() => onEditSection('ownership')}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑配置
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <PortraitLine label="所属部门" value={ownerByType(asset, 'business')?.department || '未设置'} />
              <PortraitLine label="业务系统" value={asset.businessSystem || '未设置'} />
              <PortraitLine label="业务场景" value={asset.businessScene || '未设置'} />
              <PortraitLine label="平台类型" value={asset.platformFamily || '未设置'} />
              <PortraitLine label="业务负责人" value={ownerDisplay(asset, 'business')} />
              <PortraitLine label="开发负责人" value={ownerDisplay(asset, 'developer')} />
              <PortraitLine label="安全负责人" value={ownerDisplay(asset, 'security')} />
              <PortraitLine label="运维负责人" value={ownerDisplay(asset, 'ops')} />
            </div>
          </SectionCard>

          <SectionCard
            id="profile-access"
            title="接入配置"
            subtitle="API、凭据与连接器参数"
            className={activeAnchor !== 'profile-access' ? 'hidden' : undefined}
            action={
              <Button variant="outline" size="sm" onClick={() => onEditSection('access')}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑配置
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <PortraitLine label="接入方式" value={accessMethodLabel(runtimeConfig)} />
              <PortraitLine label="连接器类型" value={runtimeConnectorLabel(runtimeConfig, asset)} />
              <PortraitLine label="Base URL" value={displayUnknown(runtimeConfig.apiBaseUrl)} />
              <PortraitLine label="调用入口" value={runtimeEndpoint(runtimeConfig)} />
              <PortraitLine
                label="鉴权方式"
                value={displayUnknown(runtimeConfig.authType || runtimeConfig.authHeaderName, '未配置')}
              />
              <PortraitLine
                label="凭据状态"
                value={maskSecret(
                  runtimeConfig.apiKey ||
                    runtimeConfig.tencentSecretId ||
                    runtimeConfig.tencentSecretKey,
                )}
              />
              {runtimeFields.map(([label, value]) => (
                <PortraitLine key={label} label={label} value={value} />
              ))}
              <PortraitLine
                label="配置文件"
                value={configFiles.length ? `${configFiles.length} 个配置附件` : '未上传'}
              />
            </div>
          </SectionCard>

          <SectionCard
            id="profile-connect"
            title="连通性说明"
            subtitle="最近一次联通性测试结果"
            className={activeAnchor !== 'profile-connect' ? 'hidden' : undefined}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={probeMutation.isPending}
                  onClick={() => probeMutation.mutate()}
                >
                  {probeMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="mr-2 h-4 w-4" />
                  )}
                  {probeMutation.isPending ? '测试中...' : '测试联通性'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEditSection('connectivity')}>
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑配置
                </Button>
              </div>
            }
          >
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {connectionStatusBadge(probe)}
                <span className="text-xs text-muted-foreground">
                  {displayUnknown(
                    probe?.checkedAt || runtimeConfig.lastConnTest || runtimeConfig.updatedAt,
                    '尚未执行联通性测试',
                  )}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <PortraitLine
                  label="测试端点"
                  value={displayUnknown(probe?.endpoint || runtimeEndpoint(runtimeConfig), '未返回 endpoint')}
                />
                <PortraitLine
                  label="响应耗时"
                  value={
                    probe?.durationMs || probe?.responseTime
                      ? `${displayUnknown(probe.durationMs || probe.responseTime)}ms`
                      : '未记录'
                  }
                />
                <PortraitLine
                  label="HTTP 状态"
                  value={probe?.httpStatus ? `HTTP ${displayUnknown(probe.httpStatus)}` : '未记录'}
                />
                <PortraitLine label="测试指令" value={displayUnknown(runtimeConfig.testPrompt)} />
              </div>
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
                <div className="font-medium text-foreground">
                  {displayUnknown(probe?.message || runtimeConfig.connMsg, '尚未执行联通性测试')}
                </div>
                {Boolean(probe?.preview) && (
                  <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
                    {displayUnknown(probe?.preview)}
                  </pre>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="profile-governance"
            title="治理与检测"
            subtitle="运行状态、放行结论与检测计划"
            className={activeAnchor !== 'profile-governance' ? 'hidden' : undefined}
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onCreateDetection}>
                  <ScanSearch className="mr-2 h-4 w-4" />
                  发起检测
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEditSection('governance')}>
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑配置
                </Button>
              </div>
            }
          >
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="运行状态" value={ledgerRuntimeLabel(asset.runtimeStatus)} />
                <InfoCell label="放行结论" value={ledgerAdmissionLabel(asset.admissionStatus)} />
                <InfoCell label="风险等级" value={labelFrom(riskOptions, asset.riskLevel)} />
                <InfoCell label="未关闭风险" value={`${openRiskRows.length} 项`} />
                <InfoCell label="高危信号" value={`${highSignalCount} 项`} />
                <InfoCell label="最近检测" value={lastDetect ? formatAssetTime(lastDetect) : '未记录'} />
                <InfoCell label="下次应检" value={nextDetect} />
                <InfoCell label="风险指数" value={`${riskScore} / 100`} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="profile-portrait"
            title="能力组件"
            subtitle={`按类型查看已挂载组件 · 共 ${asset.components?.length || 0} 个`}
            className={activeAnchor !== 'profile-portrait' ? 'hidden' : undefined}
          >
            <div className="mb-3 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1">
              {componentTypeOptions.map(([type, label]) => {
                const count = counts[type] || 0;
                const active = activeComponentType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveComponentType(type)}
                    className={cn(
                      'flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-2 text-xs text-muted-foreground transition hover:text-foreground sm:text-sm',
                      active && 'bg-background font-medium text-blue-600 shadow-sm',
                      !active && count === 0 && 'opacity-60',
                    )}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] font-normal tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <ComponentProfileList asset={asset} activeType={activeComponentType} />
          </SectionCard>

          <SectionCard
            id="profile-timeline"
            title="生命周期事件"
            subtitle="资产登记后的关键事件记录"
            className={activeAnchor !== 'profile-timeline' ? 'hidden' : undefined}
          >
            <LifecycleEventList events={asset.events || []} />
          </SectionCard>
        </div>
      </div>

      <RiskDetailDrawer
        row={selectedRisk}
        open={Boolean(selectedRisk)}
        onClose={() => setSelectedRisk(null)}
        onGoTask={(taskId) =>
          navigate({
            to: '/scan/remediation',
            search: { tab: 'workbench', taskId, riskId: undefined },
          })
        }
      />
    </div>
  );
}
