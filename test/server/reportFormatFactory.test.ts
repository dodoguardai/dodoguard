import { describe, expect, it, jest } from '@jest/globals';
import {
  getReportFormatStrategy,
  wrapMarkdownPlainAsHtmlDocument,
} from '../../backend/src/services/reportFormatFactory';
import type { ReportData } from '../../backend/src/services/reportService';

jest.mock(
  '../../backend/src/dify-pentest/reports/templates/DifyAgentPentestReportTemplateV3',
  () => {
    return {
      DifyAgentPentestReportTemplateV3: class {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async renderReport(_ctx: any): Promise<string> {
          return '# Mock Markdown Report';
        }
      },
    };
  },
);

const baseReportData: ReportData = {
  taskId: 'task-1',
  organizationId: 'org-1',
  taskName: 'Test Task',
  taskDescription: 'desc',
  targetType: 'agent',
  attackMode: 'direct',
  createdAt: new Date().toISOString(),
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

describe('reportFormatFactory', () => {
  it('returns a strategy for each supported format', async () => {
    for (const format of ['md', 'html', 'pdf'] as const) {
      const strategy = getReportFormatStrategy(format);
      expect(strategy).toBeDefined();

      const { content } = await strategy.generateContent(baseReportData, {
        format,
        template: null,
      });
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);

      const mime = strategy.getContentType();
      if (format === 'md') {
        expect(mime).toBe('text/markdown');
      } else if (format === 'html') {
        expect(mime).toBe('text/html');
      } else {
        expect(mime).toBe('application/pdf');
      }
    }
  });

  it('falls back to pdf strategy for unknown format', () => {
    const strategy = getReportFormatStrategy('unknown');
    expect(strategy.getContentType()).toBe('application/pdf');
  });

  it('embeds cover background image when backend/assets/bg.png exists', () => {
    const html = wrapMarkdownPlainAsHtmlDocument('# Test', 'Test Report');
    expect(html).toContain('cover-card has-image');
    expect(html).toContain('cover-art-image');
    expect(html).toContain('data:image/png;base64,');
  });
});
