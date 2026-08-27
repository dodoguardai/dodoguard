import type { ComplianceReportPreview } from '@/features/compliance-detection/compliance-report-types';
import apiClient, { handleApiResponse } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '@/types/api';
import type {
  CapabilityComponentDetail,
  CapabilityComponentKind,
  CapabilityComponentRegistry,
  CapabilityRiskLibrary,
  CapabilityRiskRule,
  ComplianceRegulationMapping,
  ComplianceTaskTemplate,
  DetectionCaseStatus,
  DetectionRiskLevel,
  DetectionScanStatus,
  SecurityCaseLibrary,
  SecurityFinalDecision,
  SecurityRemediationStatus,
  SecurityRemediationTask,
  SecurityRetestStatus,
  SecurityScanFinding,
  SecurityScanFindingStatus,
  SecurityScanTask,
  SecurityScanTaskPlan,
  SecurityTestCase,
} from '@/types/entities';

export type SecurityScanTaskPayload = Partial<
  Omit<SecurityScanTask, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'plans'>
> & {
  name: string;
  templateId?: string | null;
  plans?: Array<
    Partial<SecurityScanTaskPlan> & Pick<SecurityScanTaskPlan, 'probeType' | 'strategy'>
  >;
};

export type SecurityCaseLibraryPayload = Partial<
  Omit<SecurityCaseLibrary, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
> & {
  title: string;
  domain: string;
  description: string;
  detectMethod: string;
};

export type SecurityTestCasePayload = Partial<
  Omit<SecurityTestCase, 'id' | 'organizationId' | 'libraryId' | 'createdAt' | 'updatedAt'>
> & {
  name?: string;
  prompt: string;
};

export type TechnicalCaseAiExpandPreviewItem = {
  id: string;
  name: string;
  testMethodSlug: 'direct' | 'multi_turn' | 'custom';
  customTestMethod?: string;
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  riskLevel?: DetectionRiskLevel;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type TechnicalCaseAiExpandPreviewPayload = {
  direction?: string;
  count?: number;
  typePref?: 'any' | 'direct' | 'multi_turn' | 'custom';
  referenceCaseIds?: string[];
};

export type TechnicalCaseAiExpandPreviewResponse = {
  cases: TechnicalCaseAiExpandPreviewItem[];
  model?: {
    providerId: string;
    matchedSelection: boolean;
  };
};

export type SecurityCaseImportResponse = {
  imported: number;
  skipped: number;
  caseIds: string[];
};

export type ComplianceCaseAiExpandPreviewItem = {
  id: string;
  name: string;
  sampleType: 'single' | 'multi_turn' | 'file_input' | 'file_output';
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  riskLevel?: DetectionRiskLevel;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type ComplianceCaseAiExpandPreviewPayload = {
  direction?: string;
  count?: number;
  typePref?: 'any' | 'single' | 'multi_turn' | 'file_input' | 'file_output';
  referenceCaseIds?: string[];
};

export type ComplianceCaseAiExpandPreviewResponse = {
  cases: ComplianceCaseAiExpandPreviewItem[];
  model?: {
    providerId: string;
    matchedSelection: boolean;
  };
};

export type ComplianceMappingPayload = Partial<
  Omit<ComplianceRegulationMapping, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
> & {
  law: string;
  article: string;
};

export type ComplianceTaskTemplatePayload = {
  name: string;
  domain: string;
  scope?: string;
  description?: string | null;
  libraryKeys: string[];
  sampleTypes?: string[];
  assessScenario?: 'launch' | 'change' | 'periodic' | 'retest';
  creationMode?: 'ai' | 'manual';
  icon?: string | null;
  tags?: string[];
  ownerName?: string | null;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

export type CapabilityRiskPayload = Partial<
  Omit<CapabilityRiskLibrary, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
> & {
  componentKind: CapabilityComponentKind;
  componentName: string;
  riskTitle: string;
  description: string;
};

export type CapabilityComponentPayload = {
  componentKind: CapabilityComponentKind;
  name: string;
  componentKey?: string | null;
  version?: string | null;
  description?: string | null;
  source?: string | null;
  permissionScope?: Record<string, unknown> | null;
  checks?: string[];
  riskLevel?: DetectionRiskLevel;
  riskTitle?: string | null;
  enabled?: boolean;
  status?: string;
  metadata?: Record<string, unknown>;
  createRiskProfile?: boolean;
};

export type CapabilityRiskRulePayload = Partial<
  Omit<CapabilityRiskRule, 'id' | 'organizationId' | 'riskLibraryId' | 'createdAt' | 'updatedAt'>
> & {
  name: string;
  checkTarget: string;
};

export type ExecuteScanTaskPayload = {
  mode?: 'simulate' | 'manual';
  generateFindings?: boolean;
};

export type RemediationUpdatePayload = {
  status?: SecurityRemediationStatus;
  ownerName?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
  targetAssetVersion?: string | null;
  targetSnapshotId?: string | null;
  evidenceSummary?: string | null;
  retestStatus?: SecurityRetestStatus;
  finalDecision?: SecurityFinalDecision | null;
  acceptedReason?: string | null;
  metadata?: Record<string, unknown>;
};

export type RemediationEvidencePayload = {
  evidenceType?: string;
  title: string;
  content: string;
  attachments?: Array<Record<string, unknown>>;
};

export type RemediationRetestPayload = {
  result?: Exclude<SecurityRetestStatus, 'not_started'>;
  conclusion?: string;
  evidence?: Record<string, unknown>;
  retestAssetVersion?: string | null;
  retestSnapshotId?: string | null;
  retestTaskId?: string | null;
};

export type SecurityRetestRun = {
  retestScanTaskId: string;
  planId: string | null;
  reportId: string | null;
  remediationIds: string[];
  status: string;
  progress: number;
  name: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  completedAt?: string | null;
  updatedAt: string;
};

export type CompliancePrecheckStepStatus = 'done' | 'failed' | 'skipped';

export type CompliancePrecheckStep = {
  key: string;
  title: string;
  description: string;
  status: CompliancePrecheckStepStatus;
  detail?: string;
  durationMs?: number;
};

export type CompliancePrecheckTrigger = {
  rule: string;
  desc: string;
  required: boolean;
};

export type CompliancePrecheckRecommendedLibrary = {
  id: string;
  title: string;
  domain: string;
  caseCount: number;
  enabled: boolean;
};

export type CompliancePrecheckApiResult = {
  steps: CompliancePrecheckStep[];
  apiStatus: 'passed' | 'failed' | 'skipped';
  apiResponseTimeMs?: number;
  apiMessage?: string;
  agent: {
    name: string;
    department: string;
    scene: string;
    sensitiveData: boolean;
    exposureLevel: string;
    dataTypeLabel: string;
  };
  recommendedDomain: string;
  triggers: CompliancePrecheckTrigger[];
  recommendedLibraries: CompliancePrecheckRecommendedLibrary[];
  applicableLaws: string[];
  warnings: string[];
  estimatedCaseCount: number;
  identifiedScenes: string[];
  identifiedDataTypes: string[];
  matchedDomains: string[];
};

export type CompliancePrecheckPayload = {
  assetId: string;
  domainOverride?: string;
};

export type RecommendLibraryItem = {
  libraryId: string;
  libraryKey?: string;
  title: string;
  domain: string;
  caseCount: number;
  reason: string;
};

export type DialogueRecommendPlanResult = {
  source: 'llm' | 'rules';
  confidence: number;
  include: RecommendLibraryItem[];
  exclude: RecommendLibraryItem[];
  estimatedCaseCount: number;
  focusDomains: string[];
  missingPortraitFields: string[];
  rationaleSummary: string;
};

export type ComplianceRecommendPlanResult = {
  source: 'llm' | 'rules';
  confidence: number;
  recommendedDomain: string;
  include: RecommendLibraryItem[];
  exclude: RecommendLibraryItem[];
  estimatedCaseCount: number;
  missingPortraitFields: string[];
  rationaleSummary: string;
};

type ListCaseLibrariesParams = PaginationParams & {
  search?: string;
  domain?: string;
  status?: DetectionCaseStatus | 'all';
  category?: 'technical' | 'compliance';
};

async function requestCaseLibraries(
  params?: ListCaseLibrariesParams,
): Promise<PaginatedResponse<SecurityCaseLibrary>> {
  const response = await apiClient.get<ApiResponse<PaginatedResponse<SecurityCaseLibrary>>>(
    '/scan/case-libraries',
    { params: { ...params, status: params?.status === 'all' ? undefined : params?.status } },
  );
  return handleApiResponse(response.data);
}

export const detectionScanningApi = {
  listTasks: async (
    params?: PaginationParams & {
      search?: string;
      status?: DetectionScanStatus | 'all';
      scanType?: string;
      targetKind?: string;
    },
  ): Promise<PaginatedResponse<SecurityScanTask>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<SecurityScanTask>>>(
      '/scan/tasks',
      { params: { ...params, status: params?.status === 'all' ? undefined : params?.status } },
    );
    return handleApiResponse(response.data);
  },

  createTask: async (payload: SecurityScanTaskPayload): Promise<SecurityScanTask> => {
    const response = await apiClient.post<ApiResponse<SecurityScanTask>>('/scan/tasks', payload);
    return handleApiResponse(response.data);
  },

  getTask: async (id: string): Promise<SecurityScanTask> => {
    const response = await apiClient.get<ApiResponse<SecurityScanTask>>(`/scan/tasks/${id}`);
    return handleApiResponse(response.data);
  },

  listRetestRuns: async (taskId: string): Promise<SecurityRetestRun[]> => {
    const response = await apiClient.get<ApiResponse<SecurityRetestRun[]>>(
      `/scan/tasks/${taskId}/retest-runs`,
    );
    return handleApiResponse(response.data);
  },

  updateTask: async (
    id: string,
    payload: Partial<SecurityScanTaskPayload>,
  ): Promise<SecurityScanTask> => {
    const response = await apiClient.patch<ApiResponse<SecurityScanTask>>(
      `/scan/tasks/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  executeTask: async (id: string, payload?: ExecuteScanTaskPayload): Promise<SecurityScanTask> => {
    const response = await apiClient.post<ApiResponse<SecurityScanTask>>(
      `/scan/tasks/${id}/execute`,
      payload || {},
      { timeout: 600_000 },
    );
    return handleApiResponse(response.data);
  },

  deleteTask: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(`/scan/tasks/${id}`);
    return handleApiResponse(response.data);
  },

  listFindings: async (
    params?: PaginationParams & {
      taskId?: string;
      status?: SecurityScanFindingStatus | 'all';
      riskLevel?: DetectionRiskLevel | 'all';
    },
  ): Promise<PaginatedResponse<SecurityScanFinding>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<SecurityScanFinding>>>(
      '/scan/findings',
      {
        params: {
          ...params,
          status: params?.status === 'all' ? undefined : params?.status,
          riskLevel: params?.riskLevel === 'all' ? undefined : params?.riskLevel,
        },
      },
    );
    return handleApiResponse(response.data);
  },

  listRemediations: async (
    params?: PaginationParams & {
      taskId?: string;
      status?: SecurityRemediationStatus | 'all';
      riskLevel?: DetectionRiskLevel | 'all';
      ownerName?: string;
    },
  ): Promise<PaginatedResponse<SecurityRemediationTask>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<SecurityRemediationTask>>>(
      '/scan/remediations',
      {
        params: {
          ...params,
          status: params?.status === 'all' ? undefined : params?.status,
          riskLevel: params?.riskLevel === 'all' ? undefined : params?.riskLevel,
        },
      },
    );
    return handleApiResponse(response.data);
  },

  getRemediation: async (id: string): Promise<SecurityRemediationTask> => {
    const response = await apiClient.get<ApiResponse<SecurityRemediationTask>>(
      `/scan/remediations/${id}`,
    );
    return handleApiResponse(response.data);
  },

  updateRemediation: async (
    id: string,
    payload: RemediationUpdatePayload,
  ): Promise<SecurityRemediationTask> => {
    const response = await apiClient.patch<ApiResponse<SecurityRemediationTask>>(
      `/scan/remediations/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  submitEvidence: async (
    id: string,
    payload: RemediationEvidencePayload,
  ): Promise<SecurityRemediationTask> => {
    const response = await apiClient.post<ApiResponse<SecurityRemediationTask>>(
      `/scan/remediations/${id}/evidence`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  runRetest: async (
    id: string,
    payload: RemediationRetestPayload,
  ): Promise<SecurityRemediationTask> => {
    const response = await apiClient.post<ApiResponse<SecurityRemediationTask>>(
      `/scan/remediations/${id}/retest`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  listCaseLibraries: requestCaseLibraries,

  listAllCaseLibraries: async (
    params?: Omit<ListCaseLibrariesParams, 'limit' | 'offset' | 'page'>,
  ): Promise<PaginatedResponse<SecurityCaseLibrary>> => {
    const limit = 100;
    const firstPage = await requestCaseLibraries({ ...params, limit, offset: 0 });
    const allRows = [...firstPage.data];
    let offset = firstPage.offset + firstPage.data.length;

    while (firstPage.hasMore && offset < firstPage.total) {
      const page = await requestCaseLibraries({ ...params, limit, offset });
      allRows.push(...page.data);
      if (!page.hasMore || page.data.length === 0) {
        break;
      }
      offset = page.offset + page.data.length;
    }

    return {
      ...firstPage,
      data: allRows,
      limit: allRows.length,
      offset: 0,
      hasMore: allRows.length < firstPage.total,
    };
  },

  createCaseLibrary: async (payload: SecurityCaseLibraryPayload): Promise<SecurityCaseLibrary> => {
    const response = await apiClient.post<ApiResponse<SecurityCaseLibrary>>(
      '/scan/case-libraries',
      payload,
    );
    return handleApiResponse(response.data);
  },

  updateCaseLibrary: async (
    id: string,
    payload: Partial<SecurityCaseLibraryPayload>,
  ): Promise<SecurityCaseLibrary> => {
    const response = await apiClient.patch<ApiResponse<SecurityCaseLibrary>>(
      `/scan/case-libraries/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteCaseLibrary: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/scan/case-libraries/${id}`,
    );
    handleApiResponse(response.data);
  },

  listTestCases: async (libraryId: string): Promise<SecurityTestCase[]> => {
    const response = await apiClient.get<ApiResponse<SecurityTestCase[]>>(
      `/scan/case-libraries/${libraryId}/cases`,
    );
    return handleApiResponse(response.data);
  },

  createTestCase: async (
    libraryId: string,
    payload: SecurityTestCasePayload,
  ): Promise<SecurityTestCase> => {
    const response = await apiClient.post<ApiResponse<SecurityTestCase>>(
      `/scan/case-libraries/${libraryId}/cases`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  downloadCaseImportTemplate: async (libraryId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `/scan/case-libraries/${libraryId}/cases/import-template`,
      {
        responseType: 'blob',
      },
    );
    return response.data as Blob;
  },

  importTestCases: async (
    libraryId: string,
    file: File,
  ): Promise<SecurityCaseImportResponse> => {
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await apiClient.post<ApiResponse<SecurityCaseImportResponse>>(
      `/scan/case-libraries/${libraryId}/cases/import`,
      form,
      {
        timeout: 120_000,
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return handleApiResponse(response.data);
  },

  generateTechnicalCaseAiPreview: async (
    libraryId: string,
    payload: TechnicalCaseAiExpandPreviewPayload,
  ): Promise<TechnicalCaseAiExpandPreviewResponse> => {
    const response = await apiClient.post<ApiResponse<TechnicalCaseAiExpandPreviewResponse>>(
      `/scan/case-libraries/${libraryId}/ai-expand-preview`,
      payload,
      { timeout: 150000 },
    );
    return handleApiResponse(response.data);
  },

  generateComplianceCaseAiPreview: async (
    libraryId: string,
    payload: ComplianceCaseAiExpandPreviewPayload,
  ): Promise<ComplianceCaseAiExpandPreviewResponse> => {
    const response = await apiClient.post<ApiResponse<ComplianceCaseAiExpandPreviewResponse>>(
      `/scan/case-libraries/${libraryId}/compliance-ai-expand-preview`,
      payload,
      { timeout: 150000 },
    );
    return handleApiResponse(response.data);
  },

  updateTestCase: async (
    libraryId: string,
    caseId: string,
    payload: Partial<SecurityTestCasePayload>,
  ): Promise<SecurityTestCase> => {
    const response = await apiClient.patch<ApiResponse<SecurityTestCase>>(
      `/scan/case-libraries/${libraryId}/cases/${caseId}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteTestCase: async (libraryId: string, caseId: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/scan/case-libraries/${libraryId}/cases/${caseId}`,
    );
    handleApiResponse(response.data);
  },

  listComplianceMappings: async (
    params?: PaginationParams & {
      search?: string;
      law?: string;
      domain?: string;
      status?: string;
    },
  ): Promise<PaginatedResponse<ComplianceRegulationMapping>> => {
    const response = await apiClient.get<
      ApiResponse<PaginatedResponse<ComplianceRegulationMapping>>
    >('/scan/compliance-mappings', { params });
    return handleApiResponse(response.data);
  },

  createComplianceMapping: async (
    payload: ComplianceMappingPayload,
  ): Promise<ComplianceRegulationMapping> => {
    const response = await apiClient.post<ApiResponse<ComplianceRegulationMapping>>(
      '/scan/compliance-mappings',
      payload,
    );
    return handleApiResponse(response.data);
  },

  updateComplianceMapping: async (
    id: string,
    payload: Partial<ComplianceMappingPayload>,
  ): Promise<ComplianceRegulationMapping> => {
    const response = await apiClient.patch<ApiResponse<ComplianceRegulationMapping>>(
      `/scan/compliance-mappings/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteComplianceMapping: async (id: string): Promise<void> => {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/scan/compliance-mappings/${id}`,
    );
    handleApiResponse(response.data);
  },

  listCapabilityRisks: async (
    params?: PaginationParams & {
      search?: string;
      componentKind?: CapabilityComponentKind | 'all';
      riskLevel?: DetectionRiskLevel | 'all';
    },
  ): Promise<PaginatedResponse<CapabilityRiskLibrary>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<CapabilityRiskLibrary>>>(
      '/scan/capability-risks',
      {
        params: {
          ...params,
          componentKind: params?.componentKind === 'all' ? undefined : params?.componentKind,
          riskLevel: params?.riskLevel === 'all' ? undefined : params?.riskLevel,
        },
      },
    );
    return handleApiResponse(response.data);
  },

  createCapabilityRisk: async (payload: CapabilityRiskPayload): Promise<CapabilityRiskLibrary> => {
    const response = await apiClient.post<ApiResponse<CapabilityRiskLibrary>>(
      '/scan/capability-risks',
      payload,
    );
    return handleApiResponse(response.data);
  },

  updateCapabilityRisk: async (
    id: string,
    payload: Partial<CapabilityRiskPayload>,
  ): Promise<CapabilityRiskLibrary> => {
    const response = await apiClient.patch<ApiResponse<CapabilityRiskLibrary>>(
      `/scan/capability-risks/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  listCapabilityRules: async (riskId: string): Promise<CapabilityRiskRule[]> => {
    const response = await apiClient.get<ApiResponse<CapabilityRiskRule[]>>(
      `/scan/capability-risks/${riskId}/rules`,
    );
    return handleApiResponse(response.data);
  },

  createCapabilityRule: async (
    riskId: string,
    payload: CapabilityRiskRulePayload,
  ): Promise<CapabilityRiskRule> => {
    const response = await apiClient.post<ApiResponse<CapabilityRiskRule>>(
      `/scan/capability-risks/${riskId}/rules`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  listCapabilityComponents: async (
    params?: PaginationParams & {
      search?: string;
      componentKind?: CapabilityComponentKind | 'all';
      riskLevel?: DetectionRiskLevel | 'all';
    },
  ): Promise<PaginatedResponse<CapabilityComponentRegistry>> => {
    const response = await apiClient.get<
      ApiResponse<PaginatedResponse<CapabilityComponentRegistry>>
    >('/scan/capability-components', {
      params: {
        ...params,
        componentKind: params?.componentKind === 'all' ? undefined : params?.componentKind,
        riskLevel: params?.riskLevel === 'all' ? undefined : params?.riskLevel,
      },
    });
    return handleApiResponse(response.data);
  },

  getCapabilityComponent: async (id: string): Promise<CapabilityComponentDetail> => {
    const response = await apiClient.get<ApiResponse<CapabilityComponentDetail>>(
      `/scan/capability-components/${id}`,
    );
    return handleApiResponse(response.data);
  },

  createCapabilityComponent: async (
    payload: CapabilityComponentPayload,
  ): Promise<CapabilityComponentRegistry & { riskLibraryId?: string | null }> => {
    const response = await apiClient.post<
      ApiResponse<CapabilityComponentRegistry & { riskLibraryId?: string | null }>
    >('/scan/capability-components', payload);
    return handleApiResponse(response.data);
  },

  updateCapabilityComponent: async (
    id: string,
    payload: Partial<CapabilityComponentPayload>,
  ): Promise<CapabilityComponentRegistry> => {
    const response = await apiClient.patch<ApiResponse<CapabilityComponentRegistry>>(
      `/scan/capability-components/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteCapabilityComponent: async (id: string): Promise<{ id: string; deleted: boolean }> => {
    const response = await apiClient.delete<ApiResponse<{ id: string; deleted: boolean }>>(
      `/scan/capability-components/${id}`,
    );
    return handleApiResponse(response.data);
  },

  uploadCapabilityPackage: async (
    id: string,
    file: File,
  ): Promise<CapabilityComponentDetail['currentArtifact']> => {
    const form = new FormData();
    form.append('archive', file);
    const response = await apiClient.post<
      ApiResponse<CapabilityComponentDetail['currentArtifact']>
    >(`/scan/capability-components/${id}/package`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return handleApiResponse(response.data);
  },

  downloadCapabilityPackage: async (id: string, fileName?: string): Promise<void> => {
    const response = await apiClient.get(`/scan/capability-components/${id}/package/download`, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'package.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  readCapabilityPackageFile: async (
    id: string,
    filePath: string,
  ): Promise<{ path: string; text: string; kind?: string }> => {
    const response = await apiClient.get<
      ApiResponse<{ path: string; text: string; kind?: string }>
    >(`/scan/capability-components/${id}/package/files`, {
      params: { path: filePath },
    });
    return handleApiResponse(response.data);
  },

  runCompliancePrecheck: async (
    payload: CompliancePrecheckPayload,
  ): Promise<CompliancePrecheckApiResult> => {
    const response = await apiClient.post<ApiResponse<CompliancePrecheckApiResult>>(
      '/scan/compliance-precheck',
      payload,
    );
    return handleApiResponse(response.data);
  },

  recommendDialoguePlan: async (payload: {
    assetId: string;
    assessScenario?: string;
    candidateLibraryIds?: string[];
  }): Promise<DialogueRecommendPlanResult> => {
    const response = await apiClient.post<ApiResponse<DialogueRecommendPlanResult>>(
      '/scan/dialogue-recommend-plan',
      payload,
    );
    return handleApiResponse(response.data);
  },

  recommendCompliancePlan: async (payload: {
    assetId: string;
    domainOverride?: string;
    candidateLibraryIds?: string[];
  }): Promise<ComplianceRecommendPlanResult> => {
    const response = await apiClient.post<ApiResponse<ComplianceRecommendPlanResult>>(
      '/scan/compliance-recommend-plan',
      payload,
    );
    return handleApiResponse(response.data);
  },

  listComplianceTaskTemplates: async (
    params?: PaginationParams & { search?: string; domain?: string },
  ): Promise<PaginatedResponse<ComplianceTaskTemplate>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<ComplianceTaskTemplate>>>(
      '/scan/compliance-task-templates',
      {
        params: {
          ...params,
          domain: params?.domain === '全部' ? undefined : params?.domain,
        },
      },
    );
    return handleApiResponse(response.data);
  },

  getComplianceTaskTemplate: async (id: string): Promise<ComplianceTaskTemplate> => {
    const response = await apiClient.get<ApiResponse<ComplianceTaskTemplate>>(
      `/scan/compliance-task-templates/${id}`,
    );
    return handleApiResponse(response.data);
  },

  createComplianceTaskTemplate: async (
    payload: ComplianceTaskTemplatePayload,
  ): Promise<ComplianceTaskTemplate> => {
    const response = await apiClient.post<ApiResponse<ComplianceTaskTemplate>>(
      '/scan/compliance-task-templates',
      payload,
    );
    return handleApiResponse(response.data);
  },

  updateComplianceTaskTemplate: async (
    id: string,
    payload: Partial<ComplianceTaskTemplatePayload>,
  ): Promise<ComplianceTaskTemplate> => {
    const response = await apiClient.patch<ApiResponse<ComplianceTaskTemplate>>(
      `/scan/compliance-task-templates/${id}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  deleteComplianceTaskTemplate: async (id: string): Promise<{ id: string }> => {
    const response = await apiClient.delete<ApiResponse<{ id: string }>>(
      `/scan/compliance-task-templates/${id}`,
    );
    return handleApiResponse(response.data);
  },

  getComplianceReportPreview: async (taskId: string): Promise<ComplianceReportPreview> => {
    const response = await apiClient.get<ApiResponse<ComplianceReportPreview>>(
      `/scan/tasks/${taskId}/report-preview`,
    );
    return handleApiResponse(response.data);
  },

  overrideComplianceReportItem: async (
    taskId: string,
    caseId: string,
    payload: { passed: boolean; note?: string },
  ): Promise<ComplianceReportPreview> => {
    const response = await apiClient.patch<ApiResponse<ComplianceReportPreview>>(
      `/scan/tasks/${taskId}/report/items/${caseId}`,
      payload,
    );
    return handleApiResponse(response.data);
  },

  finalizeComplianceReport: async (
    taskId: string,
  ): Promise<{ reportId: string; preview: ComplianceReportPreview }> => {
    const response = await apiClient.post<
      ApiResponse<{ reportId: string; preview: ComplianceReportPreview }>
    >(`/scan/tasks/${taskId}/report/finalize`);
    return handleApiResponse(response.data);
  },

  archiveComplianceReport: async (taskId: string): Promise<ComplianceReportPreview> => {
    const response = await apiClient.post<ApiResponse<ComplianceReportPreview>>(
      `/scan/tasks/${taskId}/report/archive`,
    );
    return handleApiResponse(response.data);
  },

  pushComplianceViolationsToRemediation: async (
    taskId: string,
    payload?: { caseIds?: string[]; note?: string },
  ): Promise<{ pushed: number; preview: ComplianceReportPreview }> => {
    const response = await apiClient.post<
      ApiResponse<{ pushed: number; preview: ComplianceReportPreview }>
    >(`/scan/tasks/${taskId}/push-remediation`, payload ?? {});
    return handleApiResponse(response.data);
  },

  pushTechnicalFindingsToRemediation: async (
    taskId: string,
    payload?: { findingIds?: string[]; note?: string },
  ): Promise<{ pushed: number; remediationIds: string[] }> => {
    const response = await apiClient.post<
      ApiResponse<{ pushed: number; remediationIds: string[] }>
    >(`/scan/tasks/${taskId}/push-remediation`, payload ?? {});
    return handleApiResponse(response.data);
  },
};
