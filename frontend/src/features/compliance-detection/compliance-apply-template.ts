import type { CreationMode, ComplianceDomain } from './compliance-precheck';
import type { AssessScenario } from './compliance-wizard-ui';
import type { ComplianceAssessScenario, ComplianceTaskTemplate, SecurityCaseLibrary } from '@/types/entities';

export type WizardTemplateState = {
  templateId: string;
  templateName: string;
  domainOverride: ComplianceDomain;
  taskDesc: string;
  creationMode: CreationMode;
  assessScenario: AssessScenario;
  selectedLibIds: string[];
};

function mapTemplateScenarioToWizard(value: string): AssessScenario {
  if (value === 'periodic' || value === 'patrol') {
    return 'patrol';
  }
  if (value === 'change' || value === 'regression') {
    return 'regression';
  }
  return 'launch';
}

export function mapWizardScenarioToTemplate(value: AssessScenario): ComplianceAssessScenario {
  if (value === 'patrol') {
    return 'periodic';
  }
  if (value === 'regression') {
    return 'change';
  }
  return 'launch';
}

export function resolveLibraryIds(
  libraries: SecurityCaseLibrary[],
  libraryKeys: string[],
): string[] {
  const keyToId = new Map(libraries.map((lib) => [lib.libraryKey, lib.id]));
  return libraryKeys.map((key) => keyToId.get(key)).filter((id): id is string => Boolean(id));
}

export function buildWizardStateFromTemplate(
  template: ComplianceTaskTemplate,
  libraries: SecurityCaseLibrary[],
): WizardTemplateState {
  const selectedLibIds =
    template.libraries?.map((lib) => lib.id).filter(Boolean) ||
    resolveLibraryIds(libraries, template.libraryKeys);

  return {
    templateId: template.id,
    templateName: template.name,
    domainOverride: template.domain as ComplianceDomain,
    taskDesc: template.scope || template.description || '',
    creationMode: template.creationMode === 'ai' ? 'ai' : 'manual',
    assessScenario: mapTemplateScenarioToWizard(template.assessScenario || 'launch'),
    selectedLibIds,
  };
}
