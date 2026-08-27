/**
 * Report content renderer factory.
 * Returns the appropriate content component based on report type.
 */

import type { ReactNode } from 'react';

import { type DifyAuditData, DifyConfigAuditReportContent } from './dify-config-audit-content';
import type { Report } from '@/types/entities';

export type ReportContentRenderMode = 'custom' | 'markdown' | 'html' | 'unsupported';

export interface ReportContentRenderResult {
  mode: ReportContentRenderMode;
  component?: ReactNode;
}

function hasStoredReportBody(report: Report): boolean {
  return typeof report.content === 'string' && report.content.trim().length > 0;
}

function isStructuredConfigReportType(reportType: string | undefined): boolean {
  return (
    reportType === 'dify_config_audit' ||
    reportType === 'dify_config_static' ||
    reportType === 'skills_md_audit' ||
    reportType === 'mcp_source_audit' ||
    reportType === 'coze_config_audit' ||
    reportType === 'coze_config_static' ||
    reportType === 'fastgpt_config_audit' ||
    reportType === 'fastgpt_config_static' ||
    reportType === 'n8n_config_audit'
  );
}

/**
 * Returns the render strategy for a report's full content section.
 * For SKILLS / MCP audits, prefer structured auditData UI (more readable than wide markdown tables).
 * Otherwise when the backend persisted full Markdown/HTML, show that first.
 */
export function getReportContentRender(report: Report): ReportContentRenderResult {
  const reportType = (report as Report & { reportType?: string }).reportType;
  const metadata = (report.metadata || {}) as Record<string, unknown>;

  const auditData = metadata.auditData as
    | {
        summary: string;
        overallRisk: string;
        findings: unknown[];
        recommendations: string[];
        warnings?: string[];
        truncated?: boolean;
      }
    | undefined;

  const hasAuditData =
    auditData && typeof auditData.summary === 'string' && Array.isArray(auditData.findings);

  // SKILLS / MCP: structured UI is clearer than wide markdown tables.
  // Config gray-box: prefer persisted Markdown full body when present.
  const preferStructuredUi = reportType === 'skills_md_audit' || reportType === 'mcp_source_audit';

  if (isStructuredConfigReportType(reportType) && hasAuditData && preferStructuredUi) {
    return {
      mode: 'custom',
      component: (
        <DifyConfigAuditReportContent
          auditData={auditData as DifyAuditData}
          fileName={metadata.fileName as string | undefined}
          locale="zh"
          variant={reportType === 'mcp_source_audit' ? 'mcp' : 'skills'}
          truncationMessage={
            reportType === 'skills_md_audit' || reportType === 'mcp_source_audit'
              ? '部分文档因模型长度限制被截断。'
              : undefined
          }
        />
      ),
    };
  }

  if (isStructuredConfigReportType(reportType) && hasStoredReportBody(report)) {
    if (report.format === 'md') {
      return { mode: 'markdown' };
    }
    if (report.format === 'html' || report.format === 'pdf') {
      return { mode: 'html' };
    }
  }

  if (isStructuredConfigReportType(reportType) && hasAuditData) {
    return {
      mode: 'custom',
      component: (
        <DifyConfigAuditReportContent
          auditData={auditData as DifyAuditData}
          fileName={metadata.fileName as string | undefined}
          locale="zh"
          truncationMessage={
            reportType === 'skills_md_audit' || reportType === 'mcp_source_audit'
              ? '部分文档因模型长度限制被截断。'
              : reportType === 'coze_config_audit' || reportType === 'coze_config_static'
                ? '部分 Coze 工作流内容因模型长度限制被截断。'
                : reportType === 'fastgpt_config_audit' || reportType === 'fastgpt_config_static'
                  ? '部分 FastGPT 工作流内容因模型长度限制被截断。'
                  : reportType === 'dify_config_audit' || reportType === 'dify_config_static'
                    ? '部分 Dify 工作流内容因模型长度限制被截断。'
                    : undefined
          }
          fallbackFullReportNote={
            reportType === 'dify_config_audit'
              ? '当前为导出 YAML 的大模型审计摘要。完整正文（含配置规则/命令级检测与运行时 API 对抗）请在「报告」中生成报告，或打开已保存且含 Markdown 正文的报告。'
              : reportType === 'coze_config_audit' || reportType === 'coze_config_static'
                ? '当前为 Coze 工作流导出 YAML 的审计摘要。完整正文请在「报告」中生成报告，或打开已保存且含 Markdown 正文的报告。'
                : reportType === 'fastgpt_config_audit' || reportType === 'fastgpt_config_static'
                  ? '当前为 FastGPT 工作流导出 JSON 的审计摘要。完整正文请在「报告」中生成报告，或打开已保存且含 Markdown 正文的报告。'
                  : reportType === 'n8n_config_audit'
                    ? '当前为 n8n 工作流导出 JSON 的审计摘要。完整正文请打开已保存且含 Markdown 正文的报告。'
                    : reportType === 'mcp_source_audit'
                      ? '当前为 MCP 服务端源码审计的结构化摘要。完整 Markdown 正文请在「报告」中生成报告，或打开已保存且含正文的报告。'
                      : undefined
          }
          variant={
            reportType === 'mcp_source_audit'
              ? 'mcp'
              : reportType === 'skills_md_audit'
                ? 'skills'
                : reportType === 'coze_config_audit' || reportType === 'coze_config_static'
                  ? 'coze'
                  : reportType === 'fastgpt_config_audit' || reportType === 'fastgpt_config_static'
                    ? 'fastgpt'
                    : 'dify'
          }
        />
      ),
    };
  }

  if (report.format === 'md' && report.content) {
    return { mode: 'markdown' };
  }
  if (report.format === 'html') {
    return { mode: 'html' };
  }
  if (report.format === 'pdf') {
    // Backend stores an HTML preview string in `content` so we can render it in-page.
    if (report.content) {
      return { mode: 'html' };
    }
  }
  return { mode: 'unsupported' };
}
