/**
 * System Configuration Service
 * Manages system-wide settings, feature flags, and integrations
 */

import { db, getDbType } from '../database';
import {
  systemConfigsTable,
  featureFlagsTable,
  notificationConfigsTable,
  securityPoliciesTable,
} from '../database/tables-enterprise';
import { eq, sql } from 'drizzle-orm';
import logger from '../logger';
import { randomUUID } from 'crypto';

// Import integrationConfigsTable based on database type
function getIntegrationConfigsTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.integrationConfigsTable;
  } else {
    // For postgres/sqlite, use enterprise tables (if they exist)
    // For now, we'll throw an error if not MySQL
    throw new Error(`Integration configs table not yet implemented for ${dbType}`);
  }
}

export interface SystemConfigValue {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  description?: string;
  editable: boolean;
  requiresRestart: boolean;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  affects: string[];
}

export interface IntegrationConfig {
  id: string;
  type: 'llm' | 'vector_db' | 'payment' | 'sso' | 'webhook' | 'email' | 'sms';
  name: string;
  provider: string;
  config: Record<string, any>;
  enabled: boolean;
  testStatus: 'pending' | 'success' | 'failed';
  lastTested?: Date;
  updatedAt?: Date;
}

export class SystemConfigService {
  // In-memory cache for frequently accessed configs
  private configCache = new Map<string, any>();
  private featureFlagCache = new Map<string, boolean>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * MySQL rejects ISO datetime strings with `T`/`Z` for TIMESTAMP/DATETIME (ER_TRUNCATED_WRONG_VALUE).
   * Use DB-side CURRENT_TIMESTAMP for writes on MySQL; keep Date elsewhere.
   */
  private updatedAtForWrite(): Date | ReturnType<typeof sql> {
    return getDbType() === 'mysql' ? sql`CURRENT_TIMESTAMP` : new Date();
  }

  /**
   * Get system configuration value
   */
  async getConfig(key: string): Promise<any> {
    try {
      // Check cache first
      if (this.isCacheValid(key)) {
        return this.configCache.get(key);
      }

      const [config] = await db
        .select()
        .from(systemConfigsTable)
        .where(eq(systemConfigsTable.key, key))
        .limit(1);

      if (!config) {
        return null;
      }

      const value = this.parseConfigValue(config.value, config.type);
      this.setCache(key, value);

      return value;
    } catch (error) {
      logger.error(`Get config error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set system configuration value
   */
  async setConfig(key: string, value: any, updatedBy?: string): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);

      await db
        .insert(systemConfigsTable)
        .values({
          key,
          value: stringValue,
          type: this.inferValueType(value),
          updatedBy,
          updatedAt: this.updatedAtForWrite(),
        })
        .onConflictDoUpdate({
          target: systemConfigsTable.key,
          set: {
            value: stringValue,
            type: this.inferValueType(value),
            updatedBy,
            updatedAt: this.updatedAtForWrite(),
          },
        });

      // Clear cache
      this.configCache.delete(key);
      this.cacheExpiry.delete(key);

      logger.info(`System config updated: ${key} = ${stringValue}`);
    } catch (error) {
      logger.error(`Set config error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all system configurations
   */
  async getAllConfigs(category?: string): Promise<SystemConfigValue[]> {
    try {
      let query = db.select().from(systemConfigsTable);

      if (category) {
        query = query.where(eq(systemConfigsTable.category, category));
      }

      const configs = await query.orderBy(systemConfigsTable.category, systemConfigsTable.key);

      return configs.map((config) => ({
        key: config.key,
        value: this.parseConfigValue(config.value, config.type),
        type: config.type,
        description: config.description,
        editable: config.editable,
        requiresRestart: config.requiresRestart,
      }));
    } catch (error) {
      logger.error('Get all configs error:', error);
      throw error;
    }
  }

  /**
   * Update system configuration (upsert: creates row when missing).
   * Previously this path only ran UPDATE, so new keys (e.g. agent_mode_config before migration)
   * matched zero rows but the API still returned success.
   */
  async updateConfig(
    key: string,
    updates: Partial<
      Pick<SystemConfigValue, 'value' | 'description' | 'editable' | 'requiresRestart'>
    >,
    updatedBy?: string,
  ): Promise<void> {
    try {
      const [existing] = await db
        .select({ key: systemConfigsTable.key })
        .from(systemConfigsTable)
        .where(eq(systemConfigsTable.key, key))
        .limit(1);

      const updateData: Record<string, unknown> = {
        updatedAt: this.updatedAtForWrite(),
      };

      if (updates.value !== undefined) {
        updateData.value = JSON.stringify(updates.value);
        updateData.type = this.inferValueType(updates.value);
      }

      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }

      if (updates.editable !== undefined) {
        updateData.editable = updates.editable;
      }

      if (updates.requiresRestart !== undefined) {
        updateData.requiresRestart = updates.requiresRestart;
      }

      if (updatedBy) {
        updateData.updatedBy = updatedBy;
      }

      if (!existing) {
        if (updates.value === undefined) {
          throw new Error(`Configuration "${key}" does not exist; send a value to create it`);
        }

        const dbType = getDbType();
        if (dbType === 'mysql') {
          const mysqlTables = require('../database/tables-mysql');
          const table = mysqlTables.systemConfigsTable;
          await db.insert(table).values({
            id: randomUUID(),
            category: this.inferCategoryForKey(key),
            key,
            value: updates.value,
            type: this.inferValueType(updates.value),
            description: updates.description ?? null,
            editable: updates.editable ?? true,
            requiresRestart: updates.requiresRestart ?? false,
            updatedBy: updatedBy ?? null,
            updatedAt: this.updatedAtForWrite(),
          });
        } else {
          await db.insert(systemConfigsTable).values({
            key,
            value: JSON.stringify(updates.value),
            type: this.inferValueType(updates.value),
            description: updates.description,
            editable: updates.editable ?? true,
            requiresRestart: updates.requiresRestart ?? false,
            updatedBy,
            updatedAt: this.updatedAtForWrite(),
          });
        }

        this.configCache.delete(key);
        this.cacheExpiry.delete(key);
        logger.info(`System config created: ${key}`);
        return;
      }

      await db.update(systemConfigsTable).set(updateData).where(eq(systemConfigsTable.key, key));

      this.configCache.delete(key);
      this.cacheExpiry.delete(key);

      logger.info(`System config updated: ${key}`);
    } catch (error) {
      logger.error(`Update config error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get feature flag
   */
  async getFeatureFlag(name: string): Promise<boolean> {
    try {
      // Check cache first
      if (this.featureFlagCache.has(name) && this.isCacheValid(`flag_${name}`)) {
        return this.featureFlagCache.get(name)!;
      }

      const [flag] = await db
        .select()
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.name, name))
        .limit(1);

      const enabled = flag?.enabled ?? false;
      this.featureFlagCache.set(name, enabled);
      this.setCache(`flag_${name}`, enabled);

      return enabled;
    } catch (error) {
      logger.error(`Get feature flag error for ${name}:`, error);
      return false; // Default to disabled on error
    }
  }

  /**
   * Set feature flag
   */
  async setFeatureFlag(name: string, enabled: boolean, updatedBy?: string): Promise<void> {
    try {
      await db
        .insert(featureFlagsTable)
        .values({
          name,
          enabled,
          updatedBy,
          updatedAt: this.updatedAtForWrite(),
        })
        .onConflictDoUpdate({
          target: featureFlagsTable.name,
          set: {
            enabled,
            updatedBy,
            updatedAt: this.updatedAtForWrite(),
          },
        });

      // Clear cache
      this.featureFlagCache.delete(name);
      this.cacheExpiry.delete(`flag_${name}`);

      logger.info(`Feature flag updated: ${name} = ${enabled}`);
    } catch (error) {
      logger.error(`Set feature flag error for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get all feature flags
   */
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      const flags = await db.select().from(featureFlagsTable).orderBy(featureFlagsTable.name);

      return flags.map((flag) => ({
        name: flag.name,
        enabled: flag.enabled,
        description: flag.description,
        affects: flag.affects as string[],
      }));
    } catch (error) {
      logger.error('Get all feature flags error:', error);
      throw error;
    }
  }

  /**
   * Get integrations
   */
  async getIntegrations(type?: string): Promise<IntegrationConfig[]> {
    try {
      const integrationConfigsTable = getIntegrationConfigsTable();
      let query = db.select().from(integrationConfigsTable);

      if (type) {
        query = query.where(eq(integrationConfigsTable.type, type));
      }

      const integrations = await query.orderBy(
        integrationConfigsTable.type,
        integrationConfigsTable.name,
      );

      logger.debug(`Retrieved ${integrations.length} integrations from database`, {
        count: integrations.length,
        types: integrations.map((i) => i.type),
        ids: integrations.map((i) => i.id),
      });

      const mappedIntegrations = integrations.map((integration) => ({
        id: integration.id,
        type: integration.type as any,
        name: integration.name,
        provider: integration.provider,
        config: integration.config as Record<string, any>,
        enabled: integration.enabled,
        testStatus: (integration.testStatus as 'pending' | 'success' | 'failed') || 'pending',
        lastTested: integration.lastTested ? new Date(integration.lastTested) : undefined,
      }));

      logger.debug(
        'Mapped integrations:',
        mappedIntegrations.map((i) => ({ id: i.id, type: i.type, name: i.name })),
      );

      return mappedIntegrations;
    } catch (error) {
      logger.error('Get integrations error:', error);
      throw error;
    }
  }

  /**
   * Create integration
   */
  async createIntegration(
    integration: Omit<IntegrationConfig, 'testStatus' | 'lastTested'>,
    updatedBy?: string,
  ): Promise<IntegrationConfig> {
    try {
      // Generate ID if not provided
      const id = (integration as any).id || randomUUID();

      logger.debug('Creating integration:', {
        id,
        type: integration.type,
        name: integration.name,
        provider: integration.provider,
        hasConfig: !!integration.config,
        configKeys: integration.config ? Object.keys(integration.config) : [],
      });

      // Prepare values for insertion, ensuring all fields have proper values
      const insertValues: any = {
        id,
        type: integration.type,
        name: integration.name,
        enabled: integration.enabled ?? true,
        testStatus: 'pending',
      };

      // Only include optional fields if they have values
      if (integration.provider) {
        insertValues.provider = integration.provider;
      }

      // Config must be an object or null, not undefined
      if (integration.config !== undefined && integration.config !== null) {
        insertValues.config = integration.config;
      } else {
        insertValues.config = null;
      }

      // Only include updatedBy if provided
      if (updatedBy) {
        insertValues.updatedBy = updatedBy;
      }

      logger.debug('Insert values:', {
        ...insertValues,
        config: insertValues.config
          ? JSON.stringify(insertValues.config).substring(0, 100)
          : 'null',
      });

      const integrationConfigsTable = getIntegrationConfigsTable();

      // MySQL doesn't support .returning(), so we need to insert and then select
      try {
        await db.insert(integrationConfigsTable).values(insertValues);
        logger.info('Integration inserted successfully');
      } catch (insertError: any) {
        logger.error('Database insert error:', insertError);
        logger.error('Insert error details:', {
          message: insertError?.message,
          code: insertError?.code,
          sql: insertError?.sql,
          sqlMessage: insertError?.sqlMessage,
        });
        throw insertError;
      }

      // Fetch the created integration
      const [newIntegration] = await db
        .select()
        .from(integrationConfigsTable)
        .where(eq(integrationConfigsTable.id, id))
        .limit(1);

      if (!newIntegration) {
        throw new Error('Integration was created but could not be retrieved');
      }

      logger.info(`Integration created: ${integration.name} (${integration.type}) with ID: ${id}`);

      // Helper function to safely convert to ISO string
      const _toISOString = (value: any): string | undefined => {
        if (!value) { return undefined; }
        if (value instanceof Date) { return value.toISOString(); }
        if (typeof value === 'string') {
          const date = new Date(value);
          if (!isNaN(date.getTime())) { return date.toISOString(); }
          return value;
        }
        return undefined;
      };

      const created: IntegrationConfig = {
        id: newIntegration.id,
        type: newIntegration.type as any,
        name: newIntegration.name,
        provider: newIntegration.provider || '',
        config: newIntegration.config as Record<string, any>,
        enabled: newIntegration.enabled ?? true,
        testStatus: (newIntegration.testStatus as 'pending' | 'success' | 'failed') || 'pending',
        lastTested: newIntegration.lastTested ?? new Date(),
        updatedAt: newIntegration.updatedAt ?? new Date(),
      };

      logger.debug('Created integration result', { body: created });
      return created;
    } catch (error) {
      logger.error('Create integration error:', error);
      if (error instanceof Error) {
        logger.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      } else {
        logger.error('Error object', { error });
      }
      throw error;
    }
  }

  /**
   * Update integration
   */
  async updateIntegration(
    id: string,
    updates: Partial<IntegrationConfig>,
    updatedBy?: string,
  ): Promise<IntegrationConfig> {
    try {
      const integrationConfigsTable = getIntegrationConfigsTable();
      const updateData: any = {
        updatedAt: this.updatedAtForWrite(),
      };

      if (updates.name !== undefined) { updateData.name = updates.name; }
      if (updates.provider !== undefined) { updateData.provider = updates.provider; }
      if (updates.config !== undefined) { updateData.config = updates.config; }
      if (updates.enabled !== undefined) { updateData.enabled = updates.enabled; }
      if (updates.testStatus !== undefined) { updateData.testStatus = updates.testStatus; }
      if (updates.lastTested !== undefined) {
        // For MySQL timestamp fields, Drizzle ORM expects Date objects, not strings
        if (updates.lastTested instanceof Date) {
          updateData.lastTested = updates.lastTested;
        } else if (typeof updates.lastTested === 'string') {
          // Try to parse string to Date
          const date = new Date(updates.lastTested);
          if (!isNaN(date.getTime())) {
            updateData.lastTested = date;
          }
        }
      }

      if (updatedBy) { updateData.updatedBy = updatedBy; }

      await db
        .update(integrationConfigsTable)
        .set(updateData)
        .where(eq(integrationConfigsTable.id, id));

      const [updated] = await db
        .select()
        .from(integrationConfigsTable)
        .where(eq(integrationConfigsTable.id, id))
        .limit(1);

      if (!updated) {
        throw new Error('Integration was updated but could not be retrieved');
      }

      logger.info(`Integration updated: ${id}`);

      return {
        id: updated.id,
        type: updated.type as IntegrationConfig['type'],
        name: updated.name,
        provider: updated.provider ?? '',
        config: (updated.config as Record<string, any>) ?? {},
        enabled: updated.enabled ?? false,
        testStatus: (updated.testStatus as 'pending' | 'success' | 'failed') ?? 'pending',
        lastTested: updated.lastTested ?? undefined,
        updatedAt: updated.updatedAt ?? undefined,
      };
    } catch (error) {
      logger.error(`Update integration error for ${id}:`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Test integration
   */
  async testIntegration(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const integrationConfigsTable = getIntegrationConfigsTable();
      const [integration] = await db
        .select()
        .from(integrationConfigsTable)
        .where(eq(integrationConfigsTable.id, id))
        .limit(1);

      if (!integration) {
        throw new Error('Integration not found');
      }

      // TODO: Implement actual integration testing based on type
      // For now, simulate testing
      const testResult = await this.performIntegrationTest(integration);

      // Update test status
      // For MySQL timestamp fields, Drizzle ORM expects Date objects, not strings
      await db
        .update(integrationConfigsTable)
        .set({
          testStatus: testResult.success ? 'success' : 'failed',
          lastTested: new Date(),
        })
        .where(eq(integrationConfigsTable.id, id));

      return testResult;
    } catch (error) {
      logger.error(`Test integration error for ${id}:`, error);
      return { success: false, message: error instanceof Error ? error.message : 'Test failed' };
    }
  }

  /**
   * Delete integration
   */
  async deleteIntegration(id: string): Promise<void> {
    try {
      const integrationConfigsTable = getIntegrationConfigsTable();
      await db.delete(integrationConfigsTable).where(eq(integrationConfigsTable.id, id));

      logger.info(`Integration deleted: ${id}`);
    } catch (error) {
      logger.error(`Delete integration error for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get notification configs
   */
  async getNotificationConfigs(): Promise<any[]> {
    try {
      const configs = await db
        .select()
        .from(notificationConfigsTable)
        .orderBy(notificationConfigsTable.type);

      return configs.map((config) => ({
        type: config.type,
        enabled: config.enabled,
        config: config.config,
        templates: config.templates,
        rules: config.rules,
      }));
    } catch (error) {
      logger.error('Get notification configs error:', error);
      throw error;
    }
  }

  /**
   * Get security policies
   */
  async getSecurityPolicies(): Promise<any[]> {
    try {
      const policies = await db
        .select()
        .from(securityPoliciesTable)
        .orderBy(securityPoliciesTable.name);

      return policies.map((policy) => ({
        name: policy.name,
        type: policy.type,
        config: policy.config,
        enabled: policy.enabled,
      }));
    } catch (error) {
      logger.error('Get security policies error:', error);
      throw error;
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.configCache.clear();
    this.featureFlagCache.clear();
    this.cacheExpiry.clear();
    logger.info('System config cache cleared');
  }

  /**
   * Parse config value based on type
   */
  private parseConfigValue(value: any, _type: string): any {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed;
      } catch {
        return value;
      }
    }
    return value;
  }

  /** MySQL `system_configs.category` is NOT NULL — pick a sensible default per key. */
  private inferCategoryForKey(key: string): string {
    if (key === 'agent_mode_config' || key === 'capability_audit_ui_config') {
      return 'feature';
    }
    return 'global';
  }

  /**
   * Infer value type
   */
  private inferValueType(value: any): 'string' | 'number' | 'boolean' | 'json' | 'array' {
    if (typeof value === 'string') { return 'string'; }
    if (typeof value === 'number') { return 'number'; }
    if (typeof value === 'boolean') { return 'boolean'; }
    if (Array.isArray(value)) { return 'array'; }
    return 'json';
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Set cache value
   */
  private setCache(key: string, value: any): void {
    this.configCache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Perform integration test
   */
  private async performIntegrationTest(
    integration: any,
  ): Promise<{ success: boolean; message: string; input?: string; output?: string }> {
    switch (integration.type) {
      case 'llm':
        return await this.testLLMIntegration(integration);
      case 'email':
        return { success: true, message: 'Email service connected successfully' };
      case 'webhook':
        return { success: true, message: 'Webhook endpoint reachable' };
      default:
        return { success: false, message: 'Unsupported integration type for testing' };
    }
  }

  /**
   * Test LLM integration by making a simple API call
   */
  private async testLLMIntegration(
    integration: any,
  ): Promise<{ success: boolean; message: string; input?: string; output?: string }> {
    try {
      const config = integration.config || {};
      const provider = integration.provider || 'openai';
      const models = Array.isArray(config.models)
        ? config.models
        : config.model
          ? [config.model]
          : [];

      logger.debug('Testing LLM integration:', {
        provider,
        hasApiBaseUrl: !!config.apiBaseUrl,
        hasApiKey: !!config.apiKey,
        modelsCount: models.length,
      });

      if (models.length === 0) {
        return { success: false, message: 'No models configured for testing' };
      }

      // Use the first model for testing
      const testModel =
        typeof models[0] === 'string'
          ? models[0]
          : models[0]?.id || models[0]?.value || String(models[0]);

      // Build provider ID based on provider type
      let providerId: string;
      if (provider === 'aliyun') {
        // Aliyun should use alibaba:chat: format, not openai:chat:
        // Even though Aliyun uses OpenAI-compatible API, the provider registry
        // expects alibaba:chat: format for proper routing
        providerId = `alibaba:chat:${testModel}`;
      } else if (provider === 'ollama') {
        providerId = `ollama:chat:${testModel}`;
      } else if (
        provider === 'lmstudio' ||
        provider === 'sglang' ||
        provider === 'custom_openai' ||
        provider === 'doubao' ||
        provider === 'azure_openai' ||
        provider === 'azure'
      ) {
        providerId = `openai:chat:${testModel}`;
      } else {
        providerId = `${provider}:chat:${testModel}`;
      }

      logger.debug('Provider configuration:', {
        provider,
        testModel,
        providerId,
        apiBaseUrl: config.apiBaseUrl || 'using default',
      });

      // Load provider with config
      const { loadApiProvider } = await import('../providers');
      const {
        applyLmStudioOpenAiDefaults,
        applyQwen3NonStreamingDefaults,
        applySglangOpenAiDefaults,
        isQwen3ModelName,
        normalizeOpenAiCompatibleBaseUrlForProvider,
      } = await import('../lib/llm-integration-resolve');
      const { isLmStudioCompatibleUrl, isSglangCompatibleUrl } = await import('../lib/localLlmUrl');
      const normalizedApiBaseUrl =
        typeof config.apiBaseUrl === 'string'
          ? normalizeOpenAiCompatibleBaseUrlForProvider(provider, config.apiBaseUrl)
          : '';
      const baseProviderConfig: Record<string, unknown> = {
        apiBaseUrl: normalizedApiBaseUrl || undefined,
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.passthrough ? { passthrough: config.passthrough } : {}),
        ...(config.max_tokens ? { max_tokens: config.max_tokens } : {}),
      };
      let providerConfig = baseProviderConfig;
      const apiBaseUrl = normalizedApiBaseUrl;
      const isLmStudio =
        provider === 'lmstudio' || (apiBaseUrl !== '' && isLmStudioCompatibleUrl(apiBaseUrl));
      const isSglang =
        provider === 'sglang' || (apiBaseUrl !== '' && isSglangCompatibleUrl(apiBaseUrl));
      if (isLmStudio) {
        providerConfig = applyLmStudioOpenAiDefaults(providerConfig);
      } else if (isSglang) {
        providerConfig = applySglangOpenAiDefaults(providerConfig);
      } else if (isQwen3ModelName(testModel)) {
        providerConfig = applyQwen3NonStreamingDefaults(providerConfig);
      }
      const providerOptions = {
        id: providerId,
        config: providerConfig,
      };

      logger.debug('Loading API provider with options:', {
        providerId,
        hasConfig: !!providerOptions.config,
      });

      const apiProvider = await loadApiProvider(providerId, {
        options: providerOptions,
      });

      logger.debug('API provider loaded successfully');

      // Make a simple test call with a minimal prompt
      const testPrompt = 'Hello';
      const timeout = 10000; // 10 seconds timeout

      logger.info(`[Test LLM Integration] Sending test request to model: ${testModel}`);
      logger.debug(`[Test LLM Integration] Test prompt: "${testPrompt}"`);
      logger.debug(`[Test LLM Integration] Provider ID: ${providerId}`);
      logger.debug(`[Test LLM Integration] API Base URL: ${config.apiBaseUrl || 'using default'}`);

      const testPromise = apiProvider.callApi(testPrompt, {
        prompt: {
          raw: testPrompt,
          label: 'LLM integration connection test',
          config: {
            max_tokens: 64,
            max_completion_tokens: 64,
          },
        },
        vars: {},
      } as any);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), timeout);
      });

      const response = await Promise.race([testPromise, timeoutPromise]);

      // Log full response for debugging
      logger.info('[Test LLM Integration] Received response from LLM');
      logger.debug('LLM integration test response:', {
        hasResponse: !!response,
        hasOutput: !!(response as any)?.output,
        hasError: !!(response as any)?.error,
        responseKeys: response ? Object.keys(response) : [],
        responseType: typeof response,
        responsePreview: response ? JSON.stringify(response).substring(0, 500) : 'null',
      });

      // Log the actual output if available
      if ((response as any)?.output) {
        logger.info(
          `[Test LLM Integration] Model output: ${String((response as any).output).substring(0, 200)}`,
        );
      }

      // Check for error in response
      if ((response as any)?.error) {
        const error = (response as any).error;
        let errorMsg: string;

        // Extract error message from various formats
        if (typeof error === 'string') {
          errorMsg = error;
        } else if (error.message) {
          errorMsg = error.message;
        } else if (error.type && error.code) {
          errorMsg = `${error.type}: ${error.code} - ${error.message || JSON.stringify(error)}`;
        } else {
          errorMsg = JSON.stringify(error);
        }

        // Provide more helpful error messages for common cases
        if (errorMsg.includes('model') && errorMsg.includes('not found')) {
          return {
            success: false,
            message: `Model not found: ${testModel}. Please check:\n1. The model name is correct\n2. Your API key has access to this model\n3. The model is available in your region\n\nError details: ${errorMsg}`,
          };
        } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
          return {
            success: false,
            message: `Authentication failed. Please check your API key.\n\nError details: ${errorMsg}`,
          };
        } else {
          return {
            success: false,
            message: `API returned error: ${errorMsg}`,
          };
        }
      }

      // Check for successful response
      // A successful response should have an 'output' field with the model's response
      if (response && (response as any).output) {
        const outputText = String((response as any).output);
        logger.info(
          `[Test LLM Integration] ✅ Test successful! Model responded with: ${outputText.substring(0, 100)}...`,
        );
        return {
          success: true,
          message: `Connection successful. Model: ${testModel}`,
          input: testPrompt,
          output: outputText,
        };
      }

      // No output and no error - unexpected response format
      logger.warn('[Test LLM Integration] ⚠️ Unexpected response format - no output and no error');
      logger.warn('Full response', { body: response });
      return {
        success: false,
        message: `Connection test failed: Unexpected response format.\n\nExpected response with 'output' field, but got:\n${JSON.stringify(response, null, 2).substring(0, 500)}`,
      };
    } catch (error) {
      logger.error('LLM integration test error:', error);

      // Log full error details for debugging
      if (error instanceof Error) {
        logger.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      } else {
        logger.error('Error object', { error });
      }

      // Extract error message from various possible formats
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Try to extract error message from error object
        const errorObj = error as any;
        errorMessage = errorObj.message || errorObj.error || errorObj.code || JSON.stringify(error);
      }

      logger.debug('Extracted error message', { message: errorMessage });

      // Provide more specific error messages
      if (errorMessage.includes('timeout') || errorMessage.includes('Connection test timeout')) {
        return {
          success: false,
          message: 'Connection timeout. Please check your API endpoint and network.',
        };
      } else if (
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication')
      ) {
        return { success: false, message: 'Authentication failed. Please check your API key.' };
      } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        return {
          success: false,
          message: 'API endpoint not found. Please check your API base URL.',
        };
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ECONNRESET')
      ) {
        return {
          success: false,
          message: `Cannot connect to API endpoint: ${errorMessage}. Please check your network and API base URL.`,
        };
      } else if (errorMessage.includes('Could not identify provider')) {
        return { success: false, message: `Invalid provider configuration: ${errorMessage}` };
      } else {
        // Return the actual error message for better debugging
        return { success: false, message: `Connection test failed: ${errorMessage}` };
      }
    }
  }

  /**
   * Test integration with custom config (for testing before saving)
   */
  async testIntegrationWithConfig(
    integrationData: Partial<IntegrationConfig>,
  ): Promise<{ success: boolean; message: string; input?: string; output?: string }> {
    try {
      if (!integrationData.type) {
        throw new Error('Integration type is required');
      }

      if (integrationData.type === 'llm') {
        return await this.testLLMIntegration(integrationData as any);
      }

      return { success: false, message: 'Unsupported integration type for testing' };
    } catch (error) {
      logger.error('Test integration with config error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      };
    }
  }
}

export const systemConfigService = new SystemConfigService();
