/**
 * Reports API Routes
 */

import fs from 'fs';

import express from 'express';
import multer from 'multer';
import logger from '../../../../logger';
import {
  buildQnaExcelReportMarkdown,
  buildQnaExcelReportPdfHtmlDocument,
  type QnaReportCopyOptions,
  readQnaExcelRowsFromXlsxBuffer,
  renderQnaReportHtmlToPdfBuffer,
  resolveReportAssetDataUri,
} from '../../../../reports/qnaExcelReportFromRows';
import { loadReportBrandConfig } from '../../../../reports/reportBrandConfig';
import { reportService } from '../../../../services/reportService';

const router = express.Router();

const qnaExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function sanitizeDownloadBaseName(raw: string): string {
  const base = String(raw ?? '')
    .replace(/\.xlsx$/i, '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'qna-excel-report';
}

function contentDispositionAttachment(fileName: string): string {
  const fallback = String(fileName || 'report')
    .replace(/[^\x20-\x7e]+/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const encoded = encodeURIComponent(fileName || 'report').replace(
    /['()]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback || 'report'}"; filename*=UTF-8''${encoded}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeUploadFileName(raw: string): string {
  const input = String(raw || '');
  if (!input) {
    return input;
  }
  const decoded = Buffer.from(input, 'latin1').toString('utf8');
  const mojibakePattern = /[ÃÂÅæçäèéêëìíîïðñòóôõöøùúûüýÿ]/;
  return mojibakePattern.test(input) && decoded.includes('�') === false ? decoded : input;
}

/**
 * GET /api/v1/reports/assets/:asset
 * Return report image assets as data URIs so HTML snapshots can be self-contained for PDF rendering.
 */
router.get('/assets/:asset', async (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_ORG_ID',
        message: 'Organization ID is required',
      },
    });
  }

  const asset = String(req.params.asset || '');
  const assetPath =
    asset === 'cover-image'
      ? 'backend/assets/bg.png'
      : asset === 'logo'
        ? 'backend/assets/logo.svg'
        : '';
  if (!assetPath) {
    return res.status(404).json({
      success: false,
      error: { code: 'REPORT_ASSET_NOT_FOUND', message: 'Report asset not found' },
    });
  }

  const dataUri = resolveReportAssetDataUri(assetPath);
  if (!dataUri) {
    return res.status(404).json({
      success: false,
      error: { code: 'REPORT_ASSET_NOT_FOUND', message: 'Report asset not found' },
    });
  }

  res.json({ success: true, data: { dataUri } });
});

/**
 * POST /api/v1/reports/qna-excel/pdf
 * 上传 Excel（首工作表：类型 / 问题内容 / 实际回答），生成与平台任务同版式的对抗测评 PDF。
 * multipart: file（必填）；可选字段 reportTitle、targetDisplayName、scenarioBlurb、executionNote、summarySubjectName
 */
router.post('/qna-excel/pdf', qnaExcelUpload.single('file'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const file = req.file;
    if (!file?.buffer || !file.originalname) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'Excel file is required (field name: file)',
        },
      });
    }
    if (!/\.xlsx$/i.test(file.originalname)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only .xlsx files are supported',
        },
      });
    }

    const body = req.body as Record<string, string | undefined>;
    const slice = (s: unknown, max: number) =>
      typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : undefined;

    const copy: Partial<QnaReportCopyOptions> = {
      reportTitle: slice(body.reportTitle, 200),
      targetDisplayName: slice(body.targetDisplayName, 200),
      scenarioBlurb: slice(body.scenarioBlurb, 500),
      executionNote: slice(body.executionNote, 500),
      summarySubjectName: slice(body.summarySubjectName, 200),
    };

    const originalFileName = decodeUploadFileName(file.originalname);
    const rows = readQnaExcelRowsFromXlsxBuffer(file.buffer);
    const md = buildQnaExcelReportMarkdown(rows, copy);
    const title =
      copy.reportTitle ||
      (copy.targetDisplayName
        ? `${copy.targetDisplayName} API 对话安全与合规测评报告`
        : '智能体 API 对话安全与合规测评报告');
    const brandConfig = await loadReportBrandConfig();
    const pdfHtml = buildQnaExcelReportPdfHtmlDocument(md, title, brandConfig);
    const reportId = await reportService.createManualQnaExcelReport(organizationId, {
      title,
      markdown: md,
      sourceFileName: originalFileName,
      targetDisplayName: copy.targetDisplayName,
      rowCount: rows.length,
    });
    const pdf = await renderQnaReportHtmlToPdfBuffer(pdfHtml);

    const base = sanitizeDownloadBaseName(originalFileName);
    const fileName = `${base}-对话测评报告.pdf`;
    const asciiFileName = fileName.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180) || 'report.pdf';

    logger.info('[Reports] Q&A Excel PDF generated', {
      organizationId,
      reportId,
      originalFileName: originalFileName.slice(0, 120),
      downloadFileName: fileName,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFileName}"`);
    res.setHeader('X-Report-Id', reportId);
    res.send(pdf);
  } catch (error) {
    logger.error('Q&A Excel PDF generation failed', {
      error: (error as Error).message,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'QNA_EXCEL_PDF_FAILED',
        message: (error as Error).message || 'Failed to generate PDF from Excel',
      },
    });
  }
});

/**
 * POST /api/v1/reports/html/pdf
 * Render a trusted in-app HTML report snapshot to a downloadable PDF.
 */
router.post('/html/pdf', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 160)
        : 'report';
    if (!html.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_HTML', message: 'html is required' },
      });
    }
    if (html.length > 10_000_000) {
      return res.status(400).json({
        success: false,
        error: { code: 'HTML_TOO_LARGE', message: 'html must be smaller than 10MB' },
      });
    }

    const pdf = await renderQnaReportHtmlToPdfBuffer(html);
    const fileName = `${sanitizeDownloadBaseName(title)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionAttachment(fileName));
    res.send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`HTML PDF generation failed: ${message}`);
    const timedOut = /PDF generation timed out/i.test(message);
    res.status(timedOut ? 504 : 500).json({
      success: false,
      error: {
        code: timedOut ? 'PDF_GENERATION_TIMEOUT' : 'HTML_PDF_FAILED',
        message: timedOut ? 'PDF 生成超时，请稍后重试或联系管理员查看服务日志' : message,
      },
    });
  }
});

/**
 * POST /api/v1/reports/html/docx
 * Render a trusted in-app HTML report snapshot to a downloadable Word document.
 */
router.post('/html/docx', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 160)
        : 'report';
    if (!html.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_HTML', message: 'html is required' },
      });
    }
    if (html.length > 10_000_000) {
      return res.status(400).json({
        success: false,
        error: { code: 'HTML_TOO_LARGE', message: 'html must be smaller than 10MB' },
      });
    }

    const docx = await reportService.renderHtmlSnapshotToDocxBuffer(html);
    const fileName = `${sanitizeDownloadBaseName(title)}.docx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', contentDispositionAttachment(fileName));
    res.send(docx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`HTML DOCX generation failed: ${message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'HTML_DOCX_FAILED',
        message: message || 'Failed to generate DOCX from HTML',
      },
    });
  }
});

/**
 * GET /api/v1/reports
 * Get reports for organization
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const { limit = 50, offset = 0, taskId, format, reportType } = req.query;
    const reportTypeFilter = Array.isArray(reportType)
      ? reportType.map(String)
      : typeof reportType === 'string'
        ? reportType
        : undefined;
    const result = await reportService.getReports(organizationId, {
      limit: Number(limit),
      offset: Number(offset),
      taskId: taskId as string,
      format: format as string,
      reportType: reportTypeFilter,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Get reports error: ${errorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get reports',
      },
    });
  }
});

/**
 * GET /api/v1/reports/templates
 * Get available report templates
 */
router.get('/templates', async (_req, res) => {
  try {
    const templates = await reportService.getReportTemplates();

    res.json({
      success: true,
      data: templates.map(
        (t: { id: string; name: string; description?: string | null; enabled: boolean }) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          enabled: t.enabled,
        }),
      ),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Get report templates error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get report templates',
      },
    });
  }
});

/**
 * GET /api/v1/reports/:id
 * Get report by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const report = await reportService.getReport(id, organizationId);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
        },
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error(`Get report error for ${req.params.id}: ${errorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get report',
      },
    });
  }
});

/**
 * POST /api/v1/reports/generate
 * Generate new report
 */
router.post('/generate', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const { taskId, format = 'pdf', templateId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TASK_ID',
          message: 'Task ID is required',
        },
      });
    }

    const reportId = await reportService.generateReport(
      taskId,
      organizationId,
      format as 'pdf' | 'html' | 'md' | 'docx',
      templateId,
    );

    const report = await reportService.getReport(reportId, organizationId);

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error(`Generate report error: ${errorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate report',
      },
    });
  }
});

/**
 * POST /api/v1/reports/poc-suite-bundle/pdf
 * Zip of PDFs from prefilled PoC HTML (one Playwright render per document).
 */
router.post('/poc-suite-bundle/pdf', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
    const documents = req.body?.documents;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TASK_ID', message: 'taskId is required' },
      });
    }
    if (!Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENTS',
          message: 'documents must be an array',
        },
      });
    }

    const normalized: Array<{ baseName: string; html: string }> = [];
    for (const row of documents) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const r = row as { baseName?: unknown; html?: unknown };
      const baseName = typeof r.baseName === 'string' ? r.baseName : '';
      const html = typeof r.html === 'string' ? r.html : '';
      if (baseName && html) {
        normalized.push({ baseName, html });
      }
    }

    if (normalized.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENTS',
          message: 'At least one { baseName, html } entry is required',
        },
      });
    }

    const zipBuffer = await reportService.buildPocSuitePdfZipBuffer(
      taskId,
      organizationId,
      normalized,
    );

    const safeTask = taskId.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 64);
    const fileName = `PoC-suite-${safeTask}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(zipBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`PoC suite PDF zip error: ${message}${stack ? `\n${stack}` : ''}`);
    if (message.startsWith('PDF_RENDERER_UNAVAILABLE:')) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'PDF_RENDERER_UNAVAILABLE',
          message: message.replace(/^PDF_RENDERER_UNAVAILABLE:\s*/, ''),
        },
      });
    }
    if (message === 'Task not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
      });
    }
    if (message.startsWith('Invalid')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message },
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to build PoC suite PDF zip',
      },
    });
  }
});

/**
 * GET /api/v1/reports/:id/download
 * Download report file
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    const requestedFormat =
      typeof req.query.format === 'string' && req.query.format.trim()
        ? String(req.query.format).trim().toLowerCase()
        : undefined;
    const download = await reportService.downloadReport(id, organizationId, requestedFormat);

    res.setHeader('Content-Type', download.contentType);
    res.setHeader('Content-Disposition', contentDispositionAttachment(download.fileName));

    const fileStream = fs.createReadStream(download.filePath);
    fileStream.pipe(res);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Download report error for ${req.params.id}: ${err.message}`);
    if (err.message === 'Report not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
        },
      });
    }
    const timedOut = /PDF generation timed out/i.test(err.message);
    res.status(timedOut ? 504 : 500).json({
      success: false,
      error: {
        code: timedOut ? 'PDF_GENERATION_TIMEOUT' : 'INTERNAL_SERVER_ERROR',
        message: timedOut
          ? 'PDF 生成超时，请稍后重试或联系管理员查看服务日志'
          : 'Failed to download report',
      },
    });
  }
});

/**
 * DELETE /api/v1/reports/:id
 * Delete report
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ORG_ID',
          message: 'Organization ID is required',
        },
      });
    }

    await reportService.deleteReport(id, organizationId);

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Delete report error for ${req.params.id}: ${err.message}`);
    if (err.message === 'Report not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
        },
      });
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete report',
      },
    });
  }
});

export default router;
