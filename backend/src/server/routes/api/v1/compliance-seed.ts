import seedData from './compliance-seed-data.json';
import templateSeedData from './compliance-task-templates-seed.json';

export type ComplianceSeedTurn = {
  role: string;
  content: string;
};

export type ComplianceSeedSample = {
  caseCode: string;
  name: string;
  attackType: string;
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  regClause: string;
  turns?: ComplianceSeedTurn[];
  fileName?: string;
  fileContent?: string;
  userQuery?: string;
};

export function buildComplianceSampleMetadata(
  sample: ComplianceSeedSample,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    seeded: true,
    regClause: sample.regClause,
  };
  if (sample.turns?.length) {
    metadata.turns = sample.turns;
  }
  if (sample.fileName) {
    metadata.fileName = sample.fileName;
  }
  if (sample.fileContent) {
    metadata.fileContent = sample.fileContent;
  }
  if (sample.userQuery) {
    metadata.userQuery = sample.userQuery;
  }
  return metadata;
}

export type ComplianceSeedLibrary = {
  key: string;
  title: string;
  domain: string;
  description: string;
  defaultLevel: 'critical' | 'high' | 'medium' | 'low';
  detectMethod: string;
  standards: string[];
  enabled: boolean;
  icon: string;
  tag: string;
  basis: string;
  scope: string;
  category: string;
  samples: ComplianceSeedSample[];
};

export type ComplianceSeedMapping = {
  mappingKey: string;
  law: string;
  article: string;
  rule: string;
  sourceText: string;
  caseIds: string[];
  libraryKey: string | null;
  policyId: string | null;
  riskType: string;
  status: string;
};

export const complianceSeedLibraries = seedData.libraries as ComplianceSeedLibrary[];
export const complianceSeedMappings = seedData.mappings as ComplianceSeedMapping[];

export type ComplianceTemplateSeed = {
  templateKey: string;
  name: string;
  domain: string;
  scope: string;
  description: string;
  libraryKeys: string[];
  sampleTypes: string[];
  assessScenario: string;
  creationMode: string;
  icon: string;
  tags: string[];
  ownerName: string;
};

export const complianceTemplateSeeds = templateSeedData.templates as ComplianceTemplateSeed[];
