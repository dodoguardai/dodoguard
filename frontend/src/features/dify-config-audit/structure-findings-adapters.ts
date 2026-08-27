/**
 * Map task config-review rule hits into Dify structured explorer finding shape.
 */

import { lineRangeLabel } from '@/components/rule-hits-location';
import type { FindingDetectionRuleResult } from '@/types/entities';
import type { DifyConfigAuditFinding } from '@/services/api/dify-config-audit';

const SEVERITY_SET = new Set(['low', 'medium', 'high', 'critical']);

export function normalizeStructureSeverity(
  raw: string | undefined,
): DifyConfigAuditFinding['severity'] {
  if (!raw) {
    return 'medium';
  }
  const n = raw.trim().toLowerCase();
  if (SEVERITY_SET.has(n)) {
    return n as DifyConfigAuditFinding['severity'];
  }
  return 'medium';
}

const EVIDENCE_IN_LOCATION_MAX = 240;

export function ruleHitsToStructureFindings(
  hits: FindingDetectionRuleResult[],
): DifyConfigAuditFinding[] {
  return hits.map((h, i) => {
    const category = h.ruleName?.trim() || 'Detection rule';
    const line = lineRangeLabel(h);
    const ev = (h.evidence ?? '').trim();
    const evSnippet = ev.length > EVIDENCE_IN_LOCATION_MAX ? `${ev.slice(0, EVIDENCE_IN_LOCATION_MAX)}…` : ev;
    const locationParts = [h.logicalPath, line, evSnippet].filter(Boolean);
    const location = locationParts.join(' · ') || `rule-hit-${h.ruleId}-${i}`;

    return {
      severity: normalizeStructureSeverity(h.severity),
      category,
      location,
      issue: h.matched === false ? `Rule evaluated: ${category}` : `Rule matched: ${category}`,
      evidence: h.evidence || h.contextSnippet || '—',
      recommendation:
        'Review the highlighted configuration and detection rule documentation; adjust exports or rules if this is a false positive.',
    };
  });
}
