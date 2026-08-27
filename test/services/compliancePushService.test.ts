import {
  assignComplianceViolationNumbers,
  buildComplianceViolationNo,
  computeViolationRiskCounts,
  selectComplianceItemsToPush,
  syncCompliancePushStatusFromFindings,
} from '../../backend/src/services/compliancePushService';

describe('compliancePushService', () => {
  const sampleViolations = [
    {
      caseId: 'case-1',
      caseCode: 'CMP-001',
      caseName: '不得泄露个人信息',
      passed: false,
      riskLevel: 'high',
      executionStatus: 'executed' as const,
    },
    {
      caseId: 'case-2',
      caseCode: 'CMP-002',
      caseName: '不得提供投资建议',
      passed: false,
      riskLevel: 'medium',
      executionStatus: 'executed' as const,
    },
    {
      caseId: 'case-3',
      caseCode: 'CMP-003',
      caseName: '合规拒答',
      passed: true,
      executionStatus: 'executed' as const,
    },
  ];

  it('assigns violation numbers and pending push status', () => {
    const items = assignComplianceViolationNumbers('task-abc123', sampleViolations);
    expect(items[0].violationNo).toMatch(/^RSK-CMP-/);
    expect(items[0].pushStatus).toBe('pending');
    expect(items[1].pushStatus).toBe('pending');
    expect(items[2].violationNo).toBeUndefined();
  });

  it('computes risk counts from execution results', () => {
    const counts = computeViolationRiskCounts(sampleViolations);
    expect(counts.high).toBe(1);
    expect(counts.medium).toBe(1);
    expect(counts.low).toBe(0);
  });

  it('selects only pending violations for push', () => {
    const numbered = assignComplianceViolationNumbers('task-abc123', sampleViolations).map(
      (item, index) =>
        index === 0 ? { ...item, pushStatus: 'pushed' as const, findingId: 'finding-1' } : item,
    );
    const targets = selectComplianceItemsToPush(numbered);
    expect(targets).toHaveLength(1);
    expect(targets[0].caseId).toBe('case-2');
  });

  it('syncs push status from existing findings', () => {
    const numbered = assignComplianceViolationNumbers('task-abc123', sampleViolations);
    const synced = syncCompliancePushStatusFromFindings(numbered, [
      {
        id: 'finding-1',
        remediationTaskId: 'remediation-1',
        evidence: { caseId: 'case-1' },
      },
    ]);
    expect(synced[0].pushStatus).toBe('pushed');
    expect(synced[0].findingId).toBe('finding-1');
    expect(synced[0].remediationId).toBe('remediation-1');
    expect(synced[1].pushStatus).toBe('pending');
  });

  it('builds stable violation numbers per task', () => {
    expect(buildComplianceViolationNo('task-abc123', 2)).toContain('-02');
  });
});
