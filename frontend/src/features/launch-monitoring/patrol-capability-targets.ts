import type { AgentAssetComponent } from '@/types/entities';

function capabilityKindFromAssetComponent(kind: string): string {
  return kind === 'knowledge_base' ? 'knowledge' : kind;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildPatrolCapabilityTargets(
  components: AgentAssetComponent[] | undefined,
  selectedComponentIds?: string[],
) {
  const selected = new Set(selectedComponentIds || []);
  const allComponents =
    components?.map((component) => {
      const snapshot = component.configSnapshot || {};
      const riskLibraryId = readString(snapshot.riskLibraryId);
      const registryId =
        readString(snapshot.registryId) ||
        (component.sourceType === 'capability_component'
          ? readString(component.sourceRefId)
          : undefined);

      return {
        kind: capabilityKindFromAssetComponent(component.componentType),
        id: component.id,
        assetComponentId: component.id,
        name: component.componentName,
        key: component.componentKey || undefined,
        version: component.version || undefined,
        sourceType: component.sourceType || undefined,
        sourceRefId: component.sourceRefId || undefined,
        registryId,
        riskId:
          riskLibraryId ||
          (component.sourceType === 'risk_library' ? readString(component.sourceRefId) : undefined),
        riskLevel: readString(snapshot.riskLevel) || (component.highRisk ? 'high' : undefined),
        riskTitle: readString(snapshot.riskTitle),
        highRisk: component.highRisk,
      };
    }) || [];

  return Array.isArray(selectedComponentIds)
    ? allComponents.filter((component) => selected.has(component.id))
    : allComponents;
}
