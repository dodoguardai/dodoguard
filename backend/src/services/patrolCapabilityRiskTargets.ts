type UnknownRecord = Record<string, unknown>;

export type CapabilityRiskTargetSelector = {
  riskIds: string[];
  registryIds: string[];
  assetComponentIds: string[];
  keyKinds: Array<{ key: string; kind?: string }>;
};

function readRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function add(set: Set<string>, value: unknown) {
  const text = readString(value);
  if (text) {
    set.add(text);
  }
}

export function normalizeCapabilityComponentKind(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) {
    return undefined;
  }
  return text === 'knowledge_base' ? 'knowledge' : text;
}

function addKeyKind(
  keyKinds: Map<string, { key: string; kind?: string }>,
  key: unknown,
  kind: unknown,
) {
  const normalizedKey = readString(key);
  if (!normalizedKey) {
    return;
  }
  const normalizedKind = normalizeCapabilityComponentKind(kind);
  keyKinds.set(`${normalizedKind || '*'}:${normalizedKey}`, {
    key: normalizedKey,
    kind: normalizedKind,
  });
}

export function collectCapabilityRiskTargetSelectors(
  plans: Array<UnknownRecord>,
  assetComponents: Array<UnknownRecord> = [],
): CapabilityRiskTargetSelector {
  const riskIds = new Set<string>();
  const registryIds = new Set<string>();
  const assetComponentIds = new Set<string>();
  const keyKinds = new Map<string, { key: string; kind?: string }>();

  const targets = plans.flatMap((plan) =>
    Array.isArray(plan.targets) ? (plan.targets as unknown[]) : [],
  );

  for (const targetValue of targets) {
    const target = readRecord(targetValue);
    const kind = normalizeCapabilityComponentKind(target.kind);
    if (!kind || kind === 'agent') {
      continue;
    }

    add(riskIds, target.riskId);
    add(riskIds, target.capabilityRiskId);
    add(riskIds, target.riskLibraryId);
    add(registryIds, target.registryId);
    add(registryIds, target.capabilityRegistryId);
    add(assetComponentIds, target.assetComponentId);
    add(assetComponentIds, target.componentId);
    add(assetComponentIds, target.id);
    addKeyKind(keyKinds, target.key || target.componentKey, kind);

    if (target.sourceType === 'capability_component') {
      add(registryIds, target.sourceRefId);
    }
    if (target.sourceType === 'risk_library') {
      add(riskIds, target.sourceRefId);
    }
  }

  for (const component of assetComponents) {
    const kind = normalizeCapabilityComponentKind(component.componentType || component.kind);
    addKeyKind(keyKinds, component.componentKey || component.key, kind);
    const snapshot = readRecord(component.configSnapshot);
    add(riskIds, snapshot.riskLibraryId);
    add(registryIds, snapshot.registryId);

    if (component.sourceType === 'capability_component') {
      add(registryIds, component.sourceRefId);
    }
    if (component.sourceType === 'risk_library') {
      add(riskIds, component.sourceRefId);
    }
  }

  return {
    riskIds: [...riskIds],
    registryIds: [...registryIds],
    assetComponentIds: [...assetComponentIds],
    keyKinds: [...keyKinds.values()],
  };
}

export function capabilityRiskMatchesSelector(
  risk: UnknownRecord,
  selector: CapabilityRiskTargetSelector,
): boolean {
  const riskId = readString(risk.id);
  const registryId = readString(risk.registryId);
  if (riskId && selector.riskIds.includes(riskId)) {
    return true;
  }
  if (registryId && selector.registryIds.includes(registryId)) {
    return true;
  }

  const riskKey = readString(risk.componentKey);
  const riskKind = normalizeCapabilityComponentKind(risk.componentKind);
  if (!riskKey) {
    return false;
  }
  return selector.keyKinds.some(
    (item) => item.key === riskKey && (!item.kind || !riskKind || item.kind === riskKind),
  );
}
