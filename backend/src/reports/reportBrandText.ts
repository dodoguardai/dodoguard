/** Product brand shown in customer-facing reports (对外报告品牌名). */
export const REPORT_PRODUCT_BRAND_ZH = '智安';

/** Replace legacy DodoGuard branding in generated report text/HTML/Markdown. */
export function applyReportProductBrand(content: string): string {
  if (!content) {
    return content;
  }
  return content
    .replace(/DodoGuard Security Platform/g, `${REPORT_PRODUCT_BRAND_ZH}安全平台`)
    .replace(/DodoGuard Security Report/g, `${REPORT_PRODUCT_BRAND_ZH}安全报告`)
    .replace(/DodoGuard Security Testing Platform/g, `${REPORT_PRODUCT_BRAND_ZH}安全测试平台`)
    .replace(/DodoGuard 安全测试平台/g, `${REPORT_PRODUCT_BRAND_ZH}安全测试平台`)
    .replace(/DodoGuard/g, REPORT_PRODUCT_BRAND_ZH);
}
