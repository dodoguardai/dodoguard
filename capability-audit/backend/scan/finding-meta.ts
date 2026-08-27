/**
 * Word 方案 §13 — risk_type / suggested_action 映射与补全。
 */

import type { RiskType, ScanSeverity, SuggestedAction, UnifiedFinding } from './types';

const CATEGORY_RISK_TYPE: Record<string, RiskType> = {
  A_SECRET: 'sensitive_data_leakage',
  B_SUPPLY_CHAIN: 'supply_chain_risk',
  D_DATA: 'external_network_risk',
  E_PROMPT: 'prompt_instruction_risk',
  F_TOOL: 'tool_poisoning_risk',
  DEPENDENCY_VULNERABILITY: 'supply_chain_risk',
  ARCHIVE_SECURITY: 'filesystem_risk',
  SCAN_INTEGRITY: 'scan_integrity_risk',
};

export function mapCategoryToRiskType(category: string): RiskType {
  return CATEGORY_RISK_TYPE[category] ?? 'dangerous_code_execution';
}

export function inferSuggestedAction(severity: ScanSeverity, riskType?: RiskType): SuggestedAction {
  if (riskType === 'scan_integrity_risk') {
    return 'review';
  }
  if (severity === 'critical') {
    return 'block';
  }
  if (severity === 'high') {
    return 'block';
  }
  if (severity === 'medium') {
    return 'review';
  }
  return 'allow';
}

export function enrichFinding(f: UnifiedFinding): UnifiedFinding {
  const riskType = f.riskType ?? mapCategoryToRiskType(f.category);
  const suggestedAction = f.suggestedAction ?? inferSuggestedAction(f.severity, riskType);
  return { ...f, riskType, suggestedAction };
}

export function overallSuggestedAction(findings: UnifiedFinding[]): SuggestedAction {
  const formal = findings.filter((f) => {
    const status = f.processingStatus;
    if (!status) {
      return true;
    }
    return status === 'confirmed' || status === 'suspected';
  });
  if (formal.some((f) => f.suggestedAction === 'block')) {
    return 'block';
  }
  if (formal.some((f) => f.suggestedAction === 'review')) {
    return 'review';
  }
  return 'allow';
}

export function buildRiskSummary(findings: UnifiedFinding[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const formal = findings.filter((f) => {
    const status = f.processingStatus;
    if (!status) {
      return true;
    }
    return status === 'confirmed' || status === 'suspected';
  });
  return {
    critical: formal.filter((f) => f.severity === 'critical').length,
    high: formal.filter((f) => f.severity === 'high').length,
    medium: formal.filter((f) => f.severity === 'medium').length,
    low: formal.filter((f) => f.severity === 'low').length,
  };
}
