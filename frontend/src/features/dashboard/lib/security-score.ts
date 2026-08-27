export type SecurityScoreBand = 'good' | 'watch' | 'critical';

export type SecurityScoreInput = {
  totalAgents: number;
  highRiskAgents: number;
  openCritical: number;
  openHigh: number;
  openMedium: number;
  overdueRemediations: number;
  pendingIntake: number;
  undetectedAgents: number;
};

/**
 * Security index from live posture — capped penalties so large finding volumes
 * don't collapse the score to zero while still reflecting real risk.
 */
export function computeSecurityScore(input: SecurityScoreInput): {
  score: number;
  band: SecurityScoreBand;
} {
  const agents = Math.max(input.totalAgents, 1);
  const healthyRatio = 1 - Math.min(1, input.highRiskAgents / agents);
  const coverageRatio = 1 - Math.min(1, input.undetectedAgents / agents);

  let score = Math.round(healthyRatio * 45 + coverageRatio * 25 + 30);
  score -= Math.min(20, input.openCritical * 4);
  score -= Math.min(18, input.openHigh * 1.2);
  score -= Math.min(8, input.openMedium * 0.25);
  score -= Math.min(12, input.overdueRemediations * 3);
  score -= Math.min(8, input.pendingIntake * 1.5);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const band: SecurityScoreBand = score >= 80 ? 'good' : score >= 60 ? 'watch' : 'critical';
  return { score, band };
}

/** Circumference of score ring (r=52) */
export const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * 52;

export function scoreRingDash(score: number): string {
  const filled = (score / 100) * SCORE_RING_CIRCUMFERENCE;
  return `${filled.toFixed(1)} ${SCORE_RING_CIRCUMFERENCE.toFixed(1)}`;
}
