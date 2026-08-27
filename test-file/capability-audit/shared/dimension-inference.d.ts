/**
 * 发现项 → ClawHub 17 维映射（引擎 category / 关键词 / 旧维度兼容）
 */
import { type CapabilityAuditDimensionId } from './dimensions';
export type SkillAuditFindingLike = {
  category?: string;
  dimension?: string;
  issue?: string;
  evidence?: string;
  location?: string;
  triageNote?: string;
};
/** 扫描完整性类发现，不计入 17 维 */
export declare function isMetaScanFinding(f: { category?: string }): boolean;
/** MiniRacer / local decode-script eval — not eval of HTTP response body. */
export declare function isLocalSandboxJsEval(f: SkillAuditFindingLike): boolean;
/** eval / Function / exec of dynamic / response strings — dangerous code execution, not exfil/obfuscation. */
export declare function hasDangerousEvalSignal(f: SkillAuditFindingLike): boolean;
export declare function inferSkillAuditDimension(
  f: SkillAuditFindingLike,
): CapabilityAuditDimensionId;
export declare function isSkillAuditDimensionId(
  v: string | undefined,
): v is CapabilityAuditDimensionId;
