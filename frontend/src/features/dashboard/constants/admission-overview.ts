/** Demo admission queue stats — keep in sync with frontend/public/admission/data.js overview */
export const ADMISSION_OVERVIEW_STATS = {
  materialPending: 2,
  pendingSecurityTest: 3,
  pendingReview: 4,
  pendingRemediation: 5,
  pendingRetest: 2,
  pendingApproval: 3,
  overdue: 2,
} as const;

export function admissionActionableCount(): number {
  const s = ADMISSION_OVERVIEW_STATS;
  return s.pendingReview + s.pendingRemediation + s.pendingRetest + s.pendingApproval;
}
