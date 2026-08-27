/**
 * Managed LLM model registry (per organization).
 * providerConfig aligns with DodoGuard ProviderOptions subset (label, config, apiKeyEnvVar, etc.).
 */

import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, getDbType } from '../database';
import logger from '../logger';
import { sanitizeObject } from '../util/sanitizer';
import { systemConfigService, type IntegrationConfig } from './systemConfigService';

function getManagedLlmModelsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../database/tables-mysql').managedLlmModelsTable;
  }
  return require('../database/tables-enterprise').managedLlmModelsTable;
}

export type ManagedModelHealthStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';
export type ManagedModelStatus = 'active' | 'inactive';

export interface ManagedModelDto {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  modelKey: string;
  status: ManagedModelStatus;
  healthStatus: ManagedModelHealthStatus;
  quotaMonthly: number;
  quotaUsed: number;
  createdAt: string;
  updatedAt: string;
  providerConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date(value as number).toISOString();
}

function mapRowToDto(row: Record<string, unknown>, sanitizeForClient: boolean): ManagedModelDto {
  const rawPc = row.providerConfig;
  const rawMeta = row.metadata;
  let providerConfig: Record<string, unknown> | undefined;
  let metadata: Record<string, unknown> | undefined;

  if (rawPc !== null && rawPc !== undefined && typeof rawPc === 'object') {
    providerConfig = sanitizeForClient
      ? (sanitizeObject(rawPc, { context: 'managed-model providerConfig' }) as Record<
          string,
          unknown
        >)
      : (rawPc as Record<string, unknown>);
  }
  if (rawMeta !== null && rawMeta !== undefined && typeof rawMeta === 'object') {
    metadata = sanitizeForClient
      ? (sanitizeObject(rawMeta, { context: 'managed-model metadata' }) as Record<string, unknown>)
      : (rawMeta as Record<string, unknown>);
  }

  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    provider: String(row.provider),
    modelKey: String(row.modelKey),
    status: row.status as ManagedModelStatus,
    healthStatus: row.healthStatus as ManagedModelHealthStatus,
    quotaMonthly: Number(row.quotaMonthly),
    quotaUsed: Number(row.quotaUsed),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(providerConfig !== undefined ? { providerConfig } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function isRedactedSecret(value: unknown): boolean {
  return typeof value === 'string' && value === '[REDACTED]';
}

function mergeProviderConfigPatch(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const existingConfig =
    existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
      ? (existing.config as Record<string, unknown>)
      : {};
  const incomingConfig =
    incoming.config && typeof incoming.config === 'object' && !Array.isArray(incoming.config)
      ? (incoming.config as Record<string, unknown>)
      : {};

  const mergedConfig = {
    ...existingConfig,
    ...incomingConfig,
  };

  if (isRedactedSecret(incomingConfig.apiKey)) {
    if (existingConfig.apiKey !== undefined) {
      mergedConfig.apiKey = existingConfig.apiKey;
    } else {
      delete mergedConfig.apiKey;
    }
  }

  const merged: Record<string, unknown> = {
    ...(existing ?? {}),
    ...incoming,
    config: mergedConfig,
  };

  if (isRedactedSecret(incoming.apiKey)) {
    if (existing?.apiKey !== undefined) {
      merged.apiKey = existing.apiKey;
    } else {
      delete merged.apiKey;
    }
  }

  return merged;
}

function looksLikeFullProviderId(s: string): boolean {
  const parts = s.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function extractChatModelSuffix(selectedModelValue: string): string {
  const trimmed = selectedModelValue.trim();
  if (!looksLikeFullProviderId(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts[1]?.toLowerCase() !== 'chat') {
    return trimmed;
  }
  return parts.slice(2).join(':').trim() || trimmed;
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function modelValueMatchesManagedModel(value: unknown, model: ManagedModelDto): boolean {
  const raw =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && !Array.isArray(value)
        ? ((value as { id?: unknown; value?: unknown }).id ??
          (value as { id?: unknown; value?: unknown }).value)
        : undefined;

  if (typeof raw !== 'string') {
    return false;
  }

  const bare = extractChatModelSuffix(raw);
  return (
    raw === model.name ||
    raw === model.modelKey ||
    bare === model.name ||
    bare === model.modelKey ||
    slugFromName(bare) === model.modelKey
  );
}

function integrationNameMatchesManagedModel(
  integration: IntegrationConfig,
  model: ManagedModelDto,
): boolean {
  const bare = extractChatModelSuffix(integration.name);
  return (
    integration.name === model.name ||
    integration.name === model.modelKey ||
    bare === model.name ||
    bare === model.modelKey ||
    slugFromName(bare) === model.modelKey
  );
}

export interface CreateManagedModelData {
  organizationId: string;
  name: string;
  provider: string;
  modelKey: string;
  status?: ManagedModelStatus;
  healthStatus?: ManagedModelHealthStatus;
  quotaMonthly?: number;
  providerConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateManagedModelData {
  name?: string;
  provider?: string;
  modelKey?: string;
  status?: ManagedModelStatus;
  quotaMonthly?: number;
  quotaUsed?: number;
  healthStatus?: ManagedModelHealthStatus;
  providerConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export class ManagedModelService {
  private async suppressMigratedIntegrationModel(model: ManagedModelDto): Promise<void> {
    const integrationId = model.metadata?.migratedFromIntegrationId;
    if (typeof integrationId !== 'string' || !integrationId.trim()) {
      return;
    }

    const integrations = await systemConfigService.getIntegrations('llm');
    const integration = integrations.find((item) => item.id === integrationId);
    if (!integration) {
      return;
    }

    const nextConfig = { ...(integration.config ?? {}) };
    let changed = false;

    if (Array.isArray(nextConfig.models)) {
      const nextModels = nextConfig.models.filter(
        (value: unknown) => !modelValueMatchesManagedModel(value, model),
      );
      if (nextModels.length !== nextConfig.models.length) {
        nextConfig.models = nextModels;
        changed = true;
      }
    }

    if (modelValueMatchesManagedModel(nextConfig.model, model)) {
      delete nextConfig.model;
      changed = true;
    }

    if (!changed && integrationNameMatchesManagedModel(integration, model)) {
      changed = true;
    }

    if (!changed) {
      return;
    }

    const hasRemainingModels =
      (Array.isArray(nextConfig.models) && nextConfig.models.length > 0) ||
      (typeof nextConfig.model === 'string' && nextConfig.model.trim().length > 0);

    await systemConfigService.updateIntegration(integration.id, {
      config: nextConfig,
      enabled: hasRemainingModels ? integration.enabled : false,
    });
  }

  async listByOrganization(
    organizationId: string,
    sanitizeForClient = true,
  ): Promise<ManagedModelDto[]> {
    const table = getManagedLlmModelsTable();
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.organizationId, organizationId))
      .orderBy(desc(table.createdAt));

    return rows.map((row) =>
      mapRowToDto(row as unknown as Record<string, unknown>, sanitizeForClient),
    );
  }

  /** Server-side listing when organization context is unavailable (e.g. judge workers). */
  async listAll(sanitizeForClient = true): Promise<ManagedModelDto[]> {
    const table = getManagedLlmModelsTable();
    const rows = await db.select().from(table).orderBy(desc(table.createdAt));
    return rows.map((row) =>
      mapRowToDto(row as unknown as Record<string, unknown>, sanitizeForClient),
    );
  }

  async getById(
    id: string,
    organizationId: string,
    sanitizeForClient = true,
  ): Promise<ManagedModelDto | null> {
    const table = getManagedLlmModelsTable();
    const [row] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);

    if (!row) {
      return null;
    }
    return mapRowToDto(row as unknown as Record<string, unknown>, sanitizeForClient);
  }

  async create(data: CreateManagedModelData): Promise<ManagedModelDto> {
    const table = getManagedLlmModelsTable();
    const dbType = getDbType();
    const now = new Date();

    const baseValues = {
      organizationId: data.organizationId,
      name: data.name,
      provider: data.provider,
      modelKey: data.modelKey,
      status: data.status ?? 'active',
      healthStatus: data.healthStatus ?? ('unknown' as const),
      quotaMonthly: data.quotaMonthly ?? 100000,
      quotaUsed: 0,
      providerConfig: data.providerConfig ?? null,
      metadata: data.metadata ?? null,
      updatedAt: now,
    };

    if (dbType === 'mysql') {
      const id = uuidv4();
      await db.insert(table).values({
        ...baseValues,
        id,
        createdAt: now,
      } as any);
      const fresh = await this.getById(id, data.organizationId, true);
      if (!fresh) {
        throw new Error('Failed to load model after create');
      }
      logger.info(`Managed LLM model created: ${fresh.name} (${fresh.id})`);
      return fresh;
    }

    const [inserted] = await db
      .insert(table)
      .values({
        ...baseValues,
        createdAt: now,
      } as any)
      .returning();

    const dto = mapRowToDto(inserted as unknown as Record<string, unknown>, true);
    logger.info(`Managed LLM model created: ${dto.name} (${dto.id})`);
    return dto;
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdateManagedModelData,
  ): Promise<ManagedModelDto | null> {
    const table = getManagedLlmModelsTable();
    const dbType = getDbType();
    const now = new Date();

    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) {
      patch.name = data.name;
    }
    if (data.provider !== undefined) {
      patch.provider = data.provider;
    }
    if (data.modelKey !== undefined) {
      patch.modelKey = data.modelKey;
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }
    if (data.quotaMonthly !== undefined) {
      patch.quotaMonthly = data.quotaMonthly;
    }
    if (data.quotaUsed !== undefined) {
      patch.quotaUsed = data.quotaUsed;
    }
    if (data.healthStatus !== undefined) {
      patch.healthStatus = data.healthStatus;
    }
    if (data.providerConfig !== undefined) {
      if (data.providerConfig === null) {
        patch.providerConfig = null;
      } else {
        const existing = await this.getById(id, organizationId, false);
        patch.providerConfig = mergeProviderConfigPatch(
          existing?.providerConfig,
          data.providerConfig,
        );
      }
    }
    if (data.metadata !== undefined) {
      patch.metadata = data.metadata;
    }

    if (dbType === 'mysql') {
      await db
        .update(table)
        .set(patch as any)
        .where(and(eq(table.id, id), eq(table.organizationId, organizationId)));
      return this.getById(id, organizationId, true);
    }

    const [updated] = await db
      .update(table)
      .set(patch as any)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .returning();

    if (!updated) {
      return null;
    }
    return mapRowToDto(updated as unknown as Record<string, unknown>, true);
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const table = getManagedLlmModelsTable();
    const existing = await this.getById(id, organizationId, false);
    if (!existing) {
      return false;
    }

    await this.suppressMigratedIntegrationModel(existing);
    await db.delete(table).where(and(eq(table.id, id), eq(table.organizationId, organizationId)));
    logger.info(`Managed LLM model deleted: ${id}`);
    return true;
  }
}

export const managedModelService = new ManagedModelService();
