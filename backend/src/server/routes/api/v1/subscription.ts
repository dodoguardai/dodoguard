/**
 * Subscription API Routes
 */

import express from 'express';
import { subscriptionService } from '../../../../services/subscriptionService';
import logger from '../../../../logger';

const router = express.Router();

/**
 * GET /api/v1/subscription/plans
 * Get all available subscription plans
 */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await subscriptionService.getPlans();

    return res.json({
      success: true,
      data: plans,
    });
  } catch (error: any) {
    logger.error('Get plans error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get subscription plans',
      },
    });
  }
});

/**
 * GET /api/v1/subscription/current
 * Get current subscription for organization
 */
router.get('/current', async (req, res) => {
  try {
    const user = (req as any).user;
    const organizationId = (req.query.organizationId as string) || user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Organization ID is required',
        },
      });
    }

    const subscription = await subscriptionService.getCurrentSubscription(organizationId);

    if (!subscription) {
      return res.json({
        success: true,
        data: null,
      });
    }

    return res.json({
      success: true,
      data: subscription,
    });
  } catch (error: any) {
    logger.error('Get current subscription error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get current subscription',
      },
    });
  }
});

/**
 * POST /api/v1/subscription/subscribe
 * Create new subscription
 */
router.post('/subscribe', async (req, res) => {
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

    const { planId, billingCycle } = req.body;

    if (!planId || !billingCycle) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'planId and billingCycle are required',
        },
      });
    }

    const subscription = await subscriptionService.subscribe(
      user.organizationId,
      planId,
      billingCycle,
    );

    return res.json({
      success: true,
      data: subscription,
    });
  } catch (error: any) {
    logger.error('Subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to create subscription',
      },
    });
  }
});

/**
 * PUT /api/v1/subscription/change-plan
 * Change subscription plan
 */
router.put('/change-plan', async (req, res) => {
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

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'planId is required',
        },
      });
    }

    const subscription = await subscriptionService.changePlan(user.organizationId, planId);

    return res.json({
      success: true,
      data: subscription,
    });
  } catch (error: any) {
    logger.error('Change plan error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to change subscription plan',
      },
    });
  }
});

/**
 * POST /api/v1/subscription/cancel
 * Cancel subscription
 */
router.post('/cancel', async (req, res) => {
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

    await subscriptionService.cancelSubscription(user.organizationId);

    return res.json({
      success: true,
      data: null,
    });
  } catch (error: any) {
    logger.error('Cancel subscription error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to cancel subscription',
      },
    });
  }
});

/**
 * GET /api/v1/subscription/billing-history
 * Get billing history
 */
router.get('/billing-history', async (req, res) => {
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

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const history = await subscriptionService.getBillingHistory(user.organizationId, limit, offset);

    return res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    logger.error('Get billing history error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get billing history',
      },
    });
  }
});

/**
 * POST /api/v1/subscription/set-free-plan
 * Set default free plan for current organization
 */
router.post('/set-free-plan', async (req, res) => {
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

    const subscription = await subscriptionService.setDefaultFreePlan(user.organizationId);

    return res.json({
      success: true,
      data: subscription,
      message: 'Free plan subscription created successfully',
    });
  } catch (error: any) {
    logger.error('Set free plan error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to set free plan',
      },
    });
  }
});

/**
 * POST /api/v1/subscription/set-enterprise-plan
 * Switch current organization to Enterprise (dev / demo convenience).
 */
router.post('/set-enterprise-plan', async (req, res) => {
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

    const subscription = await subscriptionService.setEnterprisePlan(user.organizationId);

    return res.json({
      success: true,
      data: subscription,
      message: 'Enterprise plan subscription activated',
    });
  } catch (error: any) {
    logger.error('Set enterprise plan error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to set enterprise plan',
      },
    });
  }
});

/**
 * GET /api/v1/subscription/trial-accounts
 * Get all trial accounts (Free plan subscriptions)
 * Admin only endpoint
 */
router.get('/trial-accounts', async (_req, res) => {
  try {
    // TODO: Add admin authentication check
    // const user = (req as any).user;
    // if (!user || !user.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     error: {
    //       code: 'FORBIDDEN',
    //       message: 'Admin access required',
    //     },
    //   });
    // }

    const trialAccounts = await subscriptionService.getTrialAccounts();

    // Calculate summary statistics
    const summary = {
      total: trialAccounts.length,
      active: trialAccounts.filter((a) => a.subscription.status === 'active' && !a.isExpired)
        .length,
      expired: trialAccounts.filter((a) => a.isExpired).length,
      canceled: trialAccounts.filter((a) => a.subscription.status === 'canceled').length,
    };

    return res.json({
      success: true,
      data: {
        accounts: trialAccounts,
        summary,
      },
    });
  } catch (error: any) {
    logger.error('Get trial accounts error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get trial accounts',
      },
    });
  }
});

export default router;
