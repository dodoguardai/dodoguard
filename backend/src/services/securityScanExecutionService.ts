export { executePatrolPlanAsRun, executeSecurityScanTask } from '../server/routes/api/v1/scan';

export type ExecuteSecurityScanTaskOptions = {
  mode?: 'manual' | 'scheduled';
  generateFindings?: boolean;
  actorId?: string | null;
};
