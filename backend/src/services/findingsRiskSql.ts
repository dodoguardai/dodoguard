/**
 * SQL fragments aligned with toFinding / toFindingFromRecord risk semantics for stats and filters.
 */

import { sql, type SQL } from 'drizzle-orm';

/** finding_records.severity → bucket for dashboard (critical|high|medium|low). Matches UI fallback for null/blank. */
export function sqlFindingRecordRiskBucket(severityColumn: unknown): SQL {
  const s = sql`LOWER(TRIM(COALESCE(NULLIF(TRIM(${severityColumn}), ''), 'medium')))`;
  return sql`
    CASE
      WHEN ${s} IN ('critical', 'high', 'medium', 'low') THEN ${s}
      WHEN ${s} = 'info' THEN 'low'
      ELSE 'medium'
    END
  `;
}

/** Predicate: final_verdict marks a vulnerable finding (aligned with list post-filter). */
export function sqlVerdictIsVulnerable(
  finalVerdictColumn: unknown,
  dbType: 'mysql' | 'postgres',
): SQL {
  if (dbType === 'mysql') {
    // Match boolean true, string "true", and JSON boolean (CAST) — list() still uses JS as source of truth; see getCountsByRiskLevel fallback.
    return sql`(
      IFNULL(LOWER(JSON_UNQUOTE(JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable'))), '') IN ('true', '1')
      OR JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable') = CAST('true' AS JSON)
      OR JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable') = true
    )`;
  }
  return sql`(
    (${finalVerdictColumn}->>'vulnerable') = 'true'
    OR (${finalVerdictColumn}->'vulnerable') = 'true'::jsonb
  )`;
}

/**
 * Effective risk level for attack_results (aligned with toFinding):
 * non-empty riskLevel from JSON (normalized) if in critical|high|medium|low; else unknown explicit → medium;
 * else if vulnerable → high; else medium. Maps JSON "info" to low for dashboard buckets.
 */
export function sqlEffectiveAttackResultRisk(
  finalVerdictColumn: unknown,
  dbType: 'mysql' | 'postgres',
): SQL {
  if (dbType === 'mysql') {
    const raw = sql`NULLIF(TRIM(LOWER(JSON_UNQUOTE(JSON_EXTRACT(${finalVerdictColumn}, '$.riskLevel')))), '')`;
    const vuln = sql`(
      IFNULL(LOWER(JSON_UNQUOTE(JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable'))), '') IN ('true', '1')
      OR JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable') = CAST('true' AS JSON)
      OR JSON_EXTRACT(${finalVerdictColumn}, '$.vulnerable') = true
    )`;
    return sql`
      CASE
        WHEN ${raw} IN ('critical', 'high', 'medium', 'low') THEN ${raw}
        WHEN ${raw} = 'info' THEN 'low'
        WHEN ${raw} IS NOT NULL THEN 'medium'
        WHEN ${vuln} THEN 'high'
        ELSE 'medium'
      END
    `;
  }
  const rawPg = sql`NULLIF(TRIM(LOWER(${finalVerdictColumn}->>'riskLevel')), '')`;
  const vulnPg = sql`((${finalVerdictColumn}->>'vulnerable') = 'true' OR (${finalVerdictColumn}->'vulnerable') = 'true'::jsonb)`;
  return sql`
    CASE
      WHEN ${rawPg} IN ('critical', 'high', 'medium', 'low') THEN ${rawPg}
      WHEN ${rawPg} = 'info' THEN 'low'
      WHEN ${rawPg} IS NOT NULL THEN 'medium'
      WHEN ${vulnPg} THEN 'high'
      ELSE 'medium'
    END
  `;
}
