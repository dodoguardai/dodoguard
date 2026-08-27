import fs from 'node:fs';
import path from 'node:path';

import logger from '../logger';
import { renderAgentSecurityAssessmentReport } from '../reports/markdown/AgentSecurityAssessmentReport';
import { getApiBlackboxReportTitle } from '../reports/markdown/ApiBlackboxSecurityReport';
import {
  getDifyConfigTaskReportTitle,
  renderDifyConfigAuditReportFromTaskData,
} from '../reports/markdown/DifyConfigAuditSecurityReport';
import { resolveTaskReportKind } from '../reports/markdown/resolveTaskReportKind';
import {
  loadReportBrandConfig,
  type ReportBrandConfig,
  resolveReportBrandConfig,
} from '../reports/reportBrandConfig';
import { REPORT_PRODUCT_BRAND_ZH } from '../reports/reportBrandText';

import type { ReportData } from './reportTypes';

export type ReportFormat = 'md' | 'html' | 'pdf' | 'docx';

export interface ReportTemplateRow {
  name?: string;
  htmlTemplate?: string;
  styles?: string;
}

export interface ReportFormatContext {
  format: ReportFormat;
  template: ReportTemplateRow | null;
}

export interface ReportFormatStrategy {
  generateContent(
    data: ReportData,
    ctx: ReportFormatContext,
  ): Promise<{ content: string | Buffer; metadata?: Record<string, unknown> }>;
  getContentType(): string;
}

class MarkdownReportStrategy implements ReportFormatStrategy {
  async generateContent(data: ReportData, _ctx: ReportFormatContext): Promise<{ content: string }> {
    const markdown = await generateMarkdownReport(data);
    return { content: markdown };
  }

  getContentType(): string {
    return 'text/markdown';
  }
}

class HtmlReportStrategy implements ReportFormatStrategy {
  async generateContent(data: ReportData, _ctx: ReportFormatContext): Promise<{ content: string }> {
    const html = await generateHtmlReport(data);
    return { content: html };
  }

  getContentType(): string {
    return 'text/html';
  }
}

class PdfReportStrategy implements ReportFormatStrategy {
  async generateContent(data: ReportData, _ctx: ReportFormatContext): Promise<{ content: string }> {
    // For now reuse the HTML content as the underlying representation.
    // A future implementation can convert this HTML into a real PDF.
    const html = await generateHtmlReport(data);
    return { content: html };
  }

  getContentType(): string {
    return 'application/pdf';
  }
}

class DocxReportStrategy implements ReportFormatStrategy {
  async generateContent(data: ReportData, _ctx: ReportFormatContext): Promise<{ content: string }> {
    const html = await generateHtmlReport(data);
    return { content: html };
  }

  getContentType(): string {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}

const markdownStrategy = new MarkdownReportStrategy();
const htmlStrategy = new HtmlReportStrategy();
const pdfStrategy = new PdfReportStrategy();
const docxStrategy = new DocxReportStrategy();

export function getReportFormatStrategy(format: string): ReportFormatStrategy {
  const normalized = String(format || 'pdf').toLowerCase() as ReportFormat;
  switch (normalized) {
    case 'md':
      return markdownStrategy;
    case 'html':
      return htmlStrategy;
    case 'pdf':
      return pdfStrategy;
    case 'docx':
      return docxStrategy;
    default:
      return pdfStrategy;
  }
}

async function generateMarkdownReport(data: ReportData): Promise<string> {
  try {
    const kind = resolveTaskReportKind(data);
    if (
      kind === 'dify_config_audit' ||
      kind === 'dify_config_static' ||
      kind === 'coze_config_audit' ||
      kind === 'coze_config_static' ||
      kind === 'fastgpt_config_audit' ||
      kind === 'fastgpt_config_static'
    ) {
      return renderDifyConfigAuditReportFromTaskData(data);
    }
    return renderAgentSecurityAssessmentReport(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to generate markdown report, falling back to simple markdown: ${message}`);
    return generateFallbackMarkdownReport(data);
  }
}

function generateFallbackMarkdownReport(data: ReportData): string {
  const generatedAt = new Date().toISOString();
  const taskName = data.taskName || 'Attack Task';

  return `# Attack Task Security Report
**Task Name:** ${taskName}
**Task ID:** ${data.taskId}
**Organization:** ${data.organizationId}
**Generated At:** ${generatedAt}

> Fallback markdown report. The Dify pentest template could not be rendered.
`;
}

function statusClassFromText(value: string): 'success' | 'warn' | 'danger' | null {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  if (
    !/^(通过|建议通过|不建议通过|条件通过|附条件通过|未通过|不通过|达标|未达标|已审核|待审核|失败|不安全（未通过）|未发现高优先级风险|存在高优先级风险)$/.test(
      text,
    )
  ) {
    return null;
  }
  if (/未通过|不通过|不建议通过|未达标|阻断|高优先级风险|失败/i.test(text)) {
    return 'danger';
  }
  if (/条件|附条件|待确认|待审核|少量|偏差/i.test(text)) {
    return 'warn';
  }
  if (/通过|达标|已审核|未发现/i.test(text)) {
    return 'success';
  }
  return null;
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decorateStatusHtml(innerHtml: string): string {
  if (/status-pill/.test(innerHtml)) {
    return innerHtml;
  }
  const statusClass = statusClassFromText(stripHtmlTags(innerHtml));
  return statusClass ? `<span class="status-pill ${statusClass}">${innerHtml}</span>` : innerHtml;
}

function decorateReportVerdicts(html: string): string {
  return html
    .replace(
      /<strong>(通过|建议通过|不建议通过|条件通过|附条件通过|未通过|不通过|达标|未达标)<\/strong>/g,
      (_all, inner: string) => {
        return `<span class="status-pill ${statusClassFromText(inner) ?? 'success'}">${inner}</span>`;
      },
    )
    .replace(
      /<strong>(综合结论\s*[:：]\s*)([^<]+)<\/strong>/g,
      (_all, label: string, value: string) => {
        return `<strong>${label}${decorateStatusHtml(value)}</strong>`;
      },
    )
    .replace(/<td>([\s\S]*?)<\/td>/g, (_all, inner: string) => {
      return `<td>${decorateStatusHtml(inner)}</td>`;
    });
}

function buildAttackTaskTextSummary(
  data: ReportData,
  testTimeRange: string,
  totalFindings: number,
  vulnerableFindings: number,
): {
  overallRiskText: string;
  overviewText: string;
  testSummaryText: string;
} {
  const { highRiskCount, mediumRiskCount, lowRiskCount } = data.summary;

  let overallRiskLevelLabel: 'Low' | 'Medium' | 'High' = 'Low';
  if (highRiskCount > 0) {
    overallRiskLevelLabel = 'High';
  } else if (mediumRiskCount > 0 || vulnerableFindings > 0) {
    overallRiskLevelLabel = 'Medium';
  }

  let overallRiskText =
    'Based on the current findings, no high- or medium-risk issues were discovered and the overall risk is considered low.';
  if (overallRiskLevelLabel === 'High') {
    overallRiskText =
      'This attack task discovered high-risk security issues that should be remediated as a top priority to prevent sensitive data leakage or over-privileged actions.';
  } else if (overallRiskLevelLabel === 'Medium') {
    overallRiskText =
      'This attack task discovered medium-risk security issues (and no high-risk issues). They should be addressed in an upcoming maintenance window to improve robustness under adversarial prompts.';
  }

  const taskName = data.taskName || 'the attack task';
  const targetType = data.targetType || 'agent';
  const attackMode = data.attackMode || 'N/A';

  const overviewParts: string[] = [];
  overviewParts.push(
    `In this attack task, we evaluated the security behavior of the ${targetType} "${taskName}" using the ${attackMode} mode.`,
  );
  if (testTimeRange && testTimeRange !== 'Not recorded') {
    overviewParts.push(`The tests were executed over the following time range: ${testTimeRange}.`);
  }
  overviewParts.push(
    'The evaluation focused on prompt-injection attempts, sensitive information leakage, and over-privileged tool usage under adversarial inputs.',
  );
  const overviewText = overviewParts.join(' ');

  let testSummaryText: string;
  if (totalFindings) {
    testSummaryText = [
      `A total of ${totalFindings} findings were analyzed (${highRiskCount} high risk, ${mediumRiskCount} medium risk, ${lowRiskCount} low risk).`,
      `${vulnerableFindings} findings were classified as vulnerable (finalVerdict.vulnerable = true).`,
      `Overall, the risk level for this task is assessed as ${overallRiskLevelLabel.toLowerCase()}.`,
    ].join(' ');
  } else {
    testSummaryText =
      'No attack results were recorded for this task, so the current conclusions are based only on configuration and task metadata. The overall risk is considered low given the absence of recorded findings.';
  }

  return {
    overallRiskText,
    overviewText,
    testSummaryText,
  };
}

/**
 * Dify 配置审计：HTML/PDF 与 Markdown 共用 `renderDifyConfigAuditReportFromTaskData` 的同一正文，
 * 在 HTML 中以等宽预格式化展示，便于与 .md 导出逐字对照。
 */
/** 将 Markdown 渲染为与任务 PDF 导出一致的 HTML 壳（封面 + 版式 + markdown-it 正文）。供离线脚本等复用。 */
export function wrapMarkdownPlainAsHtmlDocument(
  markdown: string,
  documentTitle: string,
  brandConfig?: Partial<ReportBrandConfig>,
): string {
  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);
  const coverImageUrl =
    process.env.REPORT_COVER_IMAGE_URL?.trim() || resolveImageDataUri('backend/assets/bg.png');
  const backgroundImageUrl = process.env.REPORT_BACKGROUND_IMAGE_URL?.trim() || '';
  const brandName = (process.env.REPORT_BRAND_NAME?.trim() || '智安').slice(0, 60);
  const brandProduct = (process.env.REPORT_BRAND_PRODUCT?.trim() || '智能体安全验证平台').slice(
    0,
    80,
  );
  const brandOrg = resolveReportBrandConfig(brandConfig).organization;
  const brandDocLabel = (
    process.env.REPORT_DOCUMENT_LEVEL?.trim() || '内部文档（请按需分发）'
  ).slice(0, 80);
  const accentColor = process.env.REPORT_ACCENT_COLOR?.trim() || '#b91c1c';
  const logoDataUri = resolveBrandLogoDataUri();
  const docHeaderLogoDataUri = resolveImageDataUri('backend/assets/logo2.svg') || logoDataUri;
  const watermarkText = `${brandName} REPORT`.replace(/[<>&"]/g, '').slice(0, 40);
  let rendered = '';
  try {
    // Keep Markdown as the single source, but render readable HTML for html/pdf.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
    });
    rendered = decorateReportVerdicts(md.render(markdown));
  } catch {
    rendered = `<pre class="md">${escapeHtml(markdown)}</pre>`;
  }
  const builtInWatermarkSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <pattern id="wm" patternUnits="userSpaceOnUse" width="320" height="320" patternTransform="rotate(-20)">
          <text x="0" y="130" font-size="48" font-family="Arial, Helvetica, sans-serif" fill="#1f2937" fill-opacity="0.035">${watermarkText}</text>
        </pattern>
      </defs>
      <rect width="1200" height="1200" fill="url(#wm)"/>
    </svg>`,
  );
  const builtInWatermarkDataUri = `data:image/svg+xml;charset=UTF-8,${builtInWatermarkSvg}`;
  const contentBackgroundImage = backgroundImageUrl || builtInWatermarkDataUri;
  const hasCustomCover = Boolean(coverImageUrl);
  const coverImageHtml = hasCustomCover
    ? `<div class="cover-art" aria-hidden="true"><img class="cover-art-image" src="${escapeHtml(coverImageUrl)}" alt="cover background" /></div>`
    : `<div class="cover-art cover-art-gradient" aria-hidden="true"></div>`;
  const coverClass = hasCustomCover ? 'cover-card has-image' : 'cover-card';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    :root {
      --text-main: #111827;
      --text-subtle: #6b7280;
      --border-color: #e5e7eb;
      --paper-bg: #ffffff;
      --shell-bg: #f3f4f6;
      --accent: ${escapeHtml(accentColor)};
      --accent-soft: rgba(185, 28, 28, 0.08);
      --section-bg: #f9fafb;
      --table-head: #f3f4f6;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif;
      margin: 0;
      background: var(--shell-bg);
      color: var(--text-main);
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-shell { width: 100%; padding: 18px 0 30px; }
    .cover-card {
      max-width: 920px;
      /* A4(297mm) with PDF margins top/bottom 16mm => 265mm printable height */
      height: 265mm;
      min-height: 265mm;
      max-height: 265mm;
      margin: 0 auto 24px;
      padding: 52px 0 42px;
      background: var(--paper-bg);
      border: 1px solid var(--border-color);
      box-shadow: 0 8px 28px rgba(17, 24, 39, 0.10);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      page-break-after: always;
    }
    .cover-card::before{
      content: "";
      position: absolute;
      inset: 0;
      /* 轻装饰：避免灰蒙层过重，打印/PDF 封面更偏白 */
      background:
        radial-gradient(circle at 84% 18%, rgba(185, 28, 28, 0.05), transparent 48%),
        radial-gradient(circle at 18% 82%, rgba(17, 24, 39, 0.02), transparent 52%);
      z-index: 0;
      pointer-events: none;
    }
    .cover-card.has-image::after{
      content: "";
      position: absolute;
      inset: 0;
      /* 提高白色叠层不透明度，压暗底图但保持整体更亮 */
      background:
        linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.72) 42%, rgba(255,255,255,0.96) 100%),
        linear-gradient(125deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.14) 40%, rgba(185, 28, 28, 0.025) 100%);
      z-index: 0;
      pointer-events: none;
    }
    .cover-card > *:not(.cover-art) { position: relative; z-index: 1; }
    .cover-topbar{
      padding: 0 56px;
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 16px;
    }
    .cover-brand {
      display:flex;
      align-items:center;
      gap: 12px;
      min-width: 0;
    }
    .cover-logo {
      width: auto;
      height: 64px;
      max-width: 360px;
      border-radius: 6px;
      overflow: hidden;
      display:flex;
      align-items:center;
      justify-content:center;
      flex: 0 0 auto;
      padding: 4px 12px;
    }
    .cover-logo img { width: auto; height: 100%; max-width: 320px; object-fit: contain; display:block; }
    .cover-topbar-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      min-width: 220px;
      padding: 4px 0;
    }
    .cover-topbar-meta-label {
      font-size: 11px;
      letter-spacing: 1px;
      color: #6b7280;
      text-transform: uppercase;
    }
    .cover-topbar-meta-value {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      letter-spacing: 0.2px;
      text-align: right;
    }
    .cover-main {
      padding: 0 56px;
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .cover-title {
      margin: 0;
      font-size: 46px;
      font-weight: 800;
      line-height: 1.22;
      letter-spacing: 1px;
      color: #0b1220;
      max-width: 760px;
    }
    .cover-subtitle {
      margin: 0;
      color: #1f2937;
      font-size: 16px;
      letter-spacing: 0.4px;
      max-width: 760px;
    }
    .cover-separator {
      width: 112px;
      height: 2px;
      background: linear-gradient(90deg, var(--accent), rgba(185, 28, 28, 0.18));
    }
    .cover-org {
      margin: 0;
      color: #374151;
      font-size: 14px;
      letter-spacing: 0.2px;
      max-width: 760px;
    }
    .cover-art {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
    }
    .cover-art-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform: scale(1.01);
      /* 略提亮封面图，避免与白色蒙层叠加后整体发灰发黑 */
      filter: saturate(0.85) brightness(1.04) contrast(1.02);
    }
    .cover-art-gradient {
      background:
        linear-gradient(180deg, #ffffff 0%, #fafbfc 55%, #f6f8fa 100%),
        radial-gradient(circle at 70% 30%, rgba(185, 28, 28, 0.09), transparent 58%),
        radial-gradient(circle at 20% 80%, rgba(31, 41, 55, 0.04), transparent 62%),
        repeating-linear-gradient(135deg, rgba(17, 24, 39, 0.025), rgba(17, 24, 39, 0.025) 2px, transparent 2px, transparent 12px);
    }
    .cover-footer {
      padding: 0 56px;
      z-index: 2;
      position: relative;
    }
    .cover-footer-headline {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: #374151;
      margin-bottom: 8px;
    }
    .cover-meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      color: #374151;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid var(--border-color);
    }
    .cover-meta-table th,
    .cover-meta-table td {
      border: 1px solid var(--border-color);
      padding: 10px 14px;
      text-align: left;
      vertical-align: middle;
    }
    .cover-meta-table th {
      width: 200px;
      font-weight: 600;
      background: #f8fafc;
      color: #111827;
    }
    .doc {
      max-width: 920px;
      margin: 0 auto;
      display: table;
      width: 100%;
      background: var(--paper-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0;
      box-shadow: 0 3px 12px rgba(17, 24, 39, 0.06);
      position: relative;
      overflow: hidden;
    }
    .doc::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image: url("${contentBackgroundImage}");
      background-repeat: repeat;
      background-size: 320px 320px;
      opacity: 0.92;
      pointer-events: none;
      z-index: 0;
    }
    .doc-inner {
      display: table-row-group;
      position: relative;
      z-index: 1;
    }
    .doc-inner-content {
      padding: 26px 56px 32px;
    }
    .doc-header{
      display: table-header-group;
    }
    .doc-header-frame{
      display:flex;
      align-items:center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 36px;
      border-bottom: 1px solid var(--border-color);
      background: linear-gradient(90deg, rgba(185, 28, 28, 0.08), rgba(185, 28, 28, 0.02));
    }
    .doc-header-left{
      display:flex;
      align-items:center;
      gap: 10px;
      min-width: 0;
    }
    .doc-header-logo{
      width: 26px;
      height: 26px;
      border-radius: 6px;
      overflow:hidden;
      display:flex;
      align-items:center;
      justify-content:center;
      flex: 0 0 auto;
    }
    .doc-header-logo img{ width:100%; height:100%; object-fit: contain; display:block; }
    .doc-header-title{
      font-weight: 800;
      letter-spacing: 0.6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 560px;
    }
    .doc-header-meta{
      font-size: 12px;
      color: var(--text-subtle);
      letter-spacing: 0.2px;
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .doc-footer { display: table-footer-group; }
    .doc-footer-frame { margin: 0 56px; padding: 8px 0 10px; border-top: 1px solid #e5e7eb; color: #667085; font-size: 11px; text-align: center; }
    .meta { font-size: 12px; color: var(--text-subtle); margin: 10px 0 14px; letter-spacing: 0.15px; }
    h1 { font-size: 22px; margin: 0 0 10px; letter-spacing: 0.4px; }
    .md { font-size: 14px; line-height: 1.82; color: #111827; }
    .md h1, .md h2, .md h3, .md h4 { line-height: 1.35; }
    .md > h1:first-child { display: none; }
    .md h1 { margin: 1.2rem 0 0.68rem; font-size: 18px; font-weight: 800; }
    .md h2 {
      margin: 1.35rem 0 0.72rem;
      font-size: 17px;
      font-weight: 800;
      border-left: 4px solid var(--accent);
      padding: 11px 14px 11px 16px;
      background: var(--section-bg);
      border-bottom: 1px solid var(--border-color);
    }
    .md h3 { margin: 1.1rem 6px 0.52rem; font-size: 15px; font-weight: 800; color: #0f172a; }
    .md h4 { margin: 0.95rem 6px 0.48rem; font-size: 13.5px; font-weight: 700; color: #334155; }
    .md p { margin: 0.58rem 6px 0.72rem; line-height: 1.86; }
    .md ul, .md ol { margin: 0.52rem 6px 0.68rem 1.65rem; }
    .md code { background: #f9fafb; padding: 0.1rem 0.28rem; border-radius: 4px; border: 1px solid #e5e7eb; font-size: 0.85em; }
    .md pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.55; margin: 0.6rem 0; padding: 0.8rem; background: #0b1020; color: #e5e7eb; border-radius: 6px; border: 1px solid rgba(17,24,39,0.35); overflow-x: auto; }
    .md pre code { background: transparent; border: 0; padding: 0; }
    .md table { width: calc(100% - 12px); max-width: calc(100% - 12px); table-layout: fixed; border-collapse: collapse; margin: 0.76rem 6px; font-size: 13px; background: #fff; page-break-inside: auto; break-inside: auto; }
    .md thead { display: table-header-group; }
    .md tr { page-break-inside: auto; break-inside: auto; page-break-after: auto; }
    .md th, .md td {
      border: 1px solid var(--border-color);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .md th { background: var(--table-head); font-weight: 700; }
    .status-pill { display: inline; max-width: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; font-weight: 700; line-height: inherit; text-align: inherit; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .status-pill.success { color: #047857; background: transparent; border: 0; }
    .status-pill.warn { color: #b45309; background: transparent; border: 0; }
    .status-pill.danger { color: #b91c1c; background: transparent; border: 0; }
    .md blockquote { margin: 0.76rem 6px; padding: 0.55rem 0.8rem; border-left: 3px solid var(--accent); background: rgba(185, 28, 28, 0.06); color: #374151; }
    .md hr { border: 0; height: 1px; margin: 18px 0; background: transparent; break-after: page; page-break-after: always; }
    .doc-note { margin-top: 18px; font-size: 11px; color: #6b7280; text-align: center; }
    footer { margin-top: 10px; font-size: 11px; color: #6b7280; text-align: center; padding-bottom: 10px; }
    .muted-divider { height: 1px; background: var(--border-color); margin: 12px 0; }
    @media print {
      body { background: #fff; }
      .page-shell { padding: 0; }
      .cover-card, .doc { box-shadow: none; border-color: #d7dee8; }
      .doc { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page-shell">
    <section class="${coverClass}">
      <div class="cover-topbar">
        <div class="cover-brand">
          <div class="cover-logo">${logoDataUri ? `<img src="${escapeHtml(logoDataUri)}" alt="logo" />` : ''}</div>
        </div>
        <div class="cover-topbar-meta">
          <div class="cover-topbar-meta-label">Document Level</div>
          <div class="cover-topbar-meta-value">${escapeHtml(brandDocLabel)} · ${escapeHtml(generatedDate)}</div>
        </div>
      </div>
      <div class="cover-main">
        <h1 class="cover-title">${escapeHtml(documentTitle)}</h1>
        <div class="cover-separator"></div>
        <p class="cover-subtitle">面向企业应用场景的专业化安全评估与验证报告</p>
        <p class="cover-org">${escapeHtml(brandOrg)}</p>
      </div>
      ${coverImageHtml}
      <div class="cover-footer">
        <div class="cover-footer-headline">REPORT INFORMATION</div>
        <table class="cover-meta-table">
          <tbody>
            <tr><th>报告生成日期</th><td>${escapeHtml(generatedDate)}</td></tr>
            <tr><th>报告生成时间</th><td>${escapeHtml(generatedAt)}</td></tr>
            <tr><th>出具机构</th><td>${escapeHtml(brandOrg)}</td></tr>
            <tr><th>报告平台</th><td>${escapeHtml(brandName)} · ${escapeHtml(brandProduct)}</td></tr>
            <tr><th>文档级别</th><td>${escapeHtml(brandDocLabel)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="doc">
      <div class="doc-header">
        <div class="doc-header-frame">
          <div class="doc-header-left">
            <div class="doc-header-logo">${docHeaderLogoDataUri ? `<img src="${escapeHtml(docHeaderLogoDataUri)}" alt="logo" />` : ''}</div>
            <div class="doc-header-title">${escapeHtml(brandName)} 安全评估报告</div>
          </div>
          <div class="doc-header-meta">${escapeHtml(generatedDate)} · ${escapeHtml(brandOrg)}</div>
        </div>
      </div>
      <div class="doc-inner">
        <div class="doc-inner-content">
        <div class="md">${rendered}</div>
        <div class="doc-note">注：可通过环境变量 REPORT_BRAND_* / REPORT_ACCENT_COLOR / REPORT_COVER_IMAGE_URL / REPORT_BACKGROUND_IMAGE_URL 定制品牌与样式。</div>
        </div>
      </div>
      <div class="doc-footer"><div class="doc-footer-frame">${escapeHtml(brandOrg)} · ${escapeHtml(brandName)} · ${escapeHtml(brandProduct)}</div></div>
    </div>
  </div>
</body>
</html>`;
}

function resolveBrandLogoDataUri(): string {
  const fromEnv = process.env.REPORT_BRAND_LOGO_DATA_URI?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const logoPath = process.env.REPORT_BRAND_LOGO_PATH?.trim() || 'backend/assets/logo.svg';
  return resolveImageDataUri(logoPath);
}

function resolveImageDataUri(filePath: string): string {
  if (!filePath) {
    return '';
  }
  const baseName = path.basename(filePath);
  const candidates: string[] = [];
  if (path.isAbsolute(filePath)) {
    candidates.push(filePath);
  } else {
    candidates.push(path.resolve(process.cwd(), filePath));
    candidates.push(path.resolve(process.cwd(), 'backend/assets', baseName));
    // Compiled bundle lives under dist/src/services → /app/backend/assets
    candidates.push(path.resolve(__dirname, '..', '..', '..', 'backend', 'assets', baseName));
  }
  for (const abs of candidates) {
    try {
      if (!fs.existsSync(abs)) {
        continue;
      }
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === '.svg'
          ? 'image/svg+xml'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      /* try next candidate */
    }
  }
  return '';
}

async function generateHtmlReport(data: ReportData): Promise<string> {
  try {
    const brandConfig = await loadReportBrandConfig();
    const kind = resolveTaskReportKind(data);
    // 为了保证 Markdown / HTML / PDF 三种格式内容完全一致，
    // 统一先按与 Markdown 相同模板生成，再渲染为 HTML。
    const md =
      kind === 'dify_config_audit' ||
      kind === 'dify_config_static' ||
      kind === 'coze_config_audit' ||
      kind === 'coze_config_static' ||
      kind === 'fastgpt_config_audit' ||
      kind === 'fastgpt_config_static'
        ? renderDifyConfigAuditReportFromTaskData(data)
        : renderAgentSecurityAssessmentReport(data);
    const title =
      kind === 'dify_config_audit' ||
      kind === 'dify_config_static' ||
      kind === 'coze_config_audit' ||
      kind === 'coze_config_static' ||
      kind === 'fastgpt_config_audit' ||
      kind === 'fastgpt_config_static'
        ? getDifyConfigTaskReportTitle(data)
        : getApiBlackboxReportTitle(data);
    return wrapMarkdownPlainAsHtmlDocument(md, title, brandConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to render markdown-based HTML report, fallback to legacy HTML: ${message}`,
    );
    return generateGenericAttackTaskHtmlReport(data);
  }
}

function formatExecutionMinutesEnCell(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '—';
  }
  return `${String(Math.round((ms / 60_000) * 100) / 100)} min`;
}

function generateGenericAttackTaskHtmlReport(data: ReportData): string {
  const generatedAt = new Date().toISOString();
  const taskName = data.taskName || 'Attack Task';
  const taskDescription = data.taskDescription || '';
  const targetType = data.targetType || 'N/A';
  const attackMode = data.attackMode || 'N/A';
  const createdAt = data.createdAt || 'N/A';
  const testTimeRange =
    data.summary.testStart && data.summary.testEnd
      ? `${data.summary.testStart} ~ ${data.summary.testEnd}`
      : 'Not recorded';

  const findingsRowLabel =
    data.resultsSource === 'finding_records'
      ? 'Total findings (finding_records)'
      : 'Total Findings (rows in attack_results)';

  const totalFindings =
    typeof data.summary.totalFindings === 'number'
      ? data.summary.totalFindings
      : data.results.length;
  const vulnerableFindings =
    typeof data.summary.vulnerableFindings === 'number'
      ? data.summary.vulnerableFindings
      : data.results.filter((r) => {
          const v = r.finalVerdict?.vulnerable;
          return v === true || String(v).toLowerCase() === 'true';
        }).length;

  const { highRiskCount, mediumRiskCount, lowRiskCount } = data.summary;

  const { overallRiskText, overviewText, testSummaryText } = buildAttackTaskTextSummary(
    data,
    testTimeRange,
    totalFindings,
    vulnerableFindings,
  );

  const findingsSections = data.results
    .map((result, index) => {
      const verdict = result.finalVerdict || {};
      const isVulnerable =
        verdict.vulnerable === true || String(verdict.vulnerable).toLowerCase() === 'true';
      const riskLevel = verdict.riskLevel || 'Unknown';
      const confidence = verdict.confidence ?? 0;
      const reason = verdict.reason || '';

      const requestJson = JSON.stringify(result.request ?? {}, null, 2);
      const responseJson = JSON.stringify(result.response ?? {}, null, 2);

      return `
      <section class="finding">
        <h3>3.${index + 1} Finding ${index + 1}</h3>
        <div class="finding-meta">
          <div><span class="label">Vulnerability ID:</span> <code>${escapeHtml(
            result.vulnerabilityId || '',
          )}</code></div>
          <div><span class="label">Attack Mode:</span> ${escapeHtml(result.attackMode)}</div>
          <div><span class="label">Risk Level:</span> ${escapeHtml(riskLevel)}</div>
          <div><span class="label">Confidence:</span> ${confidence}</div>
          <div><span class="label">Final Verdict:</span> ${
            isVulnerable
              ? '<span class="badge badge-danger">VULNERABLE</span>'
              : '<span class="badge badge-safe">SAFE</span>'
          }</div>
        </div>
        ${
          reason
            ? `<p class="finding-reason"><span class="label">Reason:</span> ${escapeHtml(
                reason,
              )}</p>`
            : ''
        }
        <details class="finding-details">
          <summary>View Request / Response JSON</summary>
          <div class="finding-json">
            <h4>Request</h4>
            <pre><code>${escapeHtml(requestJson)}</code></pre>
            <h4>Response</h4>
            <pre><code>${escapeHtml(responseJson)}</code></pre>
          </div>
        </details>
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${REPORT_PRODUCT_BRAND_ZH} Attack Task Security Report</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      margin: 24px;
      padding: 0;
      background-color: #f5f5f5;
      color: #111827;
      line-height: 1.5;
    }
    h1, h2, h3, h4 {
      color: #111827;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: 1.75rem;
    }
    h2 {
      font-size: 1.25rem;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.25rem;
    }
    h3 {
      font-size: 1.1rem;
    }
    p {
      margin: 0.25rem 0;
    }
    .muted {
      color: #6b7280;
      font-size: 0.9rem;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
      margin-bottom: 1rem;
    }
    .card {
      background-color: #ffffff;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
      padding: 0.75rem 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .label {
      font-weight: 600;
      color: #374151;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-danger {
      background-color: #fee2e2;
      color: #b91c1c;
    }
    .badge-safe {
      background-color: #dcfce7;
      color: #166534;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
      margin-top: 0.5rem;
      margin-bottom: 0.75rem;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.35rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
    }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
      font-size: 0.8rem;
    }
    pre {
      background-color: #111827;
      color: #e5e7eb;
      padding: 0.75rem;
      border-radius: 0.375rem;
      overflow-x: auto;
      max-height: 320px;
    }
    .finding {
      background-color: #ffffff;
      border-radius: 0.75rem;
      border: 1px solid #e5e7eb;
      padding: 1rem;
      margin-top: 1rem;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }
    .finding-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.25rem 1rem;
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
    }
    .finding-reason {
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }
    .finding-details summary {
      cursor: pointer;
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #2563eb;
    }
    .finding-json h4 {
      margin-top: 0.75rem;
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
      font-weight: 600;
    }
    footer {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: #6b7280;
      text-align: center;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #020617;
        color: #e5e7eb;
      }
      .card,
      .finding {
        background-color: #020617;
        border-color: #1f2937;
      }
      th, td {
        border-color: #1f2937;
      }
      th {
        background-color: #020617;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Attack Task Security Report</h1>
    <p class="muted">Generated at ${generatedAt}</p>
  </header>

  <section>
    <h2>1. Overview</h2>
    <div class="summary-grid">
      <div class="card">
        <div class="card-title">Task Information</div>
        <p><span class="label">Task Name:</span> ${escapeHtml(taskName)}</p>
        <p><span class="label">Task ID:</span> <code>${escapeHtml(data.taskId)}</code></p>
        <p><span class="label">Organization:</span> <code>${escapeHtml(
          data.organizationId,
        )}</code></p>
        <p><span class="label">Created At:</span> ${escapeHtml(createdAt)}</p>
        ${
          taskDescription
            ? `<p><span class="label">Description:</span> ${escapeHtml(taskDescription)}</p>`
            : ''
        }
      </div>
      <div class="card">
        <div class="card-title">Target &amp; Mode</div>
        <p><span class="label">Target Type:</span> ${escapeHtml(targetType)}</p>
        <p><span class="label">Attack Mode:</span> ${escapeHtml(attackMode)}</p>
        <p><span class="label">Test Time Range:</span> ${escapeHtml(testTimeRange)}</p>
      </div>
      <div class="card">
        <div class="card-title">Summary</div>
        <p>${escapeHtml(overallRiskText)}</p>
      </div>
    </div>
    ${overviewText ? `<p>${escapeHtml(overviewText)}</p>` : ''}
  </section>
  ${
    data.vulnerabilities?.length
      ? `<section>
    <h2>1.1 Selected vulnerabilities (library)</h2>
    <ul>
      ${data.vulnerabilities
        .map(
          (v) =>
            `<li><strong>${escapeHtml(v.name)}</strong> (<code>${escapeHtml(v.id)}</code>) · risk: ${escapeHtml(
              v.riskLevel || '—',
            )}${
              typeof v.detectionRulesCount === 'number'
                ? ` · detection rules: ${v.detectionRulesCount}`
                : ''
            }</li>`,
        )
        .join('')}
    </ul>
  </section>`
      : ''
  }

  <section>
    <h2>2. Test Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(findingsRowLabel)}</td>
          <td>${totalFindings}</td>
        </tr>
        <tr>
          <td>Vulnerable Findings (finalVerdict.vulnerable = true)</td>
          <td>${vulnerableFindings}</td>
        </tr>
        <tr>
          <td>High Risk Findings</td>
          <td>${highRiskCount}</td>
        </tr>
        <tr>
          <td>Medium Risk Findings</td>
          <td>${mediumRiskCount}</td>
        </tr>
        <tr>
          <td>Low Risk Findings</td>
          <td>${lowRiskCount}</td>
        </tr>
        <tr>
          <td>Execution Time</td>
          <td>${formatExecutionMinutesEnCell(data.summary.executionTime)}</td>
        </tr>
        <tr>
          <td>Completed At</td>
          <td>${escapeHtml(data.summary.completedAt)}</td>
        </tr>
      </tbody>
    </table>
    ${testSummaryText ? `<p>${escapeHtml(testSummaryText)}</p>` : ''}
  </section>

  <section>
    <h2>3. Detailed Findings</h2>
    ${
      data.results.length === 0
        ? `<p class="muted">No ${
            data.resultsSource === 'finding_records' ? 'finding_records' : 'attack'
          } results were recorded for this task. Run the task to generate findings.</p>`
        : findingsSections
    }
  </section>

  <section>
    <h2>4. Conclusions &amp; Recommendations</h2>
    <p>如果检测到了高风险或中风险问题，建议优先修复这些问题，并在修复后重新运行 Attack Task 进行复测。</p>
    <ul>
      <li>优先修复可能导致敏感信息泄露、凭证泄露或越权操作的高风险问题。</li>
      <li>在维护窗口内处理中风险问题，以提升系统在复杂对话场景下的稳健性。</li>
      <li>将低风险问题纳入后续版本的持续安全加固计划。</li>
    </ul>
  </section>

  <footer>
    <p>Report generated by ${REPORT_PRODUCT_BRAND_ZH}安全平台</p>
  </footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
