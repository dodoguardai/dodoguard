export const REPORT_BRAND_CONFIG_KEY = 'report_brand_config';
export const DEFAULT_REPORT_BRAND_ORGANIZATION = '亚太 AI 安全研究学会（APAIS）* 智御未来';

export type ReportBrandConfig = {
  organization: string;
};

export function normalizeReportBrandConfig(value: unknown): ReportBrandConfig {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const organization =
    String(record.organization ?? '').trim() || DEFAULT_REPORT_BRAND_ORGANIZATION;
  return {
    organization: organization.slice(0, 140),
  };
}
