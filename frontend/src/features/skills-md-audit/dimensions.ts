/**
 * ClawHub 17-dimension helpers — re-export from capability-audit shared module.
 */

export {
  CAPABILITY_AUDIT_DIMENSION_IDS,
  CAPABILITY_AUDIT_DIMENSION_COUNT,
  type CapabilityAuditDimensionId,
  dimensionLabel,
  normalizeDimensionId,
  DIMENSION_ICON,
} from 'capability-audit/shared/dimensions';

export {
  inferSkillAuditDimension,
  isMetaScanFinding,
  isSkillAuditDimensionId,
} from 'capability-audit/shared/dimension-inference';

export {
  CAPABILITY_AUDIT_DIMENSION_IDS as SKILL_AUDIT_DIMENSION_IDS,
  type CapabilityAuditDimensionId as SkillAuditDimensionId,
} from 'capability-audit/shared/dimensions';

import { inferSkillAuditDimension } from 'capability-audit/shared/dimension-inference';
import type { CapabilityAuditDimensionId } from 'capability-audit/shared/dimensions';

export function inferSkillAuditDimensionClient(f: {
  category?: string;
  dimension?: string;
  issue?: string;
  evidence?: string;
  location?: string;
  triageNote?: string;
}): CapabilityAuditDimensionId {
  return inferSkillAuditDimension(f);
}
