/**
 * System config: whether SKILL capability-audit frontend shows advanced scan UI.
 * Key: capability_audit_ui_config
 */

export const CAPABILITY_AUDIT_UI_CONFIG_KEY = 'capability_audit_ui_config';

export type CapabilityAuditUiConfig = {
  /** When true, show engine status + scan strategy selector on the SKILL audit UI. */
  showAdvancedScanUi: boolean;
};

export const DEFAULT_CAPABILITY_AUDIT_UI_CONFIG: CapabilityAuditUiConfig = {
  showAdvancedScanUi: false,
};

export function normalizeCapabilityAuditUiConfig(raw: unknown): CapabilityAuditUiConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CAPABILITY_AUDIT_UI_CONFIG };
  }
  const o = raw as Record<string, unknown>;
  return {
    showAdvancedScanUi: o.showAdvancedScanUi === true,
  };
}
