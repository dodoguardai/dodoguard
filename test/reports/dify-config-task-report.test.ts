import { describe, expect, it } from '@jest/globals';
import { renderDifyConfigAuditReportFromTaskData } from '../../backend/src/reports/markdown/DifyConfigAuditSecurityReport';

import type { ReportData } from '../../backend/src/services/reportTypes';

const minimalStatic: ReportData = {
  taskId: 'task-static-1',
  organizationId: 'org-1',
  taskKind: 'config_static',
  taskTypeCode: 'dify_config_static',
  taskName: 'Static scan',
  taskMetadata: {
    configAudit: { fileName: 'app.yml' },
    configAuditStaticSummary: {
      summary: 'Static summary line.',
      overallRisk: 'medium',
      findingsCount: 1,
      findings: [
        {
          severity: 'high',
          category: 'Tools',
          location: 'nodes[0]',
          issue: 'Issue text',
          evidence: 'evidence snippet',
          recommendation: 'Apply fix',
        },
      ],
      recommendations: ['Harden defaults'],
      warnings: [],
      truncated: false,
    },
  },
  vulnerabilities: [],
  results: [],
  summary: {
    totalVulnerabilities: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0,
    executionTime: 0,
    completedAt: new Date().toISOString(),
    totalFindings: 0,
    vulnerableFindings: 0,
  },
};

describe('renderDifyConfigAuditReportFromTaskData', () => {
  it('includes document control, aligned sections, static block, and closing sections', () => {
    const md = renderDifyConfigAuditReportFromTaskData(minimalStatic);
    expect(md).toContain('文档控制信息');
    expect(md).toContain('# 1. 执行摘要');
    expect(md).toContain('# 2. 测试目标');
    expect(md).toContain('# 7. 详细发现');
    expect(md).toContain('## 7.1 导出 YAML 结构化审计（大模型）');
    expect(md).toContain('## 7.2 配置 YAML 规则与命令级检测');
    expect(md).toContain('## 7.3 运行时 API / 对抗验证');
    expect(md).toContain('# 8. 参考标准与依据');
    expect(md).toContain('# 9. 管理结论与复测');
    expect(md).toContain('## 9.1 结论总览');
    expect(md).toContain('### 9.1.1 运行时 / API 验证（漏洞库维度）');
    expect(md).toContain('### 9.1.2 配置静态审计（A–F 类别）');
    expect(md).toContain('风险类别（Dify 基础类）');
    expect(md).toContain('安全类别（Dify 配置审计）');
    expect(md).toContain('外连、工具与 SSRF（C_network）');
    expect(md).toContain('1 条静态发现（按 category 聚合）');
    expect(md).toContain('# 10. 保密与版权声明');
    expect(md).toContain('app.yml');
    expect(md).toContain('### 7.1.1');
    expect(md).toContain('| 严重度 | HIGH |');
    expect(md).toContain('| DSL 定位 | nodes[0] |');
    expect(md).toContain('| 任务名称 | Static scan |');
  });

  it('lists vulnerable runtime rows in 7.3 for config_audit', () => {
    const data: ReportData = {
      ...minimalStatic,
      taskKind: 'config_audit',
      taskTypeCode: 'dify_config_audit',
      results: [
        {
          vulnerabilityId: 'vuln-1',
          vulnerabilityName: 'Named vuln',
          commandId: 'cmd-1',
          verificationCommand: 'verify',
          expectedSuccess: 'yes',
          nonVulnerability: 'no',
          attackMode: 'direct',
          request: {},
          response: { preview: 'agent said' },
          detectionResults: {
            ruleHits: [
              { ruleId: 'r1', ruleName: '检测规则 A', logicalPath: '/graph/nodes/0' },
              { ruleId: 'r2', ruleName: '检测规则 B' },
            ],
            llmEvidence: {
              evidencePaths: ['/workflow/graph/nodes/1', '/graph/nodes/0'],
            },
          },
          finalVerdict: { vulnerable: true, riskLevel: 'high', reason: 'failed check' },
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        ...minimalStatic.summary,
        totalFindings: 1,
        vulnerableFindings: 1,
        highRiskCount: 1,
        executionTime: 90_000,
      },
    };
    const md = renderDifyConfigAuditReportFromTaskData(data);
    expect(md).toContain('### 9.1.1 运行时 / API 验证（漏洞库维度）');
    expect(md).toContain('风险类别（Dify 基础类）');
    expect(md).toContain('安全类别（Dify 配置审计）');
    expect(md).toContain('| Execution Time（执行耗时） | 1.5 分钟 |');
    expect(md).toContain('### 7.3.1');
    expect(md).toContain('Named vuln');
    expect(md).toContain('| 验证命令 |');
    expect(md).toContain('verify');
    expect(md).toContain('| 智能体输出 |');
    expect(md).toContain('agent said');
    expect(md).toContain('| 验证规则 |');
    expect(md).toContain('检测规则 A<br>检测规则 B');
    expect(md).toContain('| 配置节点 |');
    expect(md).toContain('/graph/nodes/0');
    expect(md).not.toContain('/workflow/graph/nodes/1');

    const mdLineFallback = renderDifyConfigAuditReportFromTaskData({
      ...data,
      results: [
        {
          ...data.results[0],
          detectionResults: {
            ruleHits: [
              {
                ruleId: 'r1',
                ruleName: '仅全文命中',
                matchStart: 10,
                matchEnd: 12,
                startLine: 42,
                endLine: 42,
                matchScope: 'full_text',
              },
            ],
          },
        },
      ],
    });
    expect(mdLineFallback).toContain('全文命中 · 约第 42 行');

    const mdNoDuration = renderDifyConfigAuditReportFromTaskData({
      ...data,
      summary: { ...data.summary, executionTime: 0 },
    });
    expect(mdNoDuration).toContain('| Execution Time（执行耗时） | — |');
  });

  it('lists static://config-yaml rounds in 7.2 and excludes them from 7.3 vulnerable list', () => {
    const data: ReportData = {
      ...minimalStatic,
      taskKind: 'config_audit',
      taskTypeCode: 'dify_config_audit',
      results: [
        {
          vulnerabilityId: 'static-v',
          vulnerabilityName: 'Static rule hit',
          commandId: 'yaml-cmd',
          verificationCommand: 'static check',
          expectedSuccess: 'yes',
          nonVulnerability: 'no',
          attackMode: 'direct',
          request: { url: 'static://config-yaml' },
          response: { preview: 'yaml scan out' },
          detectionResults: {},
          finalVerdict: { vulnerable: false, riskLevel: 'low', reason: 'pass' },
          createdAt: new Date().toISOString(),
        },
        {
          vulnerabilityId: 'api-v',
          vulnerabilityName: 'API vuln',
          commandId: 'api-cmd',
          verificationCommand: 'api verify',
          expectedSuccess: 'yes',
          nonVulnerability: 'no',
          attackMode: 'direct',
          request: { url: 'https://example.com/chat' },
          response: { preview: 'api agent' },
          detectionResults: {},
          finalVerdict: { vulnerable: true, riskLevel: 'high', reason: 'bad' },
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        ...minimalStatic.summary,
        totalFindings: 2,
        vulnerableFindings: 1,
        highRiskCount: 1,
        executionTime: 0,
      },
    };
    const md = renderDifyConfigAuditReportFromTaskData(data);
    expect(md).toContain('### 7.2.1');
    expect(md).toContain('Static rule hit');
    expect(md).toContain('yaml scan out');
    expect(md).toContain('### 7.3.1');
    expect(md).toContain('API vuln');
    expect(md).toContain('api agent');
    expect(md).not.toMatch(/### 7\.3\.2/);
  });

  it('falls back 验证规则 to verificationCommand; 配置节点 stays — without rule logicalPath', () => {
    const data: ReportData = {
      ...minimalStatic,
      taskKind: 'config_audit',
      taskTypeCode: 'dify_config_audit',
      results: [
        {
          vulnerabilityId: 'vuln-1',
          vulnerabilityName: 'V',
          commandId: 'c1',
          verificationCommand: '回退用的验证说明',
          expectedSuccess: '—',
          nonVulnerability: '—',
          attackMode: 'direct',
          request: {},
          response: {},
          detectionResults: {},
          finalVerdict: {
            vulnerable: true,
            riskLevel: 'high',
            reason: 'x',
            evidencePaths: ['/app/workflow/nodes/2'],
          },
          createdAt: new Date().toISOString(),
        },
      ],
      summary: {
        ...minimalStatic.summary,
        totalFindings: 1,
        vulnerableFindings: 1,
        highRiskCount: 1,
        executionTime: 0,
      },
    };
    const md = renderDifyConfigAuditReportFromTaskData(data);
    expect(md).toContain('回退用的验证说明');
    expect(md).not.toContain('/app/workflow/nodes/2');
  });
});
