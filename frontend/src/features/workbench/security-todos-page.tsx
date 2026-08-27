/**
 * My Todos workbench — table layout (aligned with dynamic probe list).
 */

import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { cn } from '@/lib/utils';
import { useCockpitData } from '@/features/dashboard/hooks/use-cockpit-data';
import { admissionLabel } from '@/features/dashboard/lib/cockpit-metrics';
import {
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  isClosedDisplayStatus,
  type EnrichedRiskRow,
  type RiskDisplayStatus,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';

type TodoTab = 'all' | 'urgent' | 'governance' | 'remediation';
type TodoKind = 'intake' | 'admission' | 'remediation';
type TodoPriority = 'urgent' | 'watch' | 'normal';

type WorkItem = {
  id: string;
  kind: TodoKind;
  /** Short risk / asset title */
  title: string;
  /** Agent / platform object */
  subject: string;
  /** Plain-language next step */
  nextStepZh: string;
  nextStepEn: string;
  /** Button label */
  ctaZh: string;
  ctaEn: string;
  priority: TodoPriority;
  updatedAt?: string | null;
  onOpen: () => void;
};

const PASSED_ADMISSION = new Set(['passed', 'conditional_passed']);

const navClass =
  'text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
const navActiveClass = 'bg-muted text-foreground';

const TABS: { id: TodoTab; labelZh: string; labelEn: string }[] = [
  { id: 'all', labelZh: '全部', labelEn: 'All' },
  { id: 'urgent', labelZh: '紧急', labelEn: 'Urgent' },
  { id: 'governance', labelZh: '资产治理', labelEn: 'Governance' },
  { id: 'remediation', labelZh: '风险整改', labelEn: 'Remediation' },
];

function isOverdue(dueAt?: string | null): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

function priorityRank(p: TodoPriority): number {
  if (p === 'urgent') return 0;
  if (p === 'watch') return 1;
  return 2;
}

function relative(iso: string | null | undefined, isZh: boolean): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: isZh ? zhCN : enUS,
    });
  } catch {
    return '—';
  }
}

function remediationMeta(row: EnrichedRiskRow): {
  nextStepZh: string;
  nextStepEn: string;
  ctaZh: string;
  ctaEn: string;
  priority: TodoPriority;
} {
  const overdue = isOverdue(row.dueAt);
  const status: RiskDisplayStatus = row.displayStatus;
  const critical = row.riskLevel === 'critical';
  const high = row.riskLevel === 'high';

  if (status === 'pending_confirm') {
    return {
      nextStepZh: '确认风险是否成立',
      nextStepEn: 'Confirm if risk is valid',
      ctaZh: '去确认',
      ctaEn: 'Confirm',
      priority: overdue || critical ? 'urgent' : 'watch',
    };
  }
  if (status === 'pending_retest') {
    return {
      nextStepZh: '安排复测验证',
      nextStepEn: 'Schedule retest',
      ctaZh: '去复测',
      ctaEn: 'Retest',
      priority: overdue || critical ? 'urgent' : 'watch',
    };
  }
  if (status === 'retest_failed') {
    return {
      nextStepZh: '复测未通过，重新整改',
      nextStepEn: 'Retest failed — fix again',
      ctaZh: '重新整改',
      ctaEn: 'Fix again',
      priority: 'urgent',
    };
  }
  if (overdue) {
    return {
      nextStepZh: '已超处理时限，马上整改',
      nextStepEn: 'Past SLA — fix now',
      ctaZh: '立刻整改',
      ctaEn: 'Fix now',
      priority: 'urgent',
    };
  }
  if (critical) {
    return {
      nextStepZh: '严重风险，优先整改',
      nextStepEn: 'Critical — prioritize fix',
      ctaZh: '去整改',
      ctaEn: 'Remediate',
      priority: 'urgent',
    };
  }
  if (high) {
    return {
      nextStepZh: '高危风险，尽快整改',
      nextStepEn: 'High risk — fix soon',
      ctaZh: '去整改',
      ctaEn: 'Remediate',
      priority: 'watch',
    };
  }
  if (status === 'in_progress') {
    return {
      nextStepZh: '继续推进直到关闭',
      nextStepEn: 'Continue until closed',
      ctaZh: '继续整改',
      ctaEn: 'Continue',
      priority: 'normal',
    };
  }
  return {
    nextStepZh: '提交整改并推进关闭',
    nextStepEn: 'Submit fix and close',
    ctaZh: '去整改',
    ctaEn: 'Remediate',
    priority: 'normal',
  };
}

export function SecurityTodosPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TodoTab>('all');
  const {
    isLoading,
    assets,
    discovered,
    discoveredPending,
    remediations,
    findings,
    scanTasks,
  } = useCockpitData('30d');

  const items = useMemo((): WorkItem[] => {
    const openRows = filterClosedLoopProductionRows(
      enrichRemediationRows(remediations, findings, scanTasks),
    ).filter((r) => !isClosedDisplayStatus(r.displayStatus));

    const remItems: WorkItem[] = openRows.map((row) => {
      const meta = remediationMeta(row);
      return {
        id: `rem-${row.id}`,
        kind: 'remediation',
        title: row.title,
        subject: row.agentName || '—',
        nextStepZh: meta.nextStepZh,
        nextStepEn: meta.nextStepEn,
        ctaZh: meta.ctaZh,
        ctaEn: meta.ctaEn,
        priority: meta.priority,
        updatedAt: row.dueAt || row.updatedAt,
        onOpen: () => {
          void navigate({
            to: '/scan/remediation',
            search: {
              tab: 'workbench',
              taskId: row.taskId || undefined,
              riskId: row.id,
            },
          });
        },
      };
    });

    const admissionItems: WorkItem[] = assets
      .filter((a) => !PASSED_ADMISSION.has(a.admissionStatus))
      .map((a) => {
        const blocked = a.admissionStatus === 'failed' || a.admissionStatus === 'blocked';
        const statusZh = admissionLabel(a.admissionStatus, true);
        const statusEn = admissionLabel(a.admissionStatus, false);
        return {
          id: `adm-${a.id}`,
          kind: 'admission' as const,
          title: a.name,
          subject: a.name,
          nextStepZh: blocked
            ? `准入${statusZh}，补检测或整改后放行`
            : `准入${statusZh}，继续推进放行`,
          nextStepEn: blocked
            ? `Admission ${statusEn} — detect/fix then release`
            : `Admission ${statusEn} — finish release`,
          ctaZh: '去完成准入',
          ctaEn: 'Finish admission',
          priority: (blocked ? 'urgent' : 'watch') as TodoPriority,
          updatedAt: a.updatedAt,
          onOpen: () => {
            void navigate({
              to: '/assets/ledger/$assetId/profile',
              params: { assetId: a.id },
            });
          },
        };
      });

    const intakeItems: WorkItem[] = discovered.map((d) => ({
      id: `intake-${d.id}`,
      kind: 'intake' as const,
      title: d.rawName,
      subject: d.platformFamily || (isZh ? '平台发现' : 'Discovery'),
      nextStepZh: '认领并纳入资产台账',
      nextStepEn: 'Claim into asset ledger',
      ctaZh: '去认领',
      ctaEn: 'Claim',
      priority: 'watch' as TodoPriority,
      updatedAt: d.discoveredAt || d.updatedAt,
      onOpen: () => {
        void navigate({ to: '/assets/discovered' });
      },
    }));

    if (discoveredPending > intakeItems.length) {
      intakeItems.push({
        id: 'intake-more',
        kind: 'intake',
        title: isZh
          ? `还有 ${discoveredPending - intakeItems.length} 项待认领`
          : `${discoveredPending - intakeItems.length} more to claim`,
        subject: isZh ? '入库待办' : 'Asset intake',
        nextStepZh: '打开入库列表继续认领',
        nextStepEn: 'Open intake list to continue',
        ctaZh: '查看全部',
        ctaEn: 'View all',
        priority: 'watch',
        updatedAt: null,
        onOpen: () => {
          void navigate({ to: '/assets/discovered' });
        },
      });
    }

    return [...remItems, ...admissionItems, ...intakeItems].sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
    );
  }, [
    assets,
    discovered,
    discoveredPending,
    remediations,
    findings,
    scanTasks,
    navigate,
    isZh,
  ]);

  const filtered = useMemo(() => {
    if (tab === 'urgent') return items.filter((i) => i.priority === 'urgent');
    if (tab === 'governance') {
      return items.filter((i) => i.kind === 'intake' || i.kind === 'admission');
    }
    if (tab === 'remediation') return items.filter((i) => i.kind === 'remediation');
    return items;
  }, [items, tab]);

  const urgentCount = items.filter((i) => i.priority === 'urgent').length;

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <nav
          className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3"
          aria-label={tr('My todos navigation', '我的待办导航')}
        >
          {TABS.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(navClass, isActive ? navActiveClass : '')}
              >
                {tr(item.labelEn, item.labelZh)}
                {item.id === 'urgent' && urgentCount > 0 ? (
                  <span className="text-destructive ms-1.5 tabular-nums">{urgentCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mb-8 flex items-start gap-3">
          <ClipboardList className="size-9 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {tr('My Todos', '我的待办')}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              {tr(
                'Handle intake, admission, and open risks. Use “Next step” then the action button.',
                '处理入库、准入与未关闭风险。先看「下一步」，再点操作按钮。',
              )}
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-6 border-t pt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight">
                {tr('Todo workbench', '待办工作台')}
              </h2>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                {isLoading
                  ? tr('Loading…', '加载中…')
                  : tr(
                      `${filtered.length} items in this view · ${items.length} total`,
                      `本视图 ${filtered.length} 项 · 合计 ${items.length} 项`,
                    )}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                void navigate({
                  to: '/scan/remediation',
                  search: { tab: 'workbench', taskId: undefined, riskId: undefined },
                })
              }
            >
              {tr('Open risk closed-loop', '打开风险闭环')}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">{tr('Item', '事项')}</TableHead>
                  <TableHead>{tr('Related to', '关联对象')}</TableHead>
                  <TableHead className="min-w-[180px]">{tr('Next step', '下一步')}</TableHead>
                  <TableHead>{tr('Priority', '优先级')}</TableHead>
                  <TableHead className="w-[120px] text-right">{tr('Actions', '操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                      {tab === 'urgent'
                        ? tr('No urgent todos.', '暂无紧急待办。')
                        : tr('No todos in this view.', '该视图暂无待办。')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => (
                    <TableRow key={item.id} className="hover:bg-accent/40">
                      <TableCell className="min-w-[220px]">
                        <div className="line-clamp-2 font-medium" title={item.title}>
                          {item.title}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {item.kind === 'remediation'
                              ? tr('Risk', '风险')
                              : item.kind === 'admission'
                                ? tr('Admission', '准入')
                                : tr('Intake', '入库')}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {relative(item.updatedAt, isZh)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[160px] truncate font-medium">{item.subject}</div>
                      </TableCell>
                      <TableCell className="min-w-[180px] text-sm">
                        {isZh ? item.nextStepZh : item.nextStepEn}
                      </TableCell>
                      <TableCell>
                        {item.priority === 'urgent' ? (
                          <Badge variant="destructive">{tr('Urgent', '紧急')}</Badge>
                        ) : item.priority === 'watch' ? (
                          <Badge>{tr('Watch', '关注')}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={item.onOpen}
                        >
                          {isZh ? item.ctaZh : item.ctaEn}
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Main>
    </>
  );
}
