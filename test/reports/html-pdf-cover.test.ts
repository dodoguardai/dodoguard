import { PDFDocument } from 'pdf-lib';
import { renderQnaReportHtmlToPdfBuffer } from '../../backend/src/reports/qnaExcelReportFromRows';
import { ReportService } from '../../backend/src/services/reportService';

type PdfRenderingReportService = {
  renderHtmlToPdfBuffer(html: string): Promise<Buffer>;
  withPdfTimeout<T>(operation: Promise<T>, stage: string, onTimeout?: () => void): Promise<T>;
};

describe('HTML report PDF cover rendering', () => {
  it('keeps the cover when the cover and report body are rendered separately', async () => {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; }
    .cover-card { width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; page-break-after: always; }
    .cover-card h1 { margin: 0; padding: 20mm; }
    .doc { width: 210mm; }
    .doc-inner { padding: 20mm; }
  </style>
</head>
<body>
  <section class="cover-card"><h1>PDF COVER SENTINEL</h1></section>
  <main class="doc">
    <div class="doc-header">
      <div class="doc-header-frame">
        <div class="doc-header-left"><div class="doc-header-title">HEADER</div></div>
        <div class="doc-header-meta">META</div>
      </div>
    </div>
    <div class="doc-inner"><h2>PDF BODY SENTINEL</h2></div>
    <div class="doc-footer"><div class="doc-footer-frame">FOOTER</div></div>
  </main>
</body>
</html>`;

    const pdf = await renderQnaReportHtmlToPdfBuffer(html);
    const document = await PDFDocument.load(pdf);

    expect(document.getPageCount()).toBe(2);
  }, 60_000);

  it('renders a compliance-style div report without stalling or dropping its cover', async () => {
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; }
    .cover-card { width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; page-break-after: always; }
    .cover-card h1 { margin: 0; padding: 20mm; }
    .doc { width: 210mm; }
    .doc-inner { padding: 20mm; }
  </style>
</head>
<body>
  <section class="cover-card"><h1>COMPLIANCE COVER SENTINEL</h1></section>
  <div class="doc">
    <div class="doc-header">
      <div class="doc-header-frame">
        <div class="doc-header-left"><div class="doc-header-title">HEADER</div></div>
        <div class="doc-header-meta">META</div>
      </div>
    </div>
    <div class="doc-inner"><h2>COMPLIANCE BODY SENTINEL</h2></div>
    <div class="doc-footer"><div class="doc-footer-frame">FOOTER</div></div>
  </div>
</body>
</html>`;
    const service = new ReportService() as unknown as PdfRenderingReportService;

    const pdf = await service.renderHtmlToPdfBuffer(html);
    const document = await PDFDocument.load(pdf);

    expect(document.getPageCount()).toBe(2);
  }, 60_000);

  it('actively aborts a stalled compliance PDF render at the configured deadline', async () => {
    jest.useFakeTimers();
    const previousTimeout = process.env.PLAYWRIGHT_PDF_TOTAL_TIMEOUT_MS;
    process.env.PLAYWRIGHT_PDF_TOTAL_TIMEOUT_MS = '10000';
    try {
      const service = new ReportService() as unknown as PdfRenderingReportService;
      const abort = jest.fn();
      const pending = service.withPdfTimeout(new Promise<never>(() => undefined), 'render', abort);
      const rejected = expect(pending).rejects.toThrow(
        'PDF generation timed out at render after 10000ms',
      );

      await jest.advanceTimersByTimeAsync(10_000);

      await rejected;
      expect(abort).toHaveBeenCalledTimes(1);
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.PLAYWRIGHT_PDF_TOTAL_TIMEOUT_MS;
      } else {
        process.env.PLAYWRIGHT_PDF_TOTAL_TIMEOUT_MS = previousTimeout;
      }
      jest.useRealTimers();
    }
  });
});
