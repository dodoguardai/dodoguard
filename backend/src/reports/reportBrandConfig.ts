import logger from '../logger';
import { systemConfigService } from '../services/systemConfigService';

export const REPORT_BRAND_CONFIG_KEY = 'report_brand_config';
export const DEFAULT_REPORT_BRAND_ORGANIZATION = '亚太 AI 安全研究学会（APAIS）* 智御未来';

export type ReportBrandConfig = {
  organization: string;
};

function normalizeOrganization(value: unknown): string {
  const text = String(value ?? '').trim();
  return (text || DEFAULT_REPORT_BRAND_ORGANIZATION).slice(0, 140);
}

export function resolveReportBrandConfig(
  overrides?: Partial<ReportBrandConfig>,
): ReportBrandConfig {
  return {
    organization: normalizeOrganization(
      overrides?.organization ??
        process.env.REPORT_BRAND_ORGANIZATION?.trim() ??
        DEFAULT_REPORT_BRAND_ORGANIZATION,
    ),
  };
}

export async function loadReportBrandConfig(): Promise<ReportBrandConfig> {
  try {
    const stored = await systemConfigService.getConfig(REPORT_BRAND_CONFIG_KEY);
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const organization = (stored as Record<string, unknown>).organization;
      return resolveReportBrandConfig({
        organization: typeof organization === 'string' ? organization : undefined,
      });
    }
  } catch (error) {
    logger.warn('[ReportBrandConfig] Failed to load system config; using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return resolveReportBrandConfig();
}
