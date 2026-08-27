import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ScanSearch, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AgentAsset, AgentAssetComponentType } from '@/types/entities';

const agentTypeLabels: Record<string, string> = {
  qa: '问答型',
  task: '任务型',
  tool: '工具型',
  workflow: '流程型',
  multi_agent: '多智能体型',
};

const environmentLabels: Record<string, string> = {
  dev: '开发',
  test: '测试',
  staging: '预生产',
  prod: '生产',
};

const riskLabels: Record<string, string> = {
  normal: '正常',
  low: '低危',
  medium: '中危',
  high: '高危',
  critical: '严重',
};

const riskTone: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  low: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const admissionTone: Record<string, string> = {
  not_checked: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  passed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  checking: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  retest: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  conditional_passed: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

const admissionLabels: Record<string, string> = {
  not_checked: '未测试',
  failed: '需整改',
  passed: '通过',
  checking: '检测中',
  retest: '待复测',
  conditional_passed: '条件通过',
};

function ledgerRuntimeLabel(value?: string | null) {
  if (value === 'running') {
    return '已上线';
  }
  if (value === 'not_launched') {
    return '未上线';
  }
  if (value === 'offline') {
    return '已下线';
  }
  return value || '未上线';
}

function metadataNumber(asset: AgentAsset, keys: string[]) {
  const metadata = asset.metadata || {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function metadataText(asset: AgentAsset, keys: string[]) {
  const metadata = asset.metadata || {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function countComponents(asset: AgentAsset, type: AgentAssetComponentType) {
  return asset.components?.filter((item) => item.componentType === type).length ?? 0;
}

function primaryDepartment(asset: AgentAsset) {
  return (
    asset.owners?.find((owner) => owner.isPrimary)?.department ||
    asset.owners?.[0]?.department ||
    '未设置'
  );
}

function formatLastDetect(value?: string | null) {
  if (!value) {
    return '未记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

type AssetLedgerDrawerProps = {
  asset: AgentAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AssetLedgerDrawer({ asset, open, onOpenChange }: AssetLedgerDrawerProps) {
  if (!asset) {
    return null;
  }

  const openRiskCount =
    metadataNumber(asset, ['openRiskCount', 'openRisks', 'riskOpenCount']) ?? 0;
  const lastDetect =
    metadataText(asset, ['lastDetect', 'lastDetectedAt', 'lastDetectionAt']) ||
    asset.events?.find((event) => event.eventType.includes('detect'))?.createdAt;
  const nextDetect = metadataText(asset, ['nextDetectDue', 'nextDetectionDue']) || '—';
  const toolCount = countComponents(asset, 'tool');
  const skillCount = countComponents(asset, 'skill');
  const mcpCount = countComponents(asset, 'mcp');
  const kbCount = countComponents(asset, 'knowledge_base');
  const hasMemory = Boolean(metadataText(asset, ['hasMemory', 'memoryEnabled']));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="text-lg">{asset.name}</SheetTitle>
          <SheetDescription asChild>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-xs">{asset.assetCode || asset.id}</span>
              {' · '}
              {asset.platformFamily || '未设置'}
              {' · '}
              {agentTypeLabels[asset.agentType] || asset.agentType}
              {' · '}
              {primaryDepartment(asset)}
            </p>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <Badge className={cn('mb-1', riskTone[asset.riskLevel] || '')} variant="secondary">
                {riskLabels[asset.riskLevel] || asset.riskLevel}
              </Badge>
              <div className="text-xs text-muted-foreground">风险等级</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <div className="mb-1 text-sm font-semibold">
                {ledgerRuntimeLabel(asset.runtimeStatus)}
              </div>
              <div className="text-xs text-muted-foreground">运行状态</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <Badge
                className={cn('mb-1', admissionTone[asset.admissionStatus] || '')}
                variant="secondary"
              >
                {admissionLabels[asset.admissionStatus] || asset.admissionStatus}
              </Badge>
              <div className="text-xs text-muted-foreground">放行结论</div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {asset.version || '—'} · {environmentLabels[asset.environment] || asset.environment} ·
            下次应检 {nextDetect} · 最近检测 {formatLastDetect(lastDetect)}
          </p>

          <div>
            <h4 className="mb-2 text-sm font-semibold">功能介绍</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {asset.functionIntro?.trim() || '暂无功能介绍，可在治理档案中补充。'}
            </p>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">能力挂载</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">工具 {toolCount}</Badge>
              <Badge variant="outline">Skill {skillCount}</Badge>
              <Badge variant="outline">MCP {mcpCount}</Badge>
              <Badge variant="outline">知识库 {kbCount}</Badge>
              <Badge variant="outline">记忆 {hasMemory ? '已启用' : '未启用'}</Badge>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <ShieldAlert className="size-4 text-orange-600" />
              <span>
                未关闭风险 <strong>{openRiskCount}</strong>
              </span>
            </div>
            {openRiskCount > 0 ? (
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link
                  to="/scan/remediation"
                  search={{ tab: 'workbench', taskId: undefined, riskId: undefined }}
                >
                  去整改
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Button variant="default" asChild>
              <Link
                to="/assets/ledger/$assetId/profile"
                params={{ assetId: asset.id }}
                onClick={() => onOpenChange(false)}
              >
                查看治理档案
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/scan/technical-risks" onClick={() => onOpenChange(false)}>
                <ScanSearch className="mr-2 size-4" />
                发起检测
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
