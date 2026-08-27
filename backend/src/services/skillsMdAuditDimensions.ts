/**
 * Re-export ClawHub 17-dimension taxonomy for backend services.
 */

declare const require: (id: string) => any;

export type CapabilityAuditDimensionId = string;
export type SkillAuditFindingLike = {
  category?: string;
  dimension?: string;
  issue?: string;
  evidence?: string;
  location?: string;
  triageNote?: string;
};

const dimensions = require('../../../capability-audit/shared/dimensions.js') as {
  CAPABILITY_AUDIT_DIMENSION_IDS: readonly CapabilityAuditDimensionId[];
  CAPABILITY_AUDIT_DIMENSION_COUNT: number;
  dimensionLabel: (id: CapabilityAuditDimensionId) => string;
  normalizeDimensionId: (id?: string) => CapabilityAuditDimensionId | undefined;
};

const dimensionInference = require('../../../capability-audit/shared/dimension-inference.js') as {
  inferSkillAuditDimension: (finding: SkillAuditFindingLike) => CapabilityAuditDimensionId;
  isMetaScanFinding: (finding: { category?: string }) => boolean;
  isSkillAuditDimensionId: (value?: string) => value is CapabilityAuditDimensionId;
};

export const {
  CAPABILITY_AUDIT_DIMENSION_IDS,
  CAPABILITY_AUDIT_DIMENSION_COUNT,
  dimensionLabel,
  normalizeDimensionId,
} = dimensions;

export const { inferSkillAuditDimension, isMetaScanFinding, isSkillAuditDimensionId } =
  dimensionInference;

/** @deprecated Use CAPABILITY_AUDIT_DIMENSION_IDS */
export const SKILL_AUDIT_DIMENSION_IDS = CAPABILITY_AUDIT_DIMENSION_IDS;

/** @deprecated Use CapabilityAuditDimensionId */
export type SkillAuditDimensionId = CapabilityAuditDimensionId;

/** Best-effort: match location string to a scanned package path. */
export function inferSourceFileFromLocation(
  location: string,
  scannedPaths: readonly string[],
): string | undefined {
  if (!location || scannedPaths.length === 0) {
    return undefined;
  }
  const norm = location.replace(/\\/g, '/');
  for (const p of scannedPaths) {
    const pn = p.replace(/\\/g, '/');
    if (norm.includes(pn)) {
      return p;
    }
  }
  const pathLike = /(?:^|\s)([\w./-]+\.(?:md|yaml|yml|json|txt|sh|py|ts|js))\b/i.exec(location);
  if (pathLike?.[1]) {
    const candidate = pathLike[1].replace(/^\.\//, '');
    if (scannedPaths.some((sp) => sp === candidate || sp.endsWith(`/${candidate}`))) {
      return scannedPaths.find((sp) => sp === candidate || sp.endsWith(`/${candidate}`));
    }
  }
  return undefined;
}
