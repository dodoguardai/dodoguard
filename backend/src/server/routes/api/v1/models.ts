/**
 * Managed LLM models API — persisted registry with DodoGuard-style providerConfig per model.
 */

import express from 'express';
import { z } from 'zod';
import { getLlmProviderPayloadFromManagedModels } from '../../../../lib/llm-integration-resolve';
import { loadApiProvider } from '../../../../providers';
import { managedModelService } from '../../../../services/managedModelService';
import { migrateLlmIntegrationsToManagedModels } from '../../../../services/migrateLlmIntegrationsToManagedModels';

const router = express.Router();

const providerConfigSchema = z.record(z.string(), z.unknown()).optional();

function extractProviderResponseText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const record = value as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice =
    choices[0] && typeof choices[0] === 'object' && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : {};
  const message =
    firstChoice.message &&
    typeof firstChoice.message === 'object' &&
    !Array.isArray(firstChoice.message)
      ? (firstChoice.message as Record<string, unknown>)
      : {};
  for (const candidate of [
    record.output,
    record.text,
    record.response,
    record.content,
    message.content,
    firstChoice.text,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function extractProviderErrorMessage(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

/** Exported for unit tests (request body validation). */
export const createManagedModelBodySchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  modelKey: z.string().min(1),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  healthStatus: z.enum(['healthy', 'degraded', 'offline', 'unknown']).optional().default('unknown'),
  quotaMonthly: z.number().int().positive().optional().default(100000),
  providerConfig: providerConfigSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateManagedModelBodySchema = createManagedModelBodySchema.partial().extend({
  healthStatus: z.enum(['healthy', 'degraded', 'offline', 'unknown']).optional(),
  quotaUsed: z.number().int().nonnegative().optional(),
  providerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

router.get('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    await migrateLlmIntegrationsToManagedModels(organizationId);
    const models = await managedModelService.listByOrganization(organizationId);
    res.json({ success: true, data: models });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const parsed = createManagedModelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }

    const model = await managedModelService.create({
      organizationId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      modelKey: parsed.data.modelKey,
      status: parsed.data.status,
      healthStatus: parsed.data.healthStatus,
      quotaMonthly: parsed.data.quotaMonthly,
      providerConfig: parsed.data.providerConfig,
      metadata: parsed.data.metadata,
    });

    res.status(201).json({ success: true, data: model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const parsed = updateManagedModelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }

    const updated = await managedModelService.update(req.params.id, organizationId, parsed.data);
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'MODEL_NOT_FOUND', message: 'Model not found' },
      });
    }

    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const deleted = await managedModelService.delete(req.params.id, organizationId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'MODEL_NOT_FOUND', message: 'Model not found' },
      });
    }

    res.json({ success: true, message: 'Model deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

router.post('/:id/health-check', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const existing = await managedModelService.getById(req.params.id, organizationId, false);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'MODEL_NOT_FOUND', message: 'Model not found' },
      });
    }

    let nextHealth: 'healthy' | 'degraded' | 'offline' =
      existing.status === 'active' ? 'degraded' : 'offline';
    let healthMessage = existing.status === 'active' ? 'Model check not run' : 'Model is inactive';

    if (existing.status === 'active') {
      const payload = getLlmProviderPayloadFromManagedModels([existing], existing.id);
      if (payload?.id) {
        try {
          const provider = await loadApiProvider(payload.id, {
            options: {
              id: payload.id,
              config: {
                ...payload.config,
                showThinking: false,
                temperature: 0,
                max_tokens: 16,
              },
            },
          });
          const prompt = '请只回复 OK，用于模型连通性测试。';
          const response = await Promise.race([
            provider.callApi(prompt, { prompt, vars: {} } as any),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('模型连通性测试超时')), 45_000),
            ),
          ]);
          const providerError = extractProviderErrorMessage(response);
          const output = extractProviderResponseText(response);
          if (providerError) {
            nextHealth = 'offline';
            healthMessage = providerError;
          } else if (output) {
            nextHealth = 'healthy';
            healthMessage = '模型连通性测试通过';
          } else {
            nextHealth = 'degraded';
            healthMessage = '模型已响应，但返回内容为空';
          }
        } catch (error) {
          nextHealth = 'offline';
          healthMessage = error instanceof Error ? error.message : String(error);
        }
      } else {
        nextHealth = 'offline';
        healthMessage = '模型配置不可用：API Key 缺失或仍是脱敏占位符，请重新编辑保存真实 Key';
      }
    }

    const updated = await managedModelService.update(req.params.id, organizationId, {
      healthStatus: nextHealth,
      metadata: {
        ...(existing.metadata || {}),
        lastHealthCheck: {
          checkedAt: new Date().toISOString(),
          ok: nextHealth === 'healthy',
          message: healthMessage,
        },
      },
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'MODEL_NOT_FOUND', message: 'Model not found' },
      });
    }

    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

export default router;
