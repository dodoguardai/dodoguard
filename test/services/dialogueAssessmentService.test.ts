import {
  buildDialogueAssessmentMetadata,
  computeDialogueStatsFromTask,
  evaluateDialogueAssessment,
  readDialoguePassRateThreshold,
  resolveDialogueTaskStatusAfterAssessment,
} from '../../backend/src/services/dialogueAssessmentService';

describe('dialogueAssessmentService', () => {
  const baseTask = {
    scanType: 'agent_api',
    runConfig: { passRateThreshold: 90 },
    plans: [{ caseCount: 10 }],
    metadata: {
      technicalExecutionResults: [
        { caseId: '1', passed: true },
        { caseId: '2', passed: true },
        { caseId: '3', passed: false },
      ],
    },
    highCount: 0,
    mediumCount: 1,
    lowCount: 0,
  };

  it('reads pass rate threshold from runConfig', () => {
    expect(readDialoguePassRateThreshold(baseTask)).toBe(90);
  });

  it('computes stats from technical execution results', () => {
    expect(computeDialogueStatsFromTask(baseTask)).toEqual({
      total: 3,
      pass: 2,
      fail: 1,
      pending: 0,
    });
  });

  it('marks pass when rate meets threshold', () => {
    const task = {
      ...baseTask,
      metadata: {
        technicalExecutionResults: Array.from({ length: 10 }, (_, index) => ({
          caseId: String(index + 1),
          passed: index < 9,
        })),
      },
    };
    const stats = computeDialogueStatsFromTask(task);
    const assessment = evaluateDialogueAssessment(task, stats, { high: 0, medium: 1 });
    expect(assessment.conclusion).toBe('pass');
    expect(assessment.passRate).toBe(90);
    expect(assessment.label).toBe('建议通过');
    expect(resolveDialogueTaskStatusAfterAssessment(assessment)).toBe('completed');
  });

  it('marks fail when pass rate is below threshold', () => {
    const task = {
      ...baseTask,
      runConfig: { passRateThreshold: 95 },
    };
    const stats = computeDialogueStatsFromTask(task);
    const assessment = evaluateDialogueAssessment(task, stats, { high: 0 });
    expect(assessment.conclusion).toBe('fail');
    expect(resolveDialogueTaskStatusAfterAssessment(assessment)).toBe('completed');
  });

  it('marks pass when high risk findings exist if pass rate meets threshold', () => {
    const task = {
      ...baseTask,
      metadata: {
        technicalExecutionResults: [
          { caseId: '1', passed: true },
          { caseId: '2', passed: true },
        ],
      },
    };
    const stats = computeDialogueStatsFromTask(task);
    const assessment = evaluateDialogueAssessment(task, stats, { high: 1 });
    expect(assessment.conclusion).toBe('pass');
    expect(buildDialogueAssessmentMetadata(assessment).dialogueAssessmentConclusion).toBe('pass');
  });
});
