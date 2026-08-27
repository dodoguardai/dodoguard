import {
  buildRetestRunsForTask,
  buildRetestRunsFromScanTasks,
  collectRetestReports,
  relatedRiskRowsForRetestRun,
  resolveRetestOutcomeForBatch,
  resolveRetestScanTaskForReport,
  toRetestReportId,
  type EnrichedRiskRow,
} from '../frontend/src/features/risk-closed-loop/risk-closed-loop-utils';
import type { SecurityRetestRun } from '../frontend/src/services/api/detection-scanning';
import type { SecurityScanTask } from '../frontend/src/types/entities';

function makeRow(
  id: string,
  taskId: string,
  metadata: Record<string, unknown> = {},
): EnrichedRiskRow {
  return {
    id,
    organizationId: 'org-1',
    findingId: `finding-${id}`,
    taskId,
    title: `Risk ${id}`,
    riskLevel: 'high',
    status: 'assigned',
    retestStatus: 'not_started',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    displayStatus: 'pending_fix',
    riskKind: 'api',
    agentName: 'Agent A',
    department: '安全部',
    finding: {
      id: `finding-${id}`,
      organizationId: 'org-1',
      taskId,
      title: `Finding ${id}`,
      riskLevel: 'high',
      status: 'open',
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-01T10:00:00.000Z',
      evidence: {
        caseCode: `TC-${id}`,
        caseId: `case-${id}`,
      },
    },
    metadata,
  };
}

function makeRetestRun(
  scanTaskId: string,
  planId: string,
  originalTaskId: string,
  remediationIds: string[],
  passed: boolean,
  createdAt: string,
): SecurityRetestRun {
  return {
    retestScanTaskId: scanTaskId,
    planId,
    reportId: toRetestReportId(planId),
    remediationIds,
    status: 'completed',
    progress: 100,
    name: `Retest ${planId}`,
    metadata: {
      retestOfTaskId: originalTaskId,
      retestPlanId: planId,
      retestRemediationIds: remediationIds,
      technicalExecutionResults: remediationIds.map((riskId) => ({
        caseId: `case-${riskId}`,
        caseCode: `TC-${riskId}`,
        passed,
        prompt: `prompt-${riskId}`,
        responsePreview: `response-${riskId}`,
      })),
    },
    createdAt,
    completedAt: createdAt,
    updatedAt: createdAt,
  };
}

describe('risk-closed-loop retest runs', () => {
  const taskId = 'assessment-task-1';
  const rowA = makeRow('risk-a', taskId);
  const rowB = makeRow('risk-b', taskId);
  const rows = [rowA, rowB];

  const retestRuns: SecurityRetestRun[] = [
    makeRetestRun(
      'scan-1',
      'RT-20260701-AAAA',
      taskId,
      ['risk-a', 'risk-b'],
      true,
      '2026-07-01T10:00:00.000Z',
    ),
    makeRetestRun(
      'scan-2',
      'RT-20260702-BBBB',
      taskId,
      ['risk-a'],
      false,
      '2026-07-02T10:00:00.000Z',
    ),
    makeRetestRun(
      'scan-3',
      'RT-20260703-CCCC',
      taskId,
      ['risk-b'],
      true,
      '2026-07-03T10:00:00.000Z',
    ),
  ];

  it('builds one run per retest scan task', () => {
    const runs = buildRetestRunsForTask(rows, taskId, retestRuns);
    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run.batchId)).toEqual([
      'RT-20260703-CCCC',
      'RT-20260702-BBBB',
      'RT-20260701-AAAA',
    ]);
  });

  it('collectRetestReports returns one report per retest run', () => {
    const reports = collectRetestReports(rows, retestRuns);
    expect(reports).toHaveLength(3);
    expect(reports[0].retestPlanId).toBe('RT-20260703-CCCC');
    expect(reports[0].riskCount).toBe(1);
  });

  it('isolates related risks to the selected batch only', () => {
    const run = retestRuns[1];
    const report = {
      id: run.reportId!,
      retestPlanId: run.planId!,
    };
    const related = relatedRiskRowsForRetestRun(run, rows, taskId, report);
    expect(related.map((row) => row.id)).toEqual(['risk-a']);
  });

  it('does not mix unrelated risks across batches', () => {
    const run = retestRuns[2];
    const report = {
      id: run.reportId!,
      retestPlanId: run.planId!,
    };
    const related = relatedRiskRowsForRetestRun(run, rows, taskId, report);
    expect(related.map((row) => row.id)).toEqual(['risk-b']);
    expect(related).not.toContainEqual(rowA);
    expect(resolveRetestOutcomeForBatch(rowB, run)).toBe('passed');
  });

  it('resolves report ids from plan, report, and scan task ids', () => {
    expect(resolveRetestScanTaskForReport('scan-2', retestRuns)?.planId).toBe('RT-20260702-BBBB');
    expect(
      resolveRetestScanTaskForReport(toRetestReportId('RT-20260701-AAAA'), retestRuns)?.planId,
    ).toBe('RT-20260701-AAAA');
    expect(resolveRetestScanTaskForReport('RT-20260703-CCCC', retestRuns)?.retestScanTaskId).toBe(
      'scan-3',
    );
  });

  it('builds retest runs from risk_retest scan tasks', () => {
    const scanTasks: SecurityScanTask[] = [
      {
        id: 'scan-legacy',
        organizationId: 'org-1',
        name: 'Legacy retest',
        source: 'risk_retest',
        scanType: 'agent_api',
        targetKind: 'agent',
        status: 'completed',
        progress: 100,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:05:00.000Z',
        metadata: {
          retestOfTaskId: taskId,
          retestPlanId: 'RT-LEGACY-0001',
          retestRemediationIds: ['risk-a'],
        },
      },
    ];
    const runs = buildRetestRunsFromScanTasks(scanTasks);
    expect(runs).toHaveLength(1);
    expect(runs[0].planId).toBe('RT-LEGACY-0001');
  });

  it('falls back to metadata when no retest scan tasks exist', () => {
    const legacyRow = makeRow('risk-a', taskId, {
      retestBatchId: 'RT-LEGACY-0002',
      retestReportId: toRetestReportId('RT-LEGACY-0002'),
    });
    legacyRow.retestStatus = 'passed';
    const runs = buildRetestRunsForTask([legacyRow], taskId, []);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].batchId).toBe('RT-LEGACY-0002');
  });
});
