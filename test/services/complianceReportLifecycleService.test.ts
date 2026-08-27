import {
  applyComplianceCaseOverride,
  buildComplianceReportMarkdown,
  canFinalizeComplianceReport,
  enrichComplianceReportPreview,
  resolveCompletionAfterExecute,
} from '../../backend/src/services/complianceReportLifecycleService';
import { buildComplianceReportPreview } from '../../backend/src/services/complianceReportService';

describe('complianceReportLifecycleService', () => {
  const manualLibrary = {
    id: 'lib-1',
    title: '高风险操作',
    detectMethod: 'API+人工复核',
  };
  const autoLibrary = {
    id: 'lib-2',
    title: '个保法',
    detectMethod: 'API 自动检测',
  };

  it('always completes task after execute without manual review gate', () => {
    const task = {
      id: 'task-1',
      name: '测试',
      status: 'running',
      metadata: { domain: '金融合规' },
    };
    const items = [{ caseId: '1', caseCode: 'A', caseName: '违规', passed: false }];
    const result = resolveCompletionAfterExecute({ task, items, libraries: [manualLibrary] });
    expect(result.taskStatus).toBe('completed');
    expect(result.metadataPatch.complianceReviewStatus).toBe('not_required');
  });

  it('marks task completed for auto libraries as well', () => {
    const task = { id: 'task-1', name: '测试', status: 'running', metadata: {} };
    const items = [{ caseId: '1', caseCode: 'A', caseName: '违规', passed: false }];
    const result = resolveCompletionAfterExecute({ task, items, libraries: [autoLibrary] });
    expect(result.taskStatus).toBe('completed');
    expect(result.metadataPatch.complianceReviewStatus).toBe('not_required');
  });

  it('blocks task when all planned cases are skipped', () => {
    const task = { id: 'task-1', name: '测试', status: 'running', metadata: {} };
    const items = [
      {
        caseId: '1',
        caseCode: 'A',
        caseName: '未执行',
        passed: false,
        executionStatus: 'skipped' as const,
      },
    ];
    const result = resolveCompletionAfterExecute({ task, items, libraries: [autoLibrary] });
    expect(result.taskStatus).toBe('blocked');
    expect(result.metadataPatch.complianceExecutionBlockedReason).toContain('Agent API');
  });

  it('allows finalize for completed tasks without manual review', () => {
    const task = {
      id: 'task-1',
      status: 'completed',
      metadata: { complianceReviewStatus: 'not_required' },
    };
    const preview = enrichComplianceReportPreview(
      buildComplianceReportPreview({
        task,
        items: [{ caseId: '1', caseCode: 'A', caseName: '合规', passed: true }],
      }),
      task,
    );
    expect(preview.requiresManualReview).toBe(false);
    expect(preview.canApproveReview).toBe(false);
    expect(canFinalizeComplianceReport(task, preview).ok).toBe(true);
  });

  it('treats legacy reviewing status as completed for finalize', () => {
    const task = {
      id: 'task-1',
      status: 'reviewing',
      metadata: { complianceReviewStatus: 'pending' },
    };
    const preview = enrichComplianceReportPreview(
      buildComplianceReportPreview({
        task,
        items: [{ caseId: '1', caseCode: 'A', caseName: '违规', passed: false }],
      }),
      task,
    );
    expect(preview.taskStatus).toBe('completed');
    expect(canFinalizeComplianceReport(task, preview).ok).toBe(true);
  });

  it('allows finalized reports to be regenerated but keeps archived reports locked', () => {
    const task = {
      id: 'task-1',
      status: 'completed',
      metadata: { complianceReportId: 'report-1' },
    };
    const finalizedPreview = enrichComplianceReportPreview(
      buildComplianceReportPreview({
        task,
        items: [{ caseId: '1', caseCode: 'A', caseName: '合规', passed: true }],
      }),
      task,
    );
    expect(canFinalizeComplianceReport(task, { ...finalizedPreview, status: 'finalized' }).ok).toBe(
      true,
    );
    expect(canFinalizeComplianceReport(task, { ...finalizedPreview, status: 'archived' }).ok).toBe(
      false,
    );
  });

  it('applies manual case override', () => {
    const next = applyComplianceCaseOverride(
      [{ caseId: 'case-1', caseCode: 'A', caseName: '样本', passed: false }],
      'case-1',
      true,
      '误报',
    );
    expect(next[0]?.passed).toBe(true);
    expect(next[0]?.judgeMode).toBe('manual_review');
  });

  it('builds markdown report body', () => {
    const preview = buildComplianceReportPreview({
      task: {
        id: 'task-1',
        name: '金融顾问',
        status: 'completed',
        metadata: { domain: '金融合规' },
      },
      items: [
        {
          caseId: '1',
          caseCode: 'A',
          caseName: '违规样本',
          passed: false,
          regClause: '条例',
          outputSnippet: 'Agent 输出了违规样本',
          judgmentRule: '大模型判定：命中违规表达',
          judgeMode: 'llm_judge',
          judgeConfidence: 0.92,
          libraryId: 'lib-1',
          libraryTitle: '金融库',
        },
      ],
      libraries: [{ id: 'lib-1', title: '金融库' }],
    });
    const markdown = buildComplianceReportMarkdown(preview);
    expect(markdown).toContain('合规评估报告');
    expect(markdown).toContain('文档信息');
    expect(markdown).toContain('基本信息');
    expect(markdown).toContain('合规综合评分');
    expect(markdown).toContain('检测项: 金融库');
    expect(markdown).toContain('题库测评汇总');
    expect(markdown).toContain('违规样本');
    expect(markdown).toContain('恶意输出片段');
    expect(markdown).toContain('Agent 输出了违规样本');
    expect(markdown).toContain('风险描述');
    expect(markdown).toContain('大模型判定：命中违规表达');
    expect(markdown).toContain('风险依据');
    expect(markdown).toContain('整改建议');
    expect(markdown).toContain('判定依据');
    expect(markdown).toContain('92.00%');
    expect(markdown).toContain('版权与保密声明');
    expect(markdown).toContain('本文件包含被检测系统的敏感信息');
    expect(markdown).toMatch(/## 文档信息[\s\S]*?## 修订记录[\s\S]*?---[\s\S]*?## 一、 基本信息/);
    expect(markdown).not.toContain('ZHIAN_PASS_RATE_CHART');
    expect(markdown).not.toContain('图 1');
    expect(markdown).not.toContain('处理建议');
    expect(markdown).not.toContain('准入建议');
  });
});
