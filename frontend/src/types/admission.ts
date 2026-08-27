/** Security admission management types */

export type AdmissionStatus =
  | 'draft'
  | 'submitted'
  | 'material_checking'
  | 'material_pending'
  | 'pending_security_test'
  | 'testing'
  | 'pending_review'
  | 'pending_remediation'
  | 'remediating'
  | 'pending_retest'
  | 'retesting'
  | 'pending_approval'
  | 'admitted'
  | 'conditional_admitted'
  | 'gray_admitted'
  | 'degraded_admitted'
  | 'risk_accepted'
  | 'rejected'
  | 'offline_remediation'
  | 'archived';

export type AdmissionApplicationType =
  | 'new_launch'
  | 'major_change'
  | 'external_open'
  | 'high_risk_capability'
  | 'kb_bulk_update'
  | 'permission_expand'
  | 'risk_fix_retest';

export type AdmissionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AdmissionDecisionType =
  | 'admit'
  | 'conditional'
  | 'gray'
  | 'degraded'
  | 'manual_confirm'
  | 'retest_required'
  | 'reject'
  | 'risk_accept'
  | 'offline';

export type LaunchRestrictionType = 'conditional' | 'gray' | 'degraded';

export type RemediationStatus = 'open' | 'in_progress' | 'pending_retest' | 'closed';

export interface AdmissionApplication {
  id: string;
  applicationNo: string;
  agentId: string;
  agentName: string;
  applicationType: AdmissionApplicationType;
  applicant: string;
  applicantId?: string;
  department: string;
  businessUnit?: string;
  usageScope: string;
  capabilitySummary?: string;
  tools?: string[];
  dataScope?: string;
  permissionScope?: string;
  isHighRisk?: boolean;
  plannedLaunchAt?: string;
  description?: string;
  riskLevel: AdmissionRiskLevel;
  status: AdmissionStatus;
  securityOwner?: string;
  decision?: AdmissionDecisionType;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  isOverdue?: boolean;
}

export interface AdmissionMaterialCheck {
  key: string;
  label: string;
  required: boolean;
  passed: boolean;
  note?: string;
}

export interface AdmissionSelfTestItem {
  key: string;
  label: string;
  passed: boolean;
  note?: string;
}

export interface AdmissionSecurityTestLink {
  id: string;
  taskId?: string;
  taskName?: string;
  taskType: 'attack_task' | 'config_audit';
  status: string;
  strategy?: string;
  slaDeadline?: string;
  assignee?: string;
}

export interface AdmissionRiskLink {
  id: string;
  findingId?: string;
  riskNo: string;
  riskType: string;
  riskLevel: AdmissionRiskLevel;
  source: string;
  impactScope?: string;
  owner?: string;
  dueAt?: string;
  status: RemediationStatus;
  retestResult?: 'pass' | 'fail' | 'pending';
  isBlocking?: boolean;
}

export interface AdmissionRemediationTask {
  id: string;
  applicationId: string;
  riskId: string;
  riskNo: string;
  riskLevel: AdmissionRiskLevel;
  riskType: string;
  agentName: string;
  description: string;
  reproductionSteps?: string;
  suggestion?: string;
  dueAt?: string;
  status: RemediationStatus;
  owner?: string;
  evidence?: string;
  retestResult?: 'pass' | 'fail' | 'pending';
  isOverdue?: boolean;
}

export interface AdmissionApprovalRecord {
  id: string;
  role: string;
  actor: string;
  action: string;
  comment?: string;
  createdAt: string;
}

export interface AdmissionLaunchRestriction {
  id: string;
  applicationId: string;
  applicationNo: string;
  agentName: string;
  type: LaunchRestrictionType;
  conditions: Record<string, unknown>;
  status: 'active' | 'expired' | 'revoked';
  executedBy?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface AdmissionRiskAcceptance {
  id: string;
  applicationId: string;
  applicationNo: string;
  agentName: string;
  residualRisk: string;
  businessNecessity: string;
  compensatingControls?: string;
  expiresAt: string;
  businessOwner: string;
  securityOwner: string;
  status: 'pending' | 'approved' | 'expired' | 'rejected';
  createdAt: string;
}

export interface AdmissionOfflineAction {
  id: string;
  applicationId?: string;
  agentId: string;
  agentName: string;
  trigger: string;
  action: string;
  status: 'pending' | 'executed' | 'completed';
  executedBy?: string;
  createdAt: string;
}

export interface AdmissionReport {
  id: string;
  applicationId: string;
  applicationNo: string;
  agentName: string;
  archiveNo: string;
  title: string;
  decision?: AdmissionDecisionType;
  generatedAt: string;
  generatedBy?: string;
}

export interface AdmissionTriggerRule {
  id: string;
  trigger: string;
  description: string;
  required: boolean;
  autoTrigger: boolean;
}

export interface AdmissionOverviewStats {
  materialPending: number;
  pendingSecurityTest: number;
  pendingReview: number;
  pendingRemediation: number;
  pendingRetest: number;
  pendingApproval: number;
  overdue: number;
}

export interface AdmissionApplicationDetail extends AdmissionApplication {
  materials: AdmissionMaterialCheck[];
  selfTests: AdmissionSelfTestItem[];
  securityTests: AdmissionSecurityTestLink[];
  risks: AdmissionRiskLink[];
  remediations: AdmissionRemediationTask[];
  approvals: AdmissionApprovalRecord[];
  recommendedDecision?: AdmissionDecisionType;
  report?: AdmissionReport;
}

export interface ListAdmissionApplicationsParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: AdmissionStatus;
  riskLevel?: AdmissionRiskLevel;
  applicationType?: AdmissionApplicationType;
  department?: string;
  owner?: string;
  overdue?: boolean;
}
