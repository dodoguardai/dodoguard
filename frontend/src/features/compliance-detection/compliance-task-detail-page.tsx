import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ClipboardCheck, Play, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Shell } from '@/features/compliance-case-library/shared';
import { ComplianceReportOverlay } from '@/features/compliance-detection/compliance-report-overlay';
import {
  complianceScanStatusClass,
  complianceScanStatusText,
  readComplianceScanStatus,
  readComplianceTaskDomain,
} from '@/features/compliance-detection/compliance-task-shared';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityScanFinding } from '@/types/entities';

type DetailTab = 'overview' | 'cases' | 'report';

type ComplianceTaskDetailPageProps = {
  taskId: string;
  tab: DetailTab;
};

function StatusBadge({ status }: { status: ReturnType<typeof readComplianceScanStatus> }) {
  return (
    <Badge
      variant="outline"
      className={complianceScanStatusClass[status] ?? complianceScanStatusClass.pending}
    >
      {complianceScanStatusText[status] ?? status}
    </Badge>
  );
}

function riskLabel(level: string): string {
  if (level === 'high') {
    return '高';
  }
  if (level === 'medium') {
    return '中';
  }
  if (level === 'low') {
    return '低';
  }
  return level;
}

function riskClass(level: string): string {
  if (level === 'high') {
    return 'border-orange-200 text-orange-700';
  }
  if (level === 'medium') {
    return 'border-amber-200 text-amber-700';
  }
  return 'border-emerald-200 text-emerald-700';
}

function readFindingInputSummary(finding: SecurityScanFinding): string {
  const evidence = finding.evidence;
  if (evidence && typeof evidence.input === 'string' && evidence.input.trim()) {
    return evidence.input;
  }
  if (evidence && typeof evidence.prompt === 'string' && evidence.prompt.trim()) {
    return evidence.prompt;
  }
  return finding.description.slice(0, 80);
}

function readFindingRegClause(finding: SecurityScanFinding): string {
  const evidence = finding.evidence;
  if (evidence && typeof evidence.regClause === 'string' && evidence.regClause.trim()) {
    return evidence.regClause;
  }
  const metadata = evidence?.metadata;
  if (metadata && typeof metadata === 'object' && metadata !== null) {
    const clause = (metadata as Record<string, unknown>).regClause;
    if (typeof clause === 'string' && clause.trim()) {
      return clause;
    }
  }
  return '—';
}

function isViolationFinding(finding: SecurityScanFinding): boolean {
  const evidence = finding.evidence;
  if (evidence && typeof evidence.passed === 'boolean') {
    return !evidence.passed;
  }
  return finding.status === 'open';
}

export function ComplianceTaskDetailPage({ taskId, tab }: ComplianceTaskDetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>(tab);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  const taskQuery = useQuery({
    queryKey: ['compliance-task', taskId],
    queryFn: () => detectionScanningApi.getTask(taskId),
  });

  const findingsQuery = useQuery({
    queryKey: ['compliance-task-findings', taskId],
    queryFn: () => detectionScanningApi.listFindings({ taskId, limit: 100 }),
  });

  const librariesQuery = useQuery({
    queryKey: ['compliance-case-libraries', 'task-detail'],
    queryFn: () => detectionScanningApi.listAllCaseLibraries({ category: 'compliance' }),
  });

  const runMutation = useMutation({
    mutationFn: () =>
      detectionScanningApi.executeTask(taskId, {
        mode: 'manual',
        generateFindings: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-task-findings', taskId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-scan-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['security-remediations'] });
      toast.success('合规检测已重新执行');
    },
    onError: (error: Error) => toast.error(error.message || '任务执行失败'),
  });

  const task = taskQuery.data;
  const findings = findingsQuery.data?.data ?? [];
  const libraries = librariesQuery.data?.data ?? [];

  const status = task ? readComplianceScanStatus(task) : 'pending';
  const domain = task ? readComplianceTaskDomain(task) : '通用合规';
  const metadata = task?.metadata ?? {};
  const taskDescription =
    typeof metadata.taskDescription === 'string' && metadata.taskDescription.trim()
      ? metadata.taskDescription
      : '—';

  const libIds = task?.plans?.flatMap((plan) => plan.libIds ?? []) ?? [];
  const linkedLibraries = useMemo(
    () => libraries.filter((lib) => libIds.includes(lib.id)),
    [libraries, libIds],
  );

  const violationFindings = useMemo(() => findings.filter(isViolationFinding), [findings]);
  const compliantCount = findings.length - violationFindings.length;

  const switchTab = (nextTab: DetailTab) => {
    setActiveTab(nextTab);
    navigate({
      to: '/scan/compliance-tasks/$taskId',
      params: { taskId },
      search: { panel: undefined },
      replace: true,
    });
  };

  if (taskQuery.isLoading) {
    return (
      <Shell>
        <p className="py-12 text-center text-sm text-muted-foreground">加载任务详情中…</p>
      </Shell>
    );
  }

  if (!task) {
    return (
      <Shell>
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">未找到该合规任务</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/scan/compliance-tasks">返回任务列表</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const reportConclusion =
    violationFindings.length === 0
      ? { label: '合规通过', className: 'border-emerald-200 text-emerald-700' }
      : task.highCount > 0
        ? { label: '存在高风险违规', className: 'border-red-200 text-red-700' }
        : { label: '存在合规风险', className: 'border-amber-200 text-amber-700' };

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2" asChild>
            <Link to="/scan/compliance-tasks">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回任务列表
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">{task.name}</h1>
            <StatusBadge status={status} />
            <Badge variant="outline" className="border-violet-200 text-violet-700">
              {domain}
            </Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{task.id}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Agent：{task.assetName || '未关联'}</span>
            <span>负责人：{task.ownerName || '未指派'}</span>
            <span>创建：{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== 'running' ? (
            <Button disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? (
                <RotateCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {status === 'pending' ? '运行' : '重新运行'}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => switchTab('report')}>
            报告
          </Button>
        </div>
      </div>

      <div className="mb-6 flex w-fit gap-2 rounded-[14px] bg-muted/50 p-1.5">
        {(
          [
            { id: 'overview', label: '总览' },
            { id: 'cases', label: '测试用例' },
            { id: 'report', label: '报告' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              'rounded-[10px] px-4 py-2 text-sm font-bold transition-colors',
              activeTab === item.id ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => switchTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[20px]">
            <CardHeader>
              <CardTitle>执行进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">进度</span>
                <span className="font-bold">{task.progress}%</span>
              </div>
              <Progress value={task.progress} />
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border p-3 text-center">
                  <div className="text-2xl font-black text-orange-600">{task.highCount}</div>
                  <div className="text-xs text-muted-foreground">高危</div>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <div className="text-2xl font-black text-amber-600">{task.mediumCount}</div>
                  <div className="text-xs text-muted-foreground">中危</div>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <div className="text-2xl font-black text-emerald-600">{task.lowCount}</div>
                  <div className="text-xs text-muted-foreground">低危</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[20px]">
            <CardHeader>
              <CardTitle>评估范围</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">{taskDescription}</p>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] lg:col-span-2">
            <CardHeader>
              <CardTitle>关联合规库</CardTitle>
            </CardHeader>
            <CardContent>
              {linkedLibraries.length ? (
                <div className="flex flex-wrap gap-2">
                  {linkedLibraries.map((lib) => (
                    <Badge key={lib.id} variant="outline">
                      {lib.title} · {lib.caseCount} 条
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无关联合规库</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'cases' ? (
        <Card className="rounded-[20px]">
          <CardHeader>
            <CardTitle>测试用例执行结果</CardTitle>
          </CardHeader>
          <CardContent>
            {findingsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">加载用例结果中…</p>
            ) : findings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无测试用例结果</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用例名</TableHead>
                    <TableHead>输入摘要</TableHead>
                    <TableHead>判定</TableHead>
                    <TableHead>风险等级</TableHead>
                    <TableHead>法规条款</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findings.map((finding) => {
                    const violation = isViolationFinding(finding);
                    return (
                      <TableRow key={finding.id}>
                        <TableCell className="font-medium">{finding.title}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {readFindingInputSummary(finding)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              violation
                                ? 'border-red-200 text-red-700'
                                : 'border-emerald-200 text-emerald-700'
                            }
                          >
                            {violation ? '违规' : '合规'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={riskClass(finding.riskLevel)}>
                            {riskLabel(finding.riskLevel)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {readFindingRegClause(finding)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'report' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" onClick={() => setReportOpen(true)}>
              查看完整报告
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="rounded-[20px]">
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-black">{findings.length}</div>
                <div className="mt-1 text-sm text-muted-foreground">执行用例数</div>
              </CardContent>
            </Card>
            <Card className="rounded-[20px]">
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-black text-emerald-600">{compliantCount}</div>
                <div className="mt-1 text-sm text-muted-foreground">合规项</div>
              </CardContent>
            </Card>
            <Card className="rounded-[20px]">
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-black text-red-600">{violationFindings.length}</div>
                <div className="mt-1 text-sm text-muted-foreground">违规项</div>
              </CardContent>
            </Card>
            <Card className="rounded-[20px]">
              <CardContent className="flex flex-col items-center justify-center pt-6">
                <Badge variant="outline" className={reportConclusion.className}>
                  {reportConclusion.label}
                </Badge>
                <div className="mt-2 text-sm text-muted-foreground">评估结论</div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[20px]">
            <CardHeader>
              <CardTitle>违规项列表</CardTitle>
            </CardHeader>
            <CardContent>
              {violationFindings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">暂无违规项</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用例</TableHead>
                      <TableHead>风险</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {violationFindings.map((finding) => (
                      <TableRow key={finding.id}>
                        <TableCell className="font-medium">{finding.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={riskClass(finding.riskLevel)}>
                            {riskLabel(finding.riskLevel)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {finding.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <Link
                to="/scan/remediation"
                search={{ tab: undefined, taskId: undefined, riskId: undefined }}
              >
                <ClipboardCheck className="mr-2 h-4 w-4" />
                前往风险闭环
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <ComplianceReportOverlay
        taskId={taskId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </Shell>
  );
}
