export type VulnerabilityType =
  | 'agent'
  | 'mcp'
  | 'llm'
  | 'tool'
  | 'platform'
  | 'dify'
  | 'coze'
  | 'fastgpt';

export interface VulnerabilityRecord {
  id: string;
  type: VulnerabilityType | string;
  category: string | null;
  riskLevel: string;
}

export interface VulnerabilityContext {
  userId?: string;
}

export interface CreateVulnerabilityInput {
  avdId?: string;
  name: string;
  type: VulnerabilityType;
  category: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  status?: 'discovered' | 'confirmed' | 'patched' | 'archived';
  disclosedAt?: string;
  description: string;
  affectedTargets?: Array<{
    type: string;
    versions?: string[];
  }>;
  impactScope: string;
  cweId?: string;
  mitreId?: string;
  owaspId?: string;
  owaspLlmTop10Mapping?: Record<string, unknown>;
  exploitability?: Record<string, unknown>;
  patchStatus?: Record<string, unknown>;
  auditNotes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateVulnerabilityInput {
  name?: string;
  category?: string;
  riskLevel?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'discovered' | 'confirmed' | 'patched' | 'archived';
  description?: string;
  affectedTargets?: Array<{
    type: string;
    versions?: string[];
  }>;
  impactScope?: string;
  cweId?: string;
  mitreId?: string;
  owaspId?: string;
  owaspLlmTop10Mapping?: Record<string, unknown>;
  exploitability?: Record<string, unknown>;
  patchStatus?: Record<string, unknown>;
  auditNotes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedCreatePayload {
  insertValues: Record<string, unknown>;
}

export interface NormalizedUpdatePayload {
  updateValues: Record<string, unknown>;
}

export interface VulnerabilityTypeStrategy {
  normalizeCreate(
    input: CreateVulnerabilityInput,
    context: VulnerabilityContext,
  ): NormalizedCreatePayload;
  normalizeUpdate(
    existing: VulnerabilityRecord,
    updates: UpdateVulnerabilityInput,
    context: VulnerabilityContext,
  ): NormalizedUpdatePayload;
}
