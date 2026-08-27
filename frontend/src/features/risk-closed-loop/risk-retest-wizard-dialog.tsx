import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import {
  buildRetestCaseRows,
  DISPLAY_STATUS_LABEL,
  filterCaseRowsByScope,
  generateRetestPlanId,
  resolveAvailableRetestScopes,
  type EnrichedRiskRow,
  type RetestCaseRow,
  type RetestScopeId,
  isClosedDisplayStatus,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { cn } from '@/lib/utils';

const STEPS = ['选择风险', '智能体预检', '复测范围', '复测策略', '任务生成', '确认执行'] as const;

const SCOPES: Array<{ id: RetestScopeId; label: string }> = [
  { id: 'dialog', label: '对话 / API 原失败用例' },
  { id: 'component', label: '组件规则扫描' },
  { id: 'compliance', label: '合规控制项' },
];

export type RetestWizardSubmitPayload = {
  riskIds: string[];
  scopes: RetestScopeId[];
  caseKeys: string[];
  strategy: 'original' | 'full';
  mode: 'manual' | 'ai';
  planId: string;
  planTitle: string;
  taskId: string;
  agentName: string;
};

type RiskRetestWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: EnrichedRiskRow[];
  initialTaskId?: string | null;
  initialRiskIds?: string[];
  busy?: boolean;
  onSubmit: (payload: RetestWizardSubmitPayload) => void;
};

function Stepper({ step }: { step: number }) {
  return (
    <nav className="rrc-retest-stepper">
      {STEPS.map((label, index) => {
        const n = index + 1;
        return (
          <div key={label} className="rrc-retest-stepper-item">
            <div className={cn('rrc-retest-step', step === n && 'active', step > n && 'done')}>
              <b>{n}</b>
              {label}
            </div>
            {index < STEPS.length - 1 ? <span className="rrc-retest-step-bar" aria-hidden /> : null}
          </div>
        );
      })}
    </nav>
  );
}

export function RiskRetestWizardDialog({
  open,
  onOpenChange,
  rows,
  initialTaskId,
  initialRiskIds,
  busy,
  onSubmit,
}: RiskRetestWizardDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [scopes, setScopes] = useState<Set<RetestScopeId>>(() => new Set(['dialog']));
  const [selectedCases, setSelectedCases] = useState<Set<string>>(() => new Set());
  const [strategy, setStrategy] = useState<'original' | 'full'>('original');
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [precheckDone, setPrecheckDone] = useState(false);
  const [precheckRunning, setPrecheckRunning] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<{
    id: string;
    title: string;
    agent: string;
    riskCount: number;
    caseCount: number;
    strategy: string;
    scopes: string[];
  } | null>(null);

  const taskId = initialTaskId || rows.find((r) => selectedIds.has(r.id))?.taskId || '';
  const taskRow = rows.find((r) => r.taskId === taskId);
  const agentName = taskRow?.agentName || '—';

  const didInitRef = useRef(false);

  const candidates = useMemo(() => {
    return rows.filter((row) => {
      if (isClosedDisplayStatus(row.displayStatus)) {
        return false;
      }
      if (initialTaskId && row.taskId !== initialTaskId) {
        return false;
      }
      return [
        'pending_retest',
        'retest_failed',
        'in_progress',
        'pending_fix',
        'pending_confirm',
      ].includes(row.displayStatus);
    });
  }, [initialTaskId, rows]);

  const selectedRiskRows = useMemo(
    () => candidates.filter((r) => selectedIds.has(r.id)),
    [candidates, selectedIds],
  );

  const allCaseRows = useMemo(() => buildRetestCaseRows(selectedRiskRows), [selectedRiskRows]);

  const availableScopes = useMemo(
    () => resolveAvailableRetestScopes(allCaseRows),
    [allCaseRows],
  );

  const scopeCounts = useMemo(() => {
    const countFor = (scope: RetestScopeId) =>
      filterCaseRowsByScope(allCaseRows, new Set([scope])).length;
    return {
      dialog: countFor('dialog'),
      component: countFor('component'),
      compliance: countFor('compliance'),
    };
  }, [allCaseRows]);

  const scopedCaseRows = useMemo(
    () => filterCaseRowsByScope(allCaseRows, scopes),
    [allCaseRows, scopes],
  );

  useEffect(() => {
    if (!open) {
      didInitRef.current = false;
      return;
    }
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;
    setStep(1);
    setStrategy('original');
    setMode('manual');
    setPrecheckDone(false);
    setPrecheckRunning(false);
    setGeneratedPlan(null);
    const next = new Set<string>();
    if (initialRiskIds?.length) {
      for (const id of initialRiskIds) {
        next.add(id);
      }
    } else if (initialTaskId) {
      for (const row of candidates) {
        next.add(row.id);
      }
    }
    setSelectedIds(next);
    setSelectedCases(new Set());
  }, [open, initialRiskIds, initialTaskId]);

  useEffect(() => {
    if (busy) {
      return;
    }
    if (!open || availableScopes.length === 0) {
      return;
    }
    setScopes((prev) => {
      const next = new Set<RetestScopeId>();
      for (const scope of availableScopes) {
        if (prev.has(scope)) {
          next.add(scope);
        }
      }
      if (next.size === 0) {
        for (const scope of availableScopes) {
          next.add(scope);
        }
      }
      return next;
    });
  }, [open, availableScopes]);

  useEffect(() => {
    if (busy) {
      return;
    }
    if (scopedCaseRows.length === 0) {
      setSelectedCases(new Set());
      return;
    }
    setSelectedCases(new Set(scopedCaseRows.map((c) => c.key)));
  }, [scopedCaseRows]);

  const toggleScope = (scope: RetestScopeId, checked: boolean) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(scope);
      } else {
        next.delete(scope);
      }
      return next;
    });
  };

  const toggleRisk = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleCase = (key: string, checked: boolean) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const runPrecheck = () => {
    setPrecheckRunning(true);
    window.setTimeout(() => {
      setPrecheckRunning(false);
      setPrecheckDone(true);
    }, 1500);
  };

  useEffect(() => {
    if (step === 2 && open && !precheckDone && !precheckRunning) {
      runPrecheck();
    }
  }, [step, open, precheckDone, precheckRunning]);

  const buildPlan = () => {
    const id = generateRetestPlanId();
    const scopeLabels = SCOPES.filter((s) => scopes.has(s.id)).map((s) => s.label);
    return {
      id,
      title: `${taskRow?.scanTask?.name || taskId} · 风险复测`,
      agent: agentName,
      riskCount: selectedIds.size,
      caseCount: selectedCases.size,
      strategy: mode === 'ai' ? 'AI 辅助复测' : strategy === 'full' ? '全量回归' : '原策略回放',
      scopes: scopeLabels,
    };
  };

  const canNext =
    step === 1
      ? selectedIds.size > 0
      : step === 2
        ? precheckDone && !precheckRunning
        : step === 3
          ? scopes.size > 0
          : step === 4
            ? true
            : step === 5
              ? true
              : selectedCases.size > 0;

  const handleNext = () => {
    if (step === 5) {
      if (!generatedPlan) {
        setGeneratedPlan(buildPlan());
      }
      setStep(6);
      return;
    }
    setStep((s) => Math.min(6, s + 1));
  };

  const handleExecute = () => {
    if (!taskId) {
      toast.error('未找到关联评估任务，无法执行复测');
      return;
    }
    const plan = generatedPlan ?? buildPlan();
    if (!plan) {
      toast.error('请先生成复测计划');
      return;
    }
    if (selectedCases.size === 0) {
      toast.error('请至少选择一条复测用例');
      return;
    }
    onSubmit({
      riskIds: [...selectedIds],
      scopes: [...scopes],
      caseKeys: [...selectedCases],
      strategy,
      mode,
      planId: plan.id,
      planTitle: plan.title,
      taskId,
      agentName,
    });
  };

  const casesByRisk = useMemo(() => {
    const map = new Map<string, RetestCaseRow[]>();
    for (const c of scopedCaseRows) {
      const list = map.get(c.riskId) ?? [];
      list.push(c);
      map.set(c.riskId, list);
    }
    return map;
  }, [scopedCaseRows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rrc-retest-modal max-h-[92vh] overflow-hidden sm:max-w-[960px]">
        <DialogHeader className="rrc-retest-modal-header">
          <div>
            <DialogTitle className="text-xl font-bold">创建复测任务</DialogTitle>
            <p className="rrc-retest-modal-sub">
              评估对象 <span className="font-semibold text-blue-800">{agentName}</span> ·{' '}
              {selectedIds.size} 项风险 · {selectedCases.size} 条用例
            </p>
          </div>
        </DialogHeader>

        <div className="rrc-retest-modal-body">
          <Stepper step={step} />

          {step === 1 ? (
            <div className="rrc-retest-panel">
              <div className="rrc-retest-section-head">
                <div>
                  <h3>选择待复测风险</h3>
                  <p className="rrc-hint">
                    勾选需要纳入本次复测任务的风险发现项 · 将自动关联原失败用例与组件扫描项
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    <b>{selectedIds.size}</b>/{candidates.length} 已选
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-xs"
                    onClick={() => setSelectedIds(new Set(candidates.map((r) => r.id)))}
                  >
                    全选
                  </Button>
                </div>
              </div>
              <div className="rrc-retest-risk-list">
                {candidates.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">暂无可复测风险项</p>
                ) : (
                  candidates.map((row) => (
                    <label key={row.id} className="rrc-retest-risk-row">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(checked) => toggleRisk(row.id, checked === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{row.title}</span>
                          <RiskBadge level={row.riskLevel} />
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.violationNo || row.id} · {row.agentName} ·{' '}
                          {DISPLAY_STATUS_LABEL[row.displayStatus]}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="rrc-retest-panel">
              <div className="rrc-retest-section-head">
                <div>
                  <h3>智能体预检</h3>
                  <p className="rrc-hint">
                    对 <b>{agentName}</b> 执行联通与资产快照预检 · 约 2 秒
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  'rrc-retest-precheck-card',
                  precheckRunning && 'is-running',
                  precheckDone && 'is-done',
                )}
              >
                {precheckRunning ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    <strong>预检执行中…</strong>
                    <br />
                    正在验证 API 联通性与 Agent 资产快照
                  </>
                ) : precheckDone ? (
                  <>
                    <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />
                    <strong>预检通过</strong>
                    <br />
                    API 联通 · 资产快照已固化 · {selectedIds.size} 项风险可复测
                  </>
                ) : (
                  <>进入本步骤后将自动开始预检</>
                )}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="rrc-retest-panel">
              <div className="rrc-retest-section-head">
                <div>
                  <h3>复测范围</h3>
                  <p className="rrc-hint">
                    选择本次复测覆盖的检测维度 · 关联项将随已选风险自动统计
                  </p>
                </div>
              </div>
              <table className="rrc-retest-scope-table">
                <thead>
                  <tr>
                    <th>复测范围</th>
                    <th>关联项</th>
                  </tr>
                </thead>
                <tbody>
                  {SCOPES.filter((scope) => availableScopes.includes(scope.id)).map((scope) => (
                    <tr key={scope.id}>
                      <td>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={scopes.has(scope.id)}
                            onCheckedChange={(checked) => toggleScope(scope.id, checked === true)}
                          />
                          {scope.label}
                        </label>
                      </td>
                      <td>
                        <b>{scopeCounts[scope.id]}</b> 条
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="rrc-retest-panel">
              <div className="rrc-retest-section-head">
                <div>
                  <h3>复测策略</h3>
                  <p className="rrc-hint">选择用例回放方式 · 默认推荐原策略回放</p>
                </div>
              </div>
              <label className="rrc-retest-risk-row">
                <input
                  type="radio"
                  name="rrcStrategy"
                  checked={strategy === 'original' && mode === 'manual'}
                  onChange={() => {
                    setStrategy('original');
                    setMode('manual');
                  }}
                />
                <div>
                  <strong>原策略回放</strong>
                  <div className="rrc-hint">加载原评估任务失败用例 / 组件扫描项</div>
                </div>
              </label>
              <label className="rrc-retest-risk-row">
                <input
                  type="radio"
                  name="rrcStrategy"
                  checked={strategy === 'full'}
                  onChange={() => {
                    setStrategy('full');
                    setMode('manual');
                  }}
                />
                <div>
                  <strong>全量回归</strong>
                  <div className="rrc-hint">扩展关联用例库</div>
                </div>
              </label>
              <label className="rrc-retest-risk-row">
                <input
                  type="radio"
                  name="rrcRetestMode"
                  checked={mode === 'ai'}
                  onChange={() => setMode('ai')}
                />
                <div>
                  <strong>AI 辅助复测</strong>
                  <div className="rrc-hint">自动生成复测计划（演示）</div>
                </div>
              </label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="rrc-retest-panel">
              {generatedPlan ? (
                <>
                  <div className="rrc-retest-section-head">
                    <div>
                      <h3>复测计划已生成</h3>
                      <p className="rrc-hint">确认计划摘要后继续下一步</p>
                    </div>
                  </div>
                  <div className="rrc-retest-plan-card">
                    <b>{generatedPlan.title}</b>
                    <code>{generatedPlan.id}</code> · {generatedPlan.agent} ·{' '}
                    {generatedPlan.riskCount} 项风险 · {generatedPlan.caseCount} 条用例
                    <span className="rrc-hint mt-2 block">
                      策略：{generatedPlan.strategy} · 范围：{generatedPlan.scopes.join('、')}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="rrc-retest-section-head">
                    <div>
                      <h3>生成复测任务</h3>
                      <p className="rrc-hint">
                        将根据已选 {selectedIds.size} 项风险 · {selectedCases.size}{' '}
                        条用例生成复测任务
                      </p>
                    </div>
                  </div>
                  <div className="rrc-retest-hint">
                    点击底部「生成计划并继续」生成复测计划并进入确认执行步骤
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="rrc-retest-panel">
              <div className="rrc-retest-section-head">
                <div>
                  <h3>确认执行复测</h3>
                  <p className="rrc-hint">
                    任务 <code>{generatedPlan?.id || 'RT-xxxx'}</code> · Agent <b>{agentName}</b>
                  </p>
                </div>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                执行后将进入复测结果确认，安全工程师逐项确认后关闭风险。
              </p>
              {[...casesByRisk.entries()].length === 0 ? (
                <div className="rrc-retest-hint">暂无关联用例 · 请返回上一步重新选择风险</div>
              ) : (
                [...casesByRisk.entries()].map(([riskId, caseRows]) => (
                  <div key={riskId} className="rrc-retest-case-group">
                    <h4>
                      {caseRows[0]?.riskTitle} · {caseRows.length} 条用例
                    </h4>
                    {caseRows.map((c) => (
                      <div key={c.key} className="rrc-retest-case-row">
                        <Checkbox
                          checked={selectedCases.has(c.key)}
                          onCheckedChange={(checked) => toggleCase(c.key, checked === true)}
                        />
                        <div className="min-w-0 flex-1 text-sm font-medium">{c.name}</div>
                        <Badge variant="secondary">{c.type}</Badge>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="rrc-retest-modal-footer gap-2 sm:justify-between">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStep((s) => s - 1)}
              >
                上一步
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            {step < 6 ? (
              <Button
                type="button"
                disabled={!canNext || busy || precheckRunning}
                onClick={handleNext}
              >
                {step === 5 && !generatedPlan ? '生成计划并继续' : '下一步'}
              </Button>
            ) : (
              <Button type="button" disabled={!canNext || busy} onClick={handleExecute}>
                {busy ? '执行中…' : '执行复测'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
