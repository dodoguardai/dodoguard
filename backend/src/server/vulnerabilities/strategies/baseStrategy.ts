import {
  CreateVulnerabilityInput,
  NormalizedCreatePayload,
  NormalizedUpdatePayload,
  UpdateVulnerabilityInput,
  VulnerabilityContext,
  VulnerabilityRecord,
  VulnerabilityTypeStrategy,
} from '../types';

export class BaseVulnerabilityStrategy implements VulnerabilityTypeStrategy {
  normalizeCreate(
    input: CreateVulnerabilityInput,
    context: VulnerabilityContext,
  ): NormalizedCreatePayload {
    const avdId =
      input.avdId ||
      `AVD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    const insertValues: Record<string, unknown> = {
      name: input.name,
      type: input.type,
      avdId,
      category: input.category,
      riskLevel: input.riskLevel,
      status: input.status || 'discovered',
      description: input.description || null,
      affectedTargets: JSON.stringify(input.affectedTargets ?? []),
      impactScope: input.impactScope || null,
      tags: JSON.stringify(input.tags ?? []),
      disclosedAt: input.disclosedAt ? new Date(input.disclosedAt) : null,
      cweId: input.cweId || null,
      mitreId: input.mitreId || null,
      owaspId: input.owaspId || null,
      owaspLlmTop10Mapping: input.owaspLlmTop10Mapping
        ? JSON.stringify(input.owaspLlmTop10Mapping)
        : null,
      exploitability: input.exploitability ? JSON.stringify(input.exploitability) : null,
      patchStatus: input.patchStatus ? JSON.stringify(input.patchStatus) : null,
      auditNotes: input.auditNotes || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdBy: context.userId || null,
      updatedBy: context.userId || null,
    };

    const now = new Date();
    insertValues.createdAt = now;
    insertValues.updatedAt = now;

    return { insertValues };
  }

  normalizeUpdate(
    _existing: VulnerabilityRecord,
    updates: UpdateVulnerabilityInput,
    context: VulnerabilityContext,
  ): NormalizedUpdatePayload {
    const updateValues: Record<string, unknown> = {};

    if (updates.name !== undefined) { updateValues.name = updates.name; }
    if (updates.category !== undefined) { updateValues.category = updates.category; }
    if (updates.riskLevel !== undefined) { updateValues.riskLevel = updates.riskLevel; }
    if (updates.status !== undefined) { updateValues.status = updates.status; }
    if (updates.description !== undefined) { updateValues.description = updates.description; }
    if (updates.impactScope !== undefined) { updateValues.impactScope = updates.impactScope; }
    if (updates.auditNotes !== undefined) { updateValues.auditNotes = updates.auditNotes; }

    if (updates.affectedTargets !== undefined) {
      updateValues.affectedTargets = JSON.stringify(updates.affectedTargets ?? []);
    }
    if (updates.tags !== undefined) {
      updateValues.tags = JSON.stringify(updates.tags ?? []);
    }
    if (updates.cweId !== undefined) { updateValues.cweId = updates.cweId || null; }
    if (updates.mitreId !== undefined) { updateValues.mitreId = updates.mitreId || null; }
    if (updates.owaspId !== undefined) { updateValues.owaspId = updates.owaspId || null; }
    if (updates.owaspLlmTop10Mapping !== undefined) {
      updateValues.owaspLlmTop10Mapping = updates.owaspLlmTop10Mapping
        ? JSON.stringify(updates.owaspLlmTop10Mapping)
        : null;
    }
    if (updates.exploitability !== undefined) {
      updateValues.exploitability = updates.exploitability
        ? JSON.stringify(updates.exploitability)
        : null;
    }
    if (updates.patchStatus !== undefined) {
      updateValues.patchStatus = updates.patchStatus ? JSON.stringify(updates.patchStatus) : null;
    }
    if (updates.metadata !== undefined) {
      updateValues.metadata = updates.metadata ? JSON.stringify(updates.metadata) : null;
    }

    if (context.userId) {
      updateValues.updatedBy = context.userId;
    }

    return { updateValues };
  }
}
