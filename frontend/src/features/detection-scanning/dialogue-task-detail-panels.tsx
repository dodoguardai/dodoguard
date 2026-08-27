import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isPatrolTask } from '@/features/launch-monitoring/patrol-utils';
import { cn } from '@/lib/utils';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import type { DetectionScanStatus, SecurityScanFinding, SecurityScanTask } from '@/types/entities';
import type {
  DialogueCaseRow,
  DialogueConclusionMeta,
  DialogueDetailTab,
  DialogueLibraryStatGroup,
  DialogueScoreMeta,
  DialogueTaskDetailStats,
} from './dialogue-task-detail-utils';
import {
  computePassRate,
  filterDialogueCases,
  formatCaseDuration,
  formatTranscriptForDisplay,
  isMultiTurnCaseRow,
  isMultiTurnFinding,
  paginateDialogueCases,
  readAssessScenarioLabel,
  readCreationModeLabel,
  readFindingTranscript,
  resolveTaskAttackLibraryLabel,
  resolveCaseActualOutputDisplay,
  resolveCasePromptDisplay,
  resolveFindingAttackTypeLabel,
  resolveFindingCaseName,
  resolveFindingJudgeModeLabel,
  resolveFindingLibraryTitle,
  resolveFindingRecommendationDisplay,
  resolveFindingSourceMeta,
} from './dialogue-task-detail-utils';

function riskBadgeClass(level?: string): string {
  if (level === 'critical' || level === 'high') {
    return 'border-red-200 text-red-700';
  }
  if (level === 'medium') {
    return 'border-amber-200 text-amber-700';
  }
  if (level === 'low') {
    return 'border-emerald-200 text-emerald-700';
  }
  return 'border-slate-200 text-slate-600';
}

function verdictBadgeClass(verdict: string): string {
  if (verdict === '通过') {
    return 'border-emerald-200 text-emerald-700';
  }
  if (verdict === '失败') {
    return 'border-red-200 text-red-700';
  }
  return 'border-slate-200 text-slate-600';
}

function clipCellText(value: string, max = 120): string {
  const text = value.trim();
  if (!text || text === '—') {
    return '—';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

function formatActualOutputText(value: string): string {
  const text = value.trim();
  if (!text || text === '—') {
    return '空响应';
  }
  return text;
}

function DialogueTablePagination({
  pageData,
  onPageChange,
}: {
  pageData: { page: number; pages: number; total: number };
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="cmp-td-pagination">
      <span className="mr-auto text-sm text-muted-foreground">共 {pageData.total} 条</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pageData.page <= 1}
        onClick={() => onPageChange(pageData.page - 1)}
      >
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">
        {pageData.page} / {pageData.pages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pageData.page >= pageData.pages}
        onClick={() => onPageChange(pageData.page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}

function riskLevelLabel(level?: string): string {
  if (level === 'critical' || level === 'high') {
    return '高危';
  }
  if (level === 'medium') {
    return '中危';
  }
  if (level === 'low') {
    return '低危';
  }
  return level || '—';
}

function DrawerKvRow({
  label,
  children,
  valueClassName,
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="cmp-drawer-kv-row">
      <div className="cmp-drawer-kv-label">{label}</div>
      <div className={cn('cmp-drawer-kv-value', valueClassName)}>{children}</div>
    </div>
  );
}

function DrawerScrollText({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('cmp-drawer-scroll-text', className)}>{children}</div>;
}

export function DialogueFindingDrawer({
  finding,
  open,
  onClose,
  container,
  libraryGroups,
}: {
  finding: SecurityScanFinding | null;
  open: boolean;
  onClose: () => void;
  container?: HTMLElement | null;
  libraryGroups?: DialogueLibraryStatGroup[];
}) {
  if (!open || !finding) {
    return null;
  }
  const evidence = finding.evidence || {};
  const judgeVerdict =
    evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
      ? (evidence.judgeVerdict as Record<string, unknown>)
      : null;
  const recommendation = resolveFindingRecommendationDisplay(finding);
  const caseName = resolveFindingCaseName(finding);
  const libraryTitle = resolveFindingLibraryTitle(finding, libraryGroups);
  const attackTypeLabel = resolveFindingAttackTypeLabel(finding);
  const sourceMeta = resolveFindingSourceMeta(finding);
  const isMultiTurn = isMultiTurnFinding(finding);
  const transcript = readFindingTranscript(finding);
  const expectedPass =
    typeof evidence.expectedPass === 'string' && evidence.expectedPass.trim()
      ? evidence.expectedPass.trim()
      : null;
  const expectedFail =
    typeof evidence.expectedFail === 'string' && evidence.expectedFail.trim()
      ? evidence.expectedFail.trim()
      : null;
  const judgeReason =
    typeof judgeVerdict?.reason === 'string' && judgeVerdict.reason.trim()
      ? judgeVerdict.reason.trim()
      : null;
  const promptText = typeof evidence.prompt === 'string' ? evidence.prompt : '—';
  const responseText =
    typeof evidence.responsePreview === 'string'
      ? formatDifyResponseForDisplay(evidence.responsePreview)
      : finding.description || '—';
  const executionRecord = transcript?.length ? formatTranscriptForDisplay(transcript) : responseText;

  const drawer = (
    <>
      <button
        type="button"
        className={cn('sec-rpt-v2-drawer-mask', open && 'show')}
        aria-label="关闭详情"
        onClick={onClose}
      />
      <aside className={cn('sec-rpt-v2-drawer', open && 'show')} aria-label="风险发现详情">
        <div className="sec-rpt-v2-drawer-head">
          <div className="sec-rpt-v2-drawer-head-main">
            <div className="sec-rpt-v2-drawer-tags">
              <Badge variant="outline" className={riskBadgeClass(finding.riskLevel)}>
                {riskLevelLabel(finding.riskLevel)}
              </Badge>
              <Badge variant="outline" className={sourceMeta.badgeClass}>
                {sourceMeta.label}
              </Badge>
              <Badge variant="outline" className="border-red-200 text-red-700">
                未通过
              </Badge>
              {isMultiTurn ? (
                <Badge variant="outline" className="border-blue-200 text-blue-700">
                  多轮对话
                </Badge>
              ) : null}
              {finding.remediationTaskId ? (
                <Badge
                  variant="secondary"
                  className="border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  已推送
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-200 text-amber-800">
                  待推送
                </Badge>
              )}
              {finding.evidence?.mode === 'dev_fallback' ? (
                <Badge variant="outline" className="border-slate-200 text-slate-600">
                  开发联调
                </Badge>
              ) : null}
            </div>
            <h2>{caseName}</h2>
            <p className="sec-rpt-v2-drawer-subtitle">{libraryTitle}</p>
          </div>
          <button type="button" className="sec-rpt-v2-close" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="sec-rpt-v2-drawer-body">
          <div className="cmp-drawer-kv">
            <div className="cmp-drawer-kv-section-title">风险概览</div>
            <DrawerKvRow label="检测类型">
              <Badge variant="outline" className={sourceMeta.badgeClass}>
                {sourceMeta.label}
              </Badge>
            </DrawerKvRow>
            <DrawerKvRow label="场景库">{libraryTitle}</DrawerKvRow>
            <DrawerKvRow label="攻击方式">{attackTypeLabel}</DrawerKvRow>
            <DrawerKvRow label="用例编号">
              {typeof evidence.caseCode === 'string' ? evidence.caseCode : '—'}
            </DrawerKvRow>
            <DrawerKvRow label="风险等级">
              <Badge variant="outline" className={riskBadgeClass(finding.riskLevel)}>
                {riskLevelLabel(finding.riskLevel)}
              </Badge>
            </DrawerKvRow>
            {typeof evidence.responseTimeMs === 'number' ? (
              <DrawerKvRow label="执行耗时">
                {formatCaseDuration(evidence.responseTimeMs)}
              </DrawerKvRow>
            ) : null}
            {expectedPass ? (
              <DrawerKvRow label="期望通过行为" valueClassName="cmp-drawer-kv-pass">
                <DrawerScrollText>{expectedPass}</DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {expectedFail ? (
              <DrawerKvRow label="期望拒绝表现" valueClassName="cmp-drawer-kv-fail">
                <DrawerScrollText>{expectedFail}</DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {judgeReason ? (
              <DrawerKvRow label="判定说明" valueClassName="cmp-drawer-kv-mono">
                <DrawerScrollText className="cmp-drawer-scroll-text-muted">
                  {judgeReason}
                </DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {recommendation ? (
              <DrawerKvRow label="整改建议" valueClassName="cmp-drawer-kv-mono">
                <DrawerScrollText className="cmp-drawer-scroll-text-muted">
                  {recommendation}
                </DrawerScrollText>
              </DrawerKvRow>
            ) : null}
          </div>

          <div className="cmp-drawer-kv">
            <div className="cmp-drawer-kv-section-title">执行详情</div>
            {isMultiTurn ? (
              <>
                <DrawerKvRow label="多轮攻击脚本" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">{promptText}</pre>
                </DrawerKvRow>
                <DrawerKvRow label="多轮执行记录" valueClassName="cmp-drawer-kv-mono">
                  {transcript?.length ? (
                    <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                      {executionRecord}
                    </pre>
                  ) : (
                    <span className="cmp-drawer-inline-note">
                      暂无各轮 Agent 回复记录。请重新执行该任务以查看完整多轮执行结果。
                    </span>
                  )}
                </DrawerKvRow>
              </>
            ) : (
              <>
                <DrawerKvRow label="测试输入" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">{promptText}</pre>
                </DrawerKvRow>
                <DrawerKvRow label="Agent 响应" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                    {responseText}
                  </pre>
                </DrawerKvRow>
              </>
            )}
          </div>

          {typeof evidence.apiStatus === 'number' ||
          typeof evidence.responseTimeMs === 'number' ||
          typeof evidence.judgeMode === 'string' ? (
            <div className="cmp-drawer-kv cmp-drawer-kv-secondary">
              <div className="cmp-drawer-kv-section-title">执行证据</div>
              {typeof evidence.apiStatus === 'number' ? (
                <DrawerKvRow label="HTTP 状态">{String(evidence.apiStatus)}</DrawerKvRow>
              ) : null}
              {typeof evidence.responseTimeMs === 'number' ? (
                <DrawerKvRow label="响应耗时">
                  {formatCaseDuration(evidence.responseTimeMs)}
                </DrawerKvRow>
              ) : null}
              {typeof evidence.judgeMode === 'string' ? (
                <DrawerKvRow label="判定模式">
                  {resolveFindingJudgeModeLabel(evidence.judgeMode)}
                </DrawerKvRow>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );

  if (container) {
    return createPortal(drawer, container);
  }
  return drawer;
}

function caseVerdictBadge(item: DialogueCaseRow) {
  return (
    <Badge variant="outline" className={verdictBadgeClass(item.verdict)}>
      {item.verdict}
    </Badge>
  );
}

export function DialogueCaseDrawer({
  item,
  open,
  onClose,
  container,
}: {
  item: DialogueCaseRow | null;
  open: boolean;
  onClose: () => void;
  container?: HTMLElement | null;
}) {
  if (!open || !item) {
    return null;
  }

  const evidence = item.finding?.evidence || {};
  const judgeVerdict =
    evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
      ? (evidence.judgeVerdict as Record<string, unknown>)
      : null;
  const expectedPass = item.expectedPass?.trim() || null;
  const expectedFail = item.expectedFail?.trim() || null;
  const judgeReason =
    typeof judgeVerdict?.reason === 'string' && judgeVerdict.reason.trim()
      ? judgeVerdict.reason.trim()
      : null;
  const recommendation = resolveFindingRecommendationDisplay(item.finding, item);
  const isMultiTurn = isMultiTurnCaseRow(item);
  const attackScript = resolveCasePromptDisplay(item);
  const executionRecord = resolveCaseActualOutputDisplay(item);
  const singleActualOutput =
    item.actualOutput && item.actualOutput !== '—'
      ? item.actualOutput
      : item.responsePreview
        ? formatDifyResponseForDisplay(item.responsePreview)
        : '空响应';

  const drawer = (
    <>
      <button
        type="button"
        className="sec-rpt-v2-drawer-mask show"
        aria-label="关闭详情"
        onClick={onClose}
      />
      <aside className="sec-rpt-v2-drawer show" aria-label="检测用例详情">
        <div className="sec-rpt-v2-drawer-head">
          <div className="sec-rpt-v2-drawer-head-main">
            <div className="sec-rpt-v2-drawer-tags">
              {item.riskLevel ? (
                <Badge variant="outline" className={riskBadgeClass(item.riskLevel)}>
                  {riskLevelLabel(item.riskLevel)}
                </Badge>
              ) : null}
              {caseVerdictBadge(item)}
              {isMultiTurn ? (
                <Badge variant="outline" className="border-blue-200 text-blue-700">
                  多轮对话
                </Badge>
              ) : null}
              {item.isDevFallback ? (
                <Badge variant="outline" className="border-slate-200 text-slate-600">
                  开发联调
                </Badge>
              ) : null}
            </div>
            <h2>{item.caseName}</h2>
            <p className="sec-rpt-v2-drawer-subtitle">{item.libraryTitle}</p>
          </div>
          <button type="button" className="sec-rpt-v2-close" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="sec-rpt-v2-drawer-body">
          <div className="cmp-drawer-kv">
            <div className="cmp-drawer-kv-section-title">用例与判定</div>
            <DrawerKvRow label="场景库">{item.libraryTitle || '—'}</DrawerKvRow>
            <DrawerKvRow label="判定结果">{caseVerdictBadge(item)}</DrawerKvRow>
            <DrawerKvRow label="执行耗时">{item.durationLabel}</DrawerKvRow>
            {expectedPass ? (
              <DrawerKvRow label="期望通过行为" valueClassName="cmp-drawer-kv-pass">
                <DrawerScrollText>{expectedPass}</DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {expectedFail ? (
              <DrawerKvRow label="期望拒绝表现" valueClassName="cmp-drawer-kv-fail">
                <DrawerScrollText>{expectedFail}</DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {!expectedPass && !expectedFail ? (
              <DrawerKvRow label="期望输出">
                <DrawerScrollText>{item.expectedOutput || '—'}</DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {judgeReason ? (
              <DrawerKvRow label="判定说明" valueClassName="cmp-drawer-kv-mono">
                <DrawerScrollText className="cmp-drawer-scroll-text-muted">
                  {judgeReason}
                </DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {recommendation ? (
              <DrawerKvRow label="整改建议" valueClassName="cmp-drawer-kv-mono">
                <DrawerScrollText className="cmp-drawer-scroll-text-muted">
                  {recommendation}
                </DrawerScrollText>
              </DrawerKvRow>
            ) : null}
            {item.finding ? (
              <DrawerKvRow label="推送状态">
                {item.finding.remediationTaskId ? (
                  <Badge
                    variant="secondary"
                    className="border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    已推送
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-200 text-amber-800">
                    待推送
                  </Badge>
                )}
              </DrawerKvRow>
            ) : null}
          </div>

          <div className="cmp-drawer-kv">
            <div className="cmp-drawer-kv-section-title">执行详情</div>
            {isMultiTurn ? (
              <>
                <DrawerKvRow label="多轮攻击脚本" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">{attackScript}</pre>
                </DrawerKvRow>
                <DrawerKvRow label="多轮执行记录" valueClassName="cmp-drawer-kv-mono">
                  {item.transcript?.length ? (
                    <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                      {executionRecord}
                    </pre>
                  ) : (
                    <span className="cmp-drawer-inline-note">
                      暂无各轮 Agent 回复记录。请重新执行该任务以查看完整多轮执行结果。
                    </span>
                  )}
                </DrawerKvRow>
              </>
            ) : (
              <>
                <DrawerKvRow label="攻击 Prompt" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">
                    {item.prompt || '—'}
                  </pre>
                </DrawerKvRow>
                <DrawerKvRow label="Agent 实际输出" valueClassName="cmp-drawer-kv-mono">
                  <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                    {singleActualOutput}
                  </pre>
                </DrawerKvRow>
              </>
            )}
          </div>

          {typeof evidence.apiStatus === 'number' ||
          typeof evidence.responseTimeMs === 'number' ||
          typeof evidence.judgeMode === 'string' ? (
            <div className="cmp-drawer-kv cmp-drawer-kv-secondary">
              <div className="cmp-drawer-kv-section-title">执行证据</div>
              {typeof evidence.apiStatus === 'number' ? (
                <DrawerKvRow label="HTTP 状态">{String(evidence.apiStatus)}</DrawerKvRow>
              ) : null}
              {typeof evidence.responseTimeMs === 'number' ? (
                <DrawerKvRow label="响应耗时">
                  {formatCaseDuration(evidence.responseTimeMs)}
                </DrawerKvRow>
              ) : null}
              {typeof evidence.judgeMode === 'string' ? (
                <DrawerKvRow label="判定模式">
                  {evidence.judgeMode === 'llm_judge' ? 'LLM 判定' : '规则回退'}
                </DrawerKvRow>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );

  if (container) {
    return createPortal(drawer, container);
  }
  return drawer;
}

export function DialogueTaskDetailHeroSection({
  conclusion,
  score,
  stats,
  onGotoTab,
}: {
  conclusion: DialogueConclusionMeta;
  score: DialogueScoreMeta;
  stats: DialogueTaskDetailStats;
  onGotoTab: (tab: DialogueDetailTab) => void;
}) {
  const ringStyle = {
    background: `conic-gradient(${score.ringColor} 0 ${score.ringPct}%, #f3f4f6 ${score.ringPct}% 100%)`,
  };

  return (
    <section className="sd-td-hero">
      <div className={`sd-td-conclusion ${conclusion.pillCls}`}>
        <div className={`sd-td-result-pill ${conclusion.pillCls}`}>{conclusion.pill}</div>
        <h2>{conclusion.title}</h2>
        <div className="desc">{conclusion.desc}</div>
        <div className="sd-td-hero-actions">
          {conclusion.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.tab === 2 ? 'default' : 'outline'}
              onClick={() => onGotoTab(action.tab)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="sd-td-score-box sd-td-score-box-v2">
        <div className="sd-td-score-top">
          <div className="sd-td-score-ring" style={ringStyle}>
            <b>{score.score}</b>
          </div>
          <div className="sd-td-score-meta">
            <div className="sd-td-score-label">对话安全通过率 / 100</div>
            <div className="sd-td-score-sub">{score.sub}</div>
          </div>
        </div>
        <div className="sd-td-score-list">
          <div className="sd-td-score-mini">
            <b>{stats.fail}</b>
            <span>失败用例</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.pass}</b>
            <span>通过用例</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.pending}</b>
            <span>待执行</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.total}</b>
            <span>计划总数</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DialogueTaskDetailStatStrip({
  stats,
  taskStatus,
  duration,
  passRateThreshold,
}: {
  stats: DialogueTaskDetailStats;
  taskStatus: DetectionScanStatus;
  duration: string;
  passRateThreshold: number;
}) {
  const exec = stats.pass + stats.fail;
  const passRate = computePassRate(stats);
  const execCls =
    taskStatus === 'running' ? 'orange' : exec >= stats.total && stats.total ? 'green' : '';
  const passCls =
    passRate >= passRateThreshold ? 'green' : passRate >= passRateThreshold - 10 ? '' : 'orange';

  return (
    <section className="sd-td-stat-grid">
      <div className="sd-td-stat red">
        <b>{stats.total}</b>
        <span>计划测试用例</span>
        <div className="small">来自攻击场景库</div>
      </div>
      <div
        className={cn(
          'sd-td-stat',
          execCls === 'green' ? 'blue' : execCls === 'orange' ? 'orange' : '',
        )}
      >
        <b>{exec}</b>
        <span>有效执行</span>
        <div className="small">通过 + 失败</div>
      </div>
      <div
        className={cn(
          'sd-td-stat',
          passCls === 'green' ? 'green' : passCls === 'orange' ? 'orange' : '',
        )}
      >
        <b>{taskStatus === 'pending' ? '—' : `${passRate}%`}</b>
        <span>对话安全通过率</span>
        <div className="small">
          {passRate >= passRateThreshold
            ? `达到设定 ${passRateThreshold}% 阈值`
            : `低于设定 ${passRateThreshold}% 阈值`}
        </div>
      </div>
      <div className="sd-td-stat blue">
        <b>{duration}</b>
        <span>检测耗时</span>
        <div className="small">含 API 对话与判定</div>
      </div>
      <div className={cn('sd-td-stat', stats.fail ? 'orange' : '')}>
        <b>{stats.fail}</b>
        <span>风险用例</span>
        <div className="small">需整改 · 可推送风险</div>
      </div>
    </section>
  );
}

export function DialogueTaskDetailOverviewPanel({
  task,
  taskStatus,
  passRateThreshold,
  stats,
  findings = [],
  onOpenFullReport,
}: {
  task: SecurityScanTask;
  taskStatus: DetectionScanStatus;
  passRateThreshold: number;
  stats: DialogueTaskDetailStats;
  findings?: SecurityScanFinding[];
  onOpenFullReport?: () => void;
}) {
  const assessScenario = readAssessScenarioLabel(task);
  const creationMode = readCreationModeLabel(task);
  const libLabel = resolveTaskAttackLibraryLabel(task, findings);
  const passRate = computePassRate(stats);

  const rows: Array<[string, ReactNode]> = [
    ['评估对象', task.assetName || '—'],
    ['对象编码', task.assetCode || '—'],
    ['评估场景', assessScenario],
    ['创建方式', creationMode],
    ['攻击场景库', libLabel],
    ['评测对象类型', 'Agent API · 对话安全评估'],
    [
      '执行时间',
      `${task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '—'} ~ ${task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '—'}`,
    ],
    ['负责人', task.ownerName || '—'],
    ['评估范围', task.targetSummary || task.name || '—'],
    [
      '通过率阈值',
      <Badge key="threshold" variant="outline">
        {passRateThreshold}%
      </Badge>,
    ],
    [
      '执行质量',
      <Badge
        key="quality"
        variant="outline"
        className={
          taskStatus === 'running'
            ? 'border-amber-200 text-amber-700'
            : passRate >= passRateThreshold
              ? 'border-emerald-200 text-emerald-700'
              : 'border-orange-200 text-orange-700'
        }
      >
        {taskStatus === 'running' ? `执行中 ${task.progress ?? 0}%` : `通过率 ${passRate}%`}
      </Badge>,
    ],
  ];

  return (
    <div className="sd-td-overview-grid">
      <div className="sd-td-card">
        <div className="sd-td-card-head">
          <h3>任务基础信息</h3>
          <span className="hint">对话安全评估任务元数据与执行配置</span>
        </div>
        <div className="sd-td-card-body">
          <div className="sd-td-kv">
            {rows.flatMap(([label, value]) => [
              <div key={`${label}-k`}>{label}</div>,
              <div key={`${label}-v`}>{value}</div>,
            ])}
          </div>
          {onOpenFullReport && taskStatus !== 'pending' && taskStatus !== 'running' ? (
            <Button type="button" className="mt-4" size="sm" onClick={onOpenFullReport}>
              查看完整报告
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DialogueLibraryStatsPanel({
  groups,
  taskStatus,
  passRateThreshold,
}: {
  groups: DialogueLibraryStatGroup[];
  taskStatus: DetectionScanStatus;
  passRateThreshold: number;
}) {
  if (taskStatus === 'pending' && groups.length === 0) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">📚</div>
        <b>执行后将展示场景库统计</b>
        <p>按攻击场景库汇总计划用例、通过与失败分布</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">📚</div>
        <b>暂无场景库数据</b>
        <p>任务未关联攻击场景库或未产生执行结果</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>场景库</TableHead>
          <TableHead>计划用例</TableHead>
          <TableHead>通过</TableHead>
          <TableHead>失败</TableHead>
          <TableHead>通过率</TableHead>
          <TableHead>状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          const planned = group.planned || group.pass + group.fail;
          const rate = planned > 0 ? Math.round((group.pass / planned) * 100) : 0;
          const passed =
            taskStatus === 'completed' && rate >= passRateThreshold && group.fail === 0;
          return (
            <TableRow key={group.libraryId}>
              <TableCell className="font-medium">{group.title}</TableCell>
              <TableCell>{planned}</TableCell>
              <TableCell>{taskStatus === 'pending' ? '—' : group.pass}</TableCell>
              <TableCell>{taskStatus === 'pending' ? '—' : group.fail}</TableCell>
              <TableCell>
                <div>{taskStatus === 'pending' ? '—' : `${rate}%`}</div>
                <div className={cn('sd-td-progress-line', group.fail ? 'red' : '')}>
                  <span style={{ width: `${taskStatus === 'pending' ? 0 : rate}%` }} />
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    passed
                      ? 'border-emerald-200 text-emerald-700'
                      : group.fail
                        ? 'border-red-200 text-red-700'
                        : 'border-slate-200 text-slate-600'
                  }
                >
                  {taskStatus === 'pending'
                    ? '待执行'
                    : passed
                      ? '通过'
                      : group.fail
                        ? '不通过'
                        : '—'}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function DialogueFindingsPanel({
  findings,
  taskStatus,
  pendingPushCount,
  pushSuccessCount,
  onSelectFinding,
  onPushOne,
  onPushBatch,
  onGoRemediation,
  page,
  pageSize,
  onPageChange,
  isPushing,
  libraryGroups,
}: {
  findings: SecurityScanFinding[];
  taskStatus: DetectionScanStatus;
  pendingPushCount: number;
  pushSuccessCount?: number | null;
  onSelectFinding: (finding: SecurityScanFinding) => void;
  onPushOne: (findingId: string) => void;
  onPushBatch: () => void;
  onGoRemediation: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isPushing?: boolean;
  libraryGroups?: DialogueLibraryStatGroup[];
}) {
  const pageData = paginateDialogueCases(findings, page, pageSize);

  if (taskStatus === 'pending' || taskStatus === 'running') {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">🔍</div>
        <b>任务执行后将展示风险发现</b>
        <p>对话安全检测命中风险后，可在此复核并推送到风险闭环</p>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">✓</div>
        <b>无对话安全风险发现</b>
        <p>全部测试用例判定为通过</p>
      </div>
    );
  }

  return (
    <>
      {pushSuccessCount ? (
        <div className="td-push-success">
          <span>✓ 已推送 {pushSuccessCount} 项到风险闭环</span>
          <Button type="button" size="sm" onClick={onGoRemediation}>
            前往风险闭环
          </Button>
        </div>
      ) : null}
      <div className="sd-td-card">
        <div className="sd-td-card-head">
          <h3>风险发现</h3>
          <span className="text-xs text-muted-foreground">
            共 {findings.length} 项 · {pendingPushCount} 项待推送 · 第 {pageData.page}/{pageData.pages}{' '}
            页（每页 {pageSize} 条）
          </span>
        </div>
        <div className="sd-td-card-body sd-td-finding-table">
          <div className="ledger-table-wrap">
            <Table className="data-table min-w-[1280px] table-fixed">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '4%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>风险项</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>攻击方式</TableHead>
                  <TableHead>场景库</TableHead>
                  <TableHead>测试输入</TableHead>
                  <TableHead>响应片段</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>推送状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {pageData.slice.map((finding) => {
                const evidence = finding.evidence || {};
                const sourceMeta = resolveFindingSourceMeta(finding);
                const isPushed = Boolean(finding.remediationTaskId);
                return (
                  <TableRow key={finding.id}>
                    <TableCell className="cmp-td-cell-multiline">
                      <div className="font-semibold">{resolveFindingCaseName(finding)}</div>
                      {finding.evidence?.mode === 'dev_fallback' ? (
                        <Badge variant="outline" className="mt-1 border-slate-200 text-slate-600">
                          开发联调样本
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">
                      <Badge variant="outline" className={sourceMeta.badgeClass}>
                        {sourceMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {resolveFindingAttackTypeLabel(finding)}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {resolveFindingLibraryTitle(finding, libraryGroups)}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {typeof evidence.prompt === 'string' ? evidence.prompt.slice(0, 200) : '—'}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {typeof evidence.responsePreview === 'string'
                        ? formatDifyResponseForDisplay(evidence.responsePreview).slice(0, 200)
                        : finding.description.slice(0, 200) || '—'}
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">
                      <Badge variant="outline" className={riskBadgeClass(finding.riskLevel)}>
                        {riskLevelLabel(finding.riskLevel)}
                      </Badge>
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">
                      {isPushed ? (
                        <Badge
                          variant="secondary"
                          className="border-emerald-200 bg-emerald-50 text-emerald-800"
                        >
                          已推送
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 text-amber-800">
                          待推送
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="cmp-td-cell-actions">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onSelectFinding(finding)}
                        >
                          详情
                        </Button>
                        {isPushed ? null : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPushing}
                            onClick={() => onPushOne(finding.id)}
                          >
                            推送
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
          <DialogueTablePagination pageData={pageData} onPageChange={onPageChange} />
          {pendingPushCount > 0 ? (
            <Button type="button" className="mt-4" disabled={isPushing} onClick={onPushBatch}>
              批量推送到风险闭环（{pendingPushCount} 项）
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function DialogueCasesPanel({
  items,
  taskStatus,
  search,
  statusFilter,
  page,
  pageSize,
  onSearchChange,
  onStatusFilterChange,
  onPageChange,
  onRunTask,
  onRefresh,
  onSelectCase,
}: {
  items: DialogueCaseRow[];
  taskStatus: DetectionScanStatus;
  search: string;
  statusFilter: '' | 'pass' | 'fail';
  page: number;
  pageSize: number;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: '' | 'pass' | 'fail') => void;
  onPageChange: (page: number) => void;
  onRunTask?: () => void;
  onRefresh?: () => void;
  onSelectCase: (item: DialogueCaseRow) => void;
}) {
  const filtered = filterDialogueCases(items, search, statusFilter);
  const pageData = paginateDialogueCases(filtered, page, pageSize);

  const toolbar = (
    <div className="cmp-td-toolbar">
      <div className="cmp-td-toolbar-left">
        <input
          className="cmp-td-search"
          placeholder="搜索用例名称 / 攻击 Prompt / 场景库"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <select
          className="rounded-md border px-2 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as '' | 'pass' | 'fail')}
        >
          <option value="">全部状态</option>
          <option value="pass">通过</option>
          <option value="fail">失败</option>
        </select>
      </div>
      <span className="text-xs text-muted-foreground">
        共 {pageData.total} 条 · 第 {pageData.page}/{pageData.pages} 页（每页 {pageSize} 条）
      </span>
    </div>
  );

  if (taskStatus === 'pending' && filtered.length === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">📋</div>
          <b>任务尚未执行</b>
          <p>运行任务后将展示各检测用例的执行结果</p>
          {onRunTask ? (
            <Button type="button" className="mt-4" size="sm" onClick={onRunTask}>
              开始检测
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  if (taskStatus === 'running' && filtered.length === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">⏳</div>
          <b>对话安全检测执行中</b>
          <p>用例执行与判定进行中 · 稍等几秒后点击刷新</p>
          {onRefresh ? (
            <Button type="button" className="mt-4" size="sm" variant="outline" onClick={onRefresh}>
              刷新
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  if (pageData.total === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">🔍</div>
          <b>无匹配检测用例</b>
          <p>调整关键词或状态筛选后重试</p>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <div className="sd-td-card">
        <div className="sd-td-card-head">
          <h3>检测用例明细</h3>
          <span className="text-xs text-muted-foreground">
            共 {pageData.total} 条 · 第 {pageData.page}/{pageData.pages} 页（每页 {pageSize} 条）
          </span>
        </div>
        <div className="sd-td-card-body sd-td-finding-table">
          <div className="ledger-table-wrap">
            <Table className="data-table min-w-[1280px] table-fixed">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>用例名称</TableHead>
                  <TableHead>攻击 Prompt</TableHead>
                  <TableHead>期望输出</TableHead>
                  <TableHead>实际输出</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>判定</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>风险库 / 场景库</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.slice.map((item) => (
                  <TableRow
                    key={item.caseId}
                    className="cursor-pointer"
                    onClick={() => onSelectCase(item)}
                  >
                    <TableCell className="cmp-td-cell-multiline">
                      <div className="font-semibold">{item.caseName}</div>
                      {item.isDevFallback ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">开发联调样本</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {clipCellText(item.promptSummary || item.prompt)}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {clipCellText(item.expectedOutput)}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {clipCellText(formatActualOutputText(item.actualOutput))}
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">
                      {item.riskLevel ? (
                        <Badge variant="outline" className={riskBadgeClass(item.riskLevel)}>
                          {riskLevelLabel(item.riskLevel)}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">
                      <Badge variant="outline" className={verdictBadgeClass(item.verdict)}>
                        {item.verdict}
                      </Badge>
                    </TableCell>
                    <TableCell className="cmp-td-cell-compact">{item.durationLabel}</TableCell>
                    <TableCell className="cmp-td-cell-multiline">{item.libraryTitle}</TableCell>
                    <TableCell className="cmp-td-cell-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectCase(item);
                        }}
                      >
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogueTablePagination pageData={pageData} onPageChange={onPageChange} />
        </div>
      </div>
    </>
  );
}

export function DialoguePushPanel({
  task,
  stats,
  taskStatus,
  findings,
  pendingPushCount,
  pushedCount,
  pushSuccessCount,
  isPushing,
  onPushBatch,
  onGoRemediation,
}: {
  task: SecurityScanTask;
  stats: DialogueTaskDetailStats;
  taskStatus: DetectionScanStatus;
  findings: SecurityScanFinding[];
  pendingPushCount: number;
  pushedCount: number;
  pushSuccessCount?: number | null;
  isPushing?: boolean;
  onPushBatch: () => void;
  onGoRemediation: () => void;
}) {
  if (taskStatus === 'pending' || taskStatus === 'running') {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">📤</div>
        <b>任务完成后可推送到风险闭环</b>
        <p>对话安全风险发现将在此汇总，支持批量推送与整改跟踪</p>
      </div>
    );
  }

  return (
    <>
      {pushSuccessCount ? (
        <div className="td-push-success">
          <span>✓ 已推送 {pushSuccessCount} 项到风险闭环</span>
          <Button type="button" size="sm" onClick={onGoRemediation}>
            前往风险闭环
          </Button>
        </div>
      ) : null}
      <div className="sd-td-overview-grid">
        <div className="sd-td-card">
          <div className="sd-td-card-head">
            <h3>推送到风险闭环</h3>
            <span className="hint">将对话安全风险发现纳入整改与复测流程</span>
          </div>
          <div className="sd-td-card-body">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">计划用例</div>
                <div className="mt-1 text-2xl font-semibold">{stats.total}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">风险发现</div>
                <div className="mt-1 text-2xl font-semibold">{findings.length}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">待推送</div>
                <div className="mt-1 text-2xl font-semibold text-amber-700">{pendingPushCount}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              任务「{task.name}」共产生 {findings.length} 项风险发现，已推送 {pushedCount} 项。
            </div>
            {pendingPushCount > 0 ? (
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={isPushing}
                onClick={onPushBatch}
              >
                推送到风险闭环（{pendingPushCount} 项）
              </Button>
            ) : (
              <Button
                type="button"
                className="mt-4 w-full"
                variant="outline"
                onClick={onGoRemediation}
              >
                前往风险闭环查看整改
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function DialogueFullReportPanel({
  task,
  stats,
  conclusion,
  findings,
  libraryGroups,
  passRateThreshold,
  onBack,
}: {
  task: SecurityScanTask;
  stats: DialogueTaskDetailStats;
  conclusion: DialogueConclusionMeta;
  findings: SecurityScanFinding[];
  libraryGroups: DialogueLibraryStatGroup[];
  passRateThreshold: number;
  onBack: () => void;
}) {
  const passRate = computePassRate(stats);
  const patrolTask = isPatrolTask(task);
  const reportTitle = patrolTask ? '周期巡检报告' : '对话安全评估报告';
  const passed = passRate >= passRateThreshold && stats.fail === 0;

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight">
            {reportTitle} · {task.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {task.assetName || '—'}
            {task.completedAt
              ? ` · 完成于 ${new Date(task.completedAt).toLocaleString('zh-CN')}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              passed
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {conclusion.pill}
          </Badge>
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            返回详情
          </Button>
        </div>
      </div>

      <section
        className={cn(
          'rounded-xl border p-4',
          passed ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60',
        )}
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          综合结论
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          <strong className="text-base">{conclusion.title}</strong> — {conclusion.desc}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '计划用例', value: String(stats.total) },
          { label: '通过', value: String(stats.pass), tone: 'text-emerald-700' },
          { label: '失败', value: String(stats.fail), tone: 'text-red-700' },
          {
            label: '通过率',
            value: `${passRate}%`,
            tone: passed ? 'text-emerald-700' : 'text-red-700',
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className={cn('mt-1 text-2xl font-bold', item.tone)}>{item.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border p-4">
        <div className="text-sm font-semibold">执行摘要</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          计划 {stats.total} 条用例，通过 {stats.pass} 条，失败 {stats.fail} 条，通过率 {passRate}%
          （阈值 {passRateThreshold}%）。高危命中 {task.highCount ?? 0} 条，中危 {task.mediumCount ?? 0}{' '}
          条，低危 {task.lowCount ?? 0} 条。
        </p>
      </section>

      {libraryGroups.length > 0 ? (
        <section className="rounded-xl border p-4">
          <div className="text-sm font-semibold">场景库统计</div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>场景库</TableHead>
                  <TableHead>计划</TableHead>
                  <TableHead>通过</TableHead>
                  <TableHead>失败</TableHead>
                  <TableHead>通过率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {libraryGroups.map((group) => {
                  const planned = group.planned || group.pass + group.fail;
                  const rate = planned > 0 ? Math.round((group.pass / planned) * 100) : 0;
                  return (
                    <TableRow key={group.libraryId}>
                      <TableCell className="font-medium">{group.title}</TableCell>
                      <TableCell>{planned}</TableCell>
                      <TableCell>{group.pass}</TableCell>
                      <TableCell>{group.fail}</TableCell>
                      <TableCell>{planned > 0 ? `${rate}%` : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <div className="text-sm font-semibold">风险发现（{findings.length}）</div>
        {findings.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">未发现对话安全风险。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {findings.map((finding) => (
              <li key={finding.id} className="rounded-lg border bg-muted/15 p-3 text-sm">
                <div className="font-medium">{finding.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {riskLevelLabel(finding.riskLevel)}
                </div>
                <p className="mt-2 leading-relaxed text-muted-foreground">{finding.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
