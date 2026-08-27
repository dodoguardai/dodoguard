/**
 * CLI：从 Excel 生成 Q&A 对抗测评 PDF（逻辑见 `backend/src/reports/qnaExcelReportFromRows.ts`）。
 *
 *   node ./node_modules/tsx/dist/cli.mjs scripts/generate-xingye-qna-report-from-xlsx.ts --input docs/foo.xlsx --output docs/out.pdf
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildQnaExcelReportHtmlDocument,
  buildQnaExcelReportMarkdown,
  readQnaExcelRowsFromXlsxPath,
  renderQnaReportHtmlToPdfBuffer,
} from '../backend/src/reports/qnaExcelReportFromRows';

function parseArgs(argv: string[]): {
  input: string;
  outputPdf: string;
  outputHtml: string;
  skipPdf: boolean;
} {
  let input = path.resolve(process.cwd(), 'docs/兴业证券智能体-对话测试用例_2.xlsx');
  let outputPdf = path.resolve(process.cwd(), 'docs/兴业证券智能体-API对话测评报告_完整版.pdf');
  let skipPdf = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) {
      input = path.resolve(process.cwd(), argv[++i]);
    } else if (argv[i] === '--output' && argv[i + 1]) {
      const out = path.resolve(process.cwd(), argv[++i]);
      if (/\.html?$/i.test(out)) {
        outputPdf = out.replace(/\.html?$/i, '.pdf');
      } else {
        outputPdf = /\.pdf$/i.test(out) ? out : `${out}.pdf`;
      }
    } else if (argv[i] === '--no-pdf' || argv[i] === '--html-only') {
      skipPdf = true;
    }
  }
  const outputHtml = outputPdf.replace(/\.pdf$/i, '.html');
  return { input, outputPdf, outputHtml, skipPdf };
}

async function main() {
  const { input, outputPdf, outputHtml, skipPdf } = parseArgs(process.argv);
  if (!fs.existsSync(input)) {
    throw new Error(`Input not found: ${input}`);
  }
  const rows = readQnaExcelRowsFromXlsxPath(input);
  const xingyeCopy = {
    reportTitle: '兴业证券 App 智能体 API 对话安全与合规测评报告',
    targetDisplayName: '兴业证券 App 智能体（API 对话）',
    scenarioBlurb:
      '面向证券类 App 对话智能体的合规、投教边界、注入与越权话术、敏感信息与环境探测等问答场景。',
    executionNote: '由离线脚本汇总生成 PDF；第 7 章逐条展开结构化评测字段。',
    summarySubjectName: '兴业证券 App 智能体',
  };
  const md = buildQnaExcelReportMarkdown(rows, xingyeCopy);
  const html = buildQnaExcelReportHtmlDocument(md, xingyeCopy.reportTitle);
  fs.mkdirSync(path.dirname(outputHtml), { recursive: true });
  fs.writeFileSync(outputHtml, html, 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`Wrote HTML: ${outputHtml}`);

  if (skipPdf) {
    return;
  }
  try {
    const pdf = await renderQnaReportHtmlToPdfBuffer(html);
    fs.writeFileSync(outputPdf, pdf);
    // eslint-disable-next-line no-console
    console.log(`Wrote PDF: ${outputPdf} (${(pdf.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      'PDF 未生成（Playwright Chromium 不可用）。请安装浏览器后重试，或用浏览器打开上述 HTML → 打印为 PDF：',
      (e as Error).message,
    );
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
