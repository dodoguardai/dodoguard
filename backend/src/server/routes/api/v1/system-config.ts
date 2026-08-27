/**
 * System Configuration API Routes
 */

import express from 'express';
import { systemConfigService } from '../../../../services/systemConfigService';
import logger from '../../../../logger';

const router = express.Router();

/**
 * GET /api/v1/system-config
 * Get all system configurations
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const configs = await systemConfigService.getAllConfigs(category as string);

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    logger.error('Get system configs error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get system configurations',
      },
    });
  }
});

/**
 * GET /api/v1/system-config/integrations
 * Get integrations (must be before /:key route)
 */
router.get('/integrations', async (req, res) => {
  try {
    const { type } = req.query;
    logger.debug('Getting integrations:', { type, hasType: !!type });

    const integrations = await systemConfigService.getIntegrations(type as string);

    logger.info(`Retrieved ${integrations.length} integrations`, {
      count: integrations.length,
      types: integrations.map((i) => i.type),
      ids: integrations.map((i) => i.id),
    });

    res.json({
      success: true,
      data: integrations,
    });
  } catch (error) {
    logger.error('Get integrations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get integrations',
      },
    });
  }
});

/**
 * GET /api/v1/system-config/:key
 * Get specific configuration (must be after specific routes like /integrations)
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = await systemConfigService.getConfig(key);

    if (value === null) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONFIG_NOT_FOUND',
          message: 'Configuration not found',
        },
      });
    }

    res.json({
      success: true,
      data: { key, value },
    });
  } catch (error) {
    logger.error(`Get config error for ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get configuration',
      },
    });
  }
});

/**
 * PUT /api/v1/system-config/:key
 * Update configuration
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description, editable, requiresRestart } = req.body;
    const updatedBy = (req as any).user?.userId;

    await systemConfigService.updateConfig(
      key,
      {
        value,
        description,
        editable,
        requiresRestart,
      },
      updatedBy,
    );

    res.json({
      success: true,
      message: 'Configuration updated successfully',
    });
  } catch (error) {
    logger.error(`Update config error for ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update configuration',
      },
    });
  }
});

/**
 * GET /api/v1/system-config/feature-flags
 * Get all feature flags
 */
router.get('/feature-flags', async (_req, res) => {
  try {
    const flags = await systemConfigService.getAllFeatureFlags();

    res.json({
      success: true,
      data: flags,
    });
  } catch (error) {
    logger.error('Get feature flags error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get feature flags',
      },
    });
  }
});

/**
 * PUT /api/v1/system-config/feature-flags/:name
 * Update feature flag
 */
router.put('/feature-flags/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;
    const updatedBy = (req as any).user?.userId;

    await systemConfigService.setFeatureFlag(name, enabled, updatedBy);

    res.json({
      success: true,
      message: 'Feature flag updated successfully',
    });
  } catch (error) {
    logger.error(`Update feature flag error for ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update feature flag',
      },
    });
  }
});

/**
 * POST /api/v1/system-config/integrations
 * Create integration
 */
router.post('/integrations', async (req, res) => {
  try {
    const integration = req.body;
    const updatedBy = (req as any).user?.userId;

    logger.debug('Creating integration request:', {
      type: integration?.type,
      name: integration?.name,
      provider: integration?.provider,
      hasConfig: !!integration?.config,
    });

    const result = await systemConfigService.createIntegration(integration, updatedBy);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Create integration error:', error);

    // Extract detailed error message
    let errorMessage = 'Failed to create integration';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;

      // Check for table not found error
      if (errorMessage.includes("doesn't exist") || errorMessage.includes('ER_NO_SUCH_TABLE')) {
        errorMessage =
          'Database table not found. Please run database migrations: npm run db:migrate';
        statusCode = 503; // Service Unavailable
      }

      logger.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      const errorObj = error as any;
      errorMessage = errorObj.message || JSON.stringify(error);

      // Check for MySQL table not found error
      if (
        errorObj.cause?.code === 'ER_NO_SUCH_TABLE' ||
        errorObj.cause?.sqlMessage?.includes("doesn't exist")
      ) {
        errorMessage =
          'Database table not found. Please run database migrations: npm run db:migrate';
        statusCode = 503;
      }
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: statusCode === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      },
    });
  }
});

/**
 * PUT /api/v1/system-config/integrations/:id
 * Update integration
 */
router.put('/integrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedBy = (req as any).user?.userId;

    const result = await systemConfigService.updateIntegration(id, updates, updatedBy);

    res.json({
      success: true,
      message: 'Integration updated successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`Update integration error for ${req.params.id}:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update integration',
      },
    });
  }
});

/**
 * POST /api/v1/system-config/integrations/:id/test
 * Test integration
 */
router.post('/integrations/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await systemConfigService.testIntegration(id);

    // If test failed, return error response with detailed message
    if (!result.success) {
      logger.warn(`Integration test failed for ${id}`, { message: result.message });
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEST_FAILED',
          message: result.message || 'Connection test failed',
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Test integration error for ${req.params.id}`, { error });
    const errorMessage = error instanceof Error ? error.message : 'Failed to test integration';
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      },
    });
  }
});

/**
 * POST /api/v1/system-config/integrations/test
 * Test integration with custom config (before saving)
 */
router.post('/integrations/test', async (req, res) => {
  try {
    const integrationData = req.body;
    logger.debug('Testing integration with config', {
      provider: integrationData.provider,
      hasApiBaseUrl: !!integrationData.config?.apiBaseUrl,
      hasApiKey: !!integrationData.config?.apiKey,
      modelsCount: Array.isArray(integrationData.config?.models)
        ? integrationData.config.models.length
        : 0,
    });

    const result = await systemConfigService.testIntegrationWithConfig(integrationData);

    // If test failed, return error response with detailed message
    if (!result.success) {
      logger.warn('Integration test failed', { message: result.message });
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEST_FAILED',
          message: result.message || 'Connection test failed',
        },
      });
    }

    logger.info('Integration test successful', { message: result.message });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Test integration with config error', { error });

    // Extract detailed error message
    let errorMessage = 'Failed to test integration';
    if (error instanceof Error) {
      errorMessage = error.message;
      // Include stack trace in logs for debugging
      logger.error('Error stack', { stack: error.stack });
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = (error as any).message || JSON.stringify(error);
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      },
    });
  }
});

/**
 * DELETE /api/v1/system-config/integrations/:id
 * Delete integration
 */
router.delete('/integrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await systemConfigService.deleteIntegration(id);

    res.json({
      success: true,
      message: 'Integration deleted successfully',
    });
  } catch (error) {
    logger.error(`Delete integration error for ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete integration',
      },
    });
  }
});

/**
 * GET /api/v1/system-config/notifications
 * Get notification configurations
 */
router.get('/notifications', async (_req, res) => {
  try {
    const configs = await systemConfigService.getNotificationConfigs();

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    logger.error('Get notification configs error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get notification configurations',
      },
    });
  }
});

/**
 * GET /api/v1/system-config/security-policies
 * Get security policies
 */
router.get('/security-policies', async (_req, res) => {
  try {
    const policies = await systemConfigService.getSecurityPolicies();

    res.json({
      success: true,
      data: policies,
    });
  } catch (error) {
    logger.error('Get security policies error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get security policies',
      },
    });
  }
});

export default router;
