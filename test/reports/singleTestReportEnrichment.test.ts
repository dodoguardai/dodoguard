import { describe, expect, it } from '@jest/globals';
import {
  getApiBlackboxReportTitle,
  renderApiBlackboxSecurityReport,
} from '../../backend/src/reports/markdown/ApiBlackboxSecurityReport';
import { renderCozeConfigAuditReportFromTaskData } from '../../backend/src/reports/markdown/CozeConfigAuditSecurityReport';
import { renderDifyConfigAuditReportFromTaskData } from '../../backend/src/reports/markdown/DifyConfigAuditSecurityReport';
import { renderFastGptConfigAuditReportFromTaskData } from '../../backend/src/reports/markdown/FastGptConfigAuditSecurityReport';
import {
  enrichSingleTestReportResult,
  formatUserTurnsAsVerificationCommand,
  resolveSingleTestReportTitleSuffix,
  resolveSingleTestResponseForReport,
  resolveSingleTestVerificationCommand,
} from '../../backend/src/reports/markdown/singleTestReportEnrichment';
import type { ReportData } from '../../backend/src/services/reportTypes';

const multiRoundMetadata = {
  taskKind: 'single_test',
  runSource: 'single',
  creationMode: 'multi_round_test',
  multiRoundTest: {
    preRecorded: true,
    transcript: [
      { role: 'user', content: '第一轮探测' },
      { role: 'assistant', content: '第一轮回复' },
      { role: 'user', content: '第二轮探测' },
      { role: 'assistant', content: '第二轮回复' },
    ],
  },
  singleTest: { prompt: '第一轮探测\n---\n第二轮探测'.slice(0, 500) },
};

const vulnerableResult = {
  vulnerabilityId: null as unknown as string,
  commandId: null as unknown as string,
  attackMode: 'conversation',
  request: { prompt: '第一轮探测' },
  response: { preview: '第一轮回复' },
  detectionResults: null,
  finalVerdict: { vulnerable: true, riskLevel: 'high', reason: 'judge reason' },
  createdAt: new Date().toISOString(),
};

const reportSummary = {
  totalVulnerabilities: 0,
  highRiskCount: 1,
  mediumRiskCount: 0,
  lowRiskCount: 0,
  executionTime: 60_000,
  completedAt: new Date().toISOString(),
  totalFindings: 1,
  vulnerableFindings: 1,
};

describe('singleTestReportEnrichment', () => {
  it('resolves cover title suffix by creation mode', () => {
    expect(
      resolveSingleTestReportTitleSuffix({
        taskKind: 'single_test',
        taskMetadata: { creationMode: 'single_test' },
      }),
    ).toBe('【单次测试】');
    expect(
      resolveSingleTestReportTitleSuffix({
        taskKind: 'single_test',
        taskMetadata: { creationMode: 'multi_round_test' },
      }),
    ).toBe('【多轮测试】');
    expect(
      resolveSingleTestReportTitleSuffix({
        taskKind: 'single_test',
        taskMetadata: { creationMode: 'multi_round_excel_test' },
      }),
    ).toBe('【Excel批量测试】');
    expect(
      resolveSingleTestReportTitleSuffix({
        taskKind: 'api_test',
        taskMetadata: { creationMode: 'single_test' },
      }),
    ).toBe('');
  });

  it('appends suffix to api blackbox report title', () => {
    const title = getApiBlackboxReportTitle({
      targetName: 'Demo Agent',
      taskName: 'Demo Task',
      platformFamily: 'dify',
      taskKind: 'single_test',
      taskMetadata: { creationMode: 'multi_round_test' },
    });
    expect(title).toBe('Demo Agent API 黑盒安全测试报告【多轮测试】');
  });

  it('uses request.prompt for single-round verification command', () => {
    expect(
      resolveSingleTestVerificationCommand(
        { request: { prompt: 'hello probe' } },
        { taskKind: 'single_test', singleTest: { prompt: 'hello probe' } },
      ),
    ).toBe('hello probe');
  });

  it('uses full user turns for multi-round verification command', () => {
    const cmd = resolveSingleTestVerificationCommand(
      { request: { prompt: '第一轮探测' } },
      multiRoundMetadata,
    );
    expect(cmd).toContain('【第 1 轮】');
    expect(cmd).toContain('第一轮探测');
    expect(cmd).toContain('【第 2 轮】');
    expect(cmd).toContain('第二轮探测');
  });

  it('replaces agent output preview with full transcript for multi-round', () => {
    const response = resolveSingleTestResponseForReport(
      { preview: '第一轮回复' },
      multiRoundMetadata,
    ) as { preview?: string };
    expect(response.preview).toContain('【用户】 第一轮探测');
    expect(response.preview).toContain('【智能体】 第一轮回复');
    expect(response.preview).toContain('【用户】 第二轮探测');
    expect(response.preview).toContain('【智能体】 第二轮回复');
  });

  it('keeps single-round response unchanged', () => {
    const response = resolveSingleTestResponseForReport(
      { preview: 'only reply' },
      { taskKind: 'single_test', singleTest: { prompt: 'one shot' } },
    );
    expect(response).toEqual({ preview: 'only reply' });
  });

  it('does not override existing verificationCommand from vulnerability library', () => {
    expect(
      resolveSingleTestVerificationCommand(
        { verificationCommand: 'db command', request: { prompt: 'ignored' } },
        multiRoundMetadata,
      ),
    ).toBe('db command');
  });

  it('formatUserTurnsAsVerificationCommand labels multiple rounds', () => {
    expect(
      formatUserTurnsAsVerificationCommand([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]),
    ).toBe('【第 1 轮】\na\n\n【第 2 轮】\nc');
  });
});

describe('single-test report markdown (all runtime templates)', () => {
  const enriched = enrichSingleTestReportResult(vulnerableResult, multiRoundMetadata);

  const baseReport: ReportData = {
    taskId: 'task-single-1',
    organizationId: 'org-1',
    taskKind: 'single_test',
    taskMetadata: multiRoundMetadata,
    taskName: '多轮单次测试',
    vulnerabilities: [],
    results: [enriched],
    summary: reportSummary,
  };

  it('api_blackbox §7 shows full verification command and conversation', () => {
    const md = renderApiBlackboxSecurityReport({
      ...baseReport,
      taskTypeCode: 'dify_api_scan',
    });
    expect(md).toMatch(/^# .+【多轮测试】/m);
    expect(md).toContain('| 报告名称 | 多轮单次测试 API 黑盒安全测试报告【多轮测试】 |');
    expect(md).toContain('# 7. 详细发现');
    expect(md).toContain('【第 2 轮】');
    expect(md).toContain('第二轮探测');
    expect(md).toContain('【智能体】 第二轮回复');
    expect(md).not.toMatch(/\| 验证命令 \| —/);
  });

  it('dify config_audit §7 runtime row shows full conversation', () => {
    const md = renderDifyConfigAuditReportFromTaskData({
      ...baseReport,
      taskTypeCode: 'dify_config_audit',
      taskMetadata: {
        ...multiRoundMetadata,
        configAudit: { fileName: 'app.yml', yaml: 'nodes: []' },
      },
    });
    expect(md).toContain('| 验证命令 |');
    expect(md).toContain('第二轮探测');
    expect(md).toContain('【智能体】 第二轮回复');
  });

  it('coze config_audit §7 runtime row shows full conversation', () => {
    const md = renderCozeConfigAuditReportFromTaskData({
      ...baseReport,
      platformFamily: 'coze',
      taskTypeCode: 'dify_config_audit',
      taskMetadata: {
        ...multiRoundMetadata,
        configAudit: { fileName: 'bot.json', json: '{}' },
      },
    });
    expect(md).toContain('第二轮探测');
    expect(md).toContain('【智能体】 第二轮回复');
  });

  it('fastgpt config_audit §7 runtime row shows full conversation', () => {
    const md = renderFastGptConfigAuditReportFromTaskData({
      ...baseReport,
      platformFamily: 'fastgpt',
      taskTypeCode: 'dify_config_audit',
      taskMetadata: {
        ...multiRoundMetadata,
        configAudit: { fileName: 'app.json', json: '{}' },
      },
    });
    expect(md).toContain('第二轮探测');
    expect(md).toContain('【智能体】 第二轮回复');
  });

  it('does not override library verificationCommand when enriching', () => {
    const regular = {
      vulnerabilityId: 'v1',
      vulnerabilityName: 'Named vuln',
      commandId: 'cmd-1',
      verificationCommand: 'library command',
      attackMode: 'direct',
      request: { prompt: 'should not appear' },
      response: { preview: 'agent reply only' },
      detectionResults: null,
      finalVerdict: { vulnerable: true, riskLevel: 'high', reason: 'x' },
      createdAt: new Date().toISOString(),
    };
    const enrichedRegular = enrichSingleTestReportResult(regular, {
      taskKind: 'single_test',
      singleTest: { prompt: 'ignored' },
    });
    expect(enrichedRegular.verificationCommand).toBe('library command');
    expect((enrichedRegular.response as { preview?: string }).preview).toBe('agent reply only');
  });
});
