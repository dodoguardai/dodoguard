import {
  buildAgentSecurityAssessmentSummary,
  renderAgentSecurityAssessmentReport,
} from '../../backend/src/reports/markdown/AgentSecurityAssessmentReport';
import type { ReportData } from '../../backend/src/services/reportTypes';

function buildData(total: number, failed: number): ReportData {
  const results: ReportData['results'] = [];
  for (let i = 0; i < total; i++) {
    const vulnerable = i < failed;
    const vulnerabilityId = i % 2 === 0 ? 'v-system-prompt' : 'v-prompt-tamper';
    results.push({
      vulnerabilityId,
      vulnerabilityName: vulnerabilityId === 'v-system-prompt' ? '系统提示词泄露' : '提示词篡改',
      commandId: `cmd-${i + 1}`,
      verificationCommand: `测试题 ${i + 1}`,
      attackMode: '自动化对抗测试',
      request: { prompt: `原始题 ${i + 1}` },
      response: { preview: vulnerable ? `恶意输出片段 ${i + 1}` : '安全拒答' },
      detectionResults: {},
      finalVerdict: vulnerable
        ? { vulnerable: true, riskLevel: 'high', reason: `问题分析 ${i + 1}` }
        : { vulnerable: false, riskLevel: 'low', reason: '通过' },
      createdAt: `2026-04-23T18:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }
  return {
    taskId: 'task-1',
    organizationId: 'org-1',
    organizationName: '测试组织',
    taskName: '智能体安全测评',
    targetName: '测试LLM-Copy',
    targetType: 'agent',
    targetDisplayType: '智能体',
    attackMode: 'batch',
    taskMetadata: { passThreshold: 95 },
    vulnerabilities: [
      {
        id: 'v-system-prompt',
        name: '系统提示词泄露',
        riskLevel: 'high',
        description: '诱导模型泄露系统提示词、初始化信息与内部规则。',
        affectedTargets: [],
        exploitability: {},
        patchStatus: {},
      },
      {
        id: 'v-prompt-tamper',
        name: '提示词篡改',
        riskLevel: 'medium',
        description: '覆盖、改写与角色重置攻击。',
        affectedTargets: [],
        exploitability: {},
        patchStatus: {},
      },
    ],
    results,
    summary: {
      totalVulnerabilities: 2,
      highRiskCount: failed > 0 ? 1 : 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      executionTime: 90_000,
      completedAt: '2026-04-23T18:23:32.000Z',
      totalFindings: total,
      vulnerableFindings: failed,
      testStart: '2026-04-23T18:14:45.000Z',
      testEnd: '2026-04-23T18:23:32.000Z',
    },
  };
}

describe('AgentSecurityAssessmentReport', () => {
  it('computes exam-style pass rate and failed conclusion', () => {
    const summary = buildAgentSecurityAssessmentSummary(buildData(100, 20));
    expect(summary.totalCases).toBe(100);
    expect(summary.passedCases).toBe(80);
    expect(summary.failedCases).toBe(20);
    expect(summary.passRate).toBe(80);
    expect(summary.passThreshold).toBe(95);
    expect(summary.conclusion).toBe('failed');
    expect(summary.conclusionLabel).toBe('未通过');
  });

  it('renders table of contents, result summary, failed cases and question-bank summary', () => {
    const md = renderAgentSecurityAssessmentReport(buildData(100, 20));
    expect(md).toContain('## 目录');
    expect(md).toContain('# 文档信息');
    expect(md).toContain('# 一、 基本信息');
    expect(md).toContain('测试智能体：测试LLM-Copy；评估模型：—');
    expect(md).toContain('测试时间：2026-04-23 18:14:45 至 2026-04-23 18:23:32');
    expect(md).toContain('测试题目总数：100，通过 80，不通过 20，总体通过率 80.00%。');
    expect(md).not.toContain('| 评分项 | 数值 | 判定 |');
    expect(md).toContain('# 二、 测评结果');
    expect(md).toContain('| 原始题 |');
    expect(md).toContain('智能体输出片段');
    expect(md).toContain('恶意输出片段 1');
    expect(md).toContain('# 三、题库测评汇总');
    expect(md).toContain('| **总体** | **80** | **100** | **80.00%** | **未通过** |');
    expect(md).not.toContain('版权说明');
    expect(md).not.toContain('ZHIAN_PASS_RATE_CHART');
    expect(md).not.toContain('图 1');
    expect(md).not.toContain('处理建议');
    expect(md).not.toContain('整改建议');
  });

  it('marks a dimension failed when its pass rate is below threshold', () => {
    const data = buildData(9, 1);
    data.taskMetadata = { passThreshold: 90 };
    data.results = data.results.map((result) => ({
      ...result,
      vulnerabilityId: 'v-agent-breakout',
      vulnerabilityName: '诱导Agent突破回答限制',
    }));

    const md = renderAgentSecurityAssessmentReport(data);

    expect(md).toContain('共测试 9 条，通过 8 条，不通过 1 条，通过率 88.89%。');
    expect(md).toContain('判定结论：未通过（标准通过率 90.00%）。');
    expect(md).not.toContain('判定结论：条件通过（标准通过率 90.00%）。');
  });
});
