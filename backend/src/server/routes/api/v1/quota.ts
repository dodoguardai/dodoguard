/**
 * Quota API Routes
 */

import express from 'express';
import { quotaService } from '../../../../services/quotaService';
import logger from '../../../../logger';

const router = express.Router();

/**
 * GET /api/v1/quota/usage
 * Get quota usage for current organization
 */
router.get('/usage', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || !user.organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'User not authenticated',
        },
      });
    }

    const usage = await quotaService.getCurrentUsage(user.organizationId);
    const period = quotaService.getCurrentPeriod();

    // Convert QuotaUsage object to Record format for frontend
    const quotas: Record<string, { used: number; limit: number }> = {};
    Object.entries(usage).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && 'used' in value && 'limit' in value) {
        quotas[key] = {
          used: value.used,
          limit: value.limit,
        };
      }
    });

    return res.json({
      success: true,
      data: {
        organizationId: user.organizationId,
        period,
        quotas,
      },
    });
  } catch (error: any) {
    logger.error('Get quota usage error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get quota usage',
      },
    });
  }
});

/**
 * GET /api/v1/quota/check
 * Check if quota allows operation
 */
router.get('/check', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || !user.organizationId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'User not authenticated',
        },
      });
    }

    const { metric, quantity = '1' } = req.query;

    if (!metric || typeof metric !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Metric parameter is required',
        },
      });
    }

    const quantityNum = parseInt(quantity as string, 10) || 1;
    const result = await quotaService.checkQuota(user.organizationId, metric, quantityNum);

    return res.json({
      success: true,
      data: {
        allowed: result.allowed,
        remaining: result.remaining,
        limit: result.limit,
        used: result.currentUsage,
      },
    });
  } catch (error: any) {
    logger.error('Check quota error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to check quota',
      },
    });
  }
});

export default router;
