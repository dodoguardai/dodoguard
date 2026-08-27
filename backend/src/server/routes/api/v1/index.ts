/**
 * API v1 Routes
 * Main router for all v1 API endpoints
 */

import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from '../../../../logger';
import { authenticateToken } from '../../../middleware/authenticateToken';
import agentRoutes from '../../../../agent/routes';
import assetsRoutes from './assets';
import attackTasksRoutes from './attack-tasks';
import externalApiKeysMgmtRoutes from './external-api-keys-mgmt';
import externalIntegrationRoutes from './external';
import scanRoutes from './scan';
// Import route modules
import authRoutes from './auth';
import dashboardRoutes from './dashboard';
import difyConfigAuditRoutes from './dify-config-audit';
import skillsMdAuditRoutes from './skills-md-audit';
import mcpAuditRoutes from './mcp-audit';
import cozeConfigAuditRoutes from './coze-config-audit';
import fastgptConfigAuditRoutes from './fastgpt-config-audit';
import n8nConfigAuditRoutes from './n8n-config-audit';
import findingsRoutes from './findings';
import meRoutes from './me';
import organizationsRoutes from './organizations';
import permissionsRoutes from './permissions';
import queueRoutes from './queue';
import quotaRoutes from './quota';
import reportsRoutes from './reports';
import rolesRoutes from './roles';
import singleTestMultiRoundRoutes from './single-test-multi-round';
import subscriptionRoutes from './subscription';
import modelsRoutes from './models';
import agentGovernanceRoutes from './agent-governance';
import systemConfigRoutes from './system-config';
import targetAgentsRoutes from './target-agents';
import teamsRoutes from './teams';
import usersRoutes from './users';
import vulnerabilitiesRoutes from './vulnerabilities';
import vulnerabilityResourcesRoutes from './vulnerability-resources';
import workflowConfigAssetsRoutes from './workflow-config-assets';

const router = express.Router();
const bundledCapabilityAuditIntegration = path.resolve(
  __dirname,
  '../../../../../capability-audit/integration/backend',
);
const sourceCapabilityAuditIntegration = path.resolve(
  __dirname,
  '../../../../../../capability-audit/integration/backend',
);
const capabilityAuditIntegration = fs.existsSync(`${bundledCapabilityAuditIntegration}.js`)
  ? bundledCapabilityAuditIntegration
  : sourceCapabilityAuditIntegration;
const { wireCapabilityAuditIntoApiV1 } = require(capabilityAuditIntegration);

// Permission middleware factory
const requirePermission = (requiredPermission: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'User not authenticated',
          },
        });
      }

      // Parse permission (e.g., "attack_task:create" -> resource: "attack_task", action: "create")
      const [resource, action] = requiredPermission.split(':');

      const { permissionsService } = await import('../../../services/permissionsService');

      const hasPermission = await permissionsService.hasPermission({
        userId: user.userId,
        organizationId: user.organizationId,
        resource,
        action,
      });

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'You do not have permission to perform this action',
          },
        });
      }

      next();
    } catch (error) {
      logger.error('Permission middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Permission check failed',
        },
      });
    }
  };
};

// Quota middleware factory
const checkQuota = (metric: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return next();
      }

      const { quotaService } = await import('../../../services/quotaService');

      const quotaCheck = await quotaService.checkQuota({
        organizationId: user.organizationId,
        metric,
      });

      if (!quotaCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: `Quota exceeded for ${metric}`,
            details: quotaCheck.quota,
          },
        });
      }

      // Record quota usage
      await quotaService.recordUsage(user.organizationId, metric);

      next();
    } catch (error) {
      logger.error('Quota middleware error:', error);
      // Allow request to continue if quota check fails
      next();
    }
  };
};

// Apply authentication to all routes
router.use('/auth', authRoutes); // Auth routes don't need authentication

router.use('/external', externalIntegrationRoutes);

// Health check endpoint (no auth required)
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  });
});

// Apply authentication to all other routes
router.use(authenticateToken);

router.use('/organizations', organizationsRoutes);
router.use('/target-agents', targetAgentsRoutes);
router.use('/assets', requirePermission('task:manage'), assetsRoutes);
router.use('/scan', requirePermission('task:manage'), scanRoutes);
router.use(
  '/single-test/multi-round',
  requirePermission('task:manage'),
  singleTestMultiRoundRoutes,
);

// Current user (me) - no permission required, just auth
router.use('/me', meRoutes);

// Mount authenticated route modules
router.use('/users', requirePermission('user:manage'), usersRoutes);
router.use('/teams', requirePermission('team:manage'), teamsRoutes);
router.use('/roles', requirePermission('user:manage_roles'), rolesRoutes);
router.use('/permissions', permissionsRoutes); // Permissions are read-only, no special permission needed
router.use(
  '/attack-tasks',
  requirePermission('task:manage'),
  checkQuota('attack_tasks'),
  attackTasksRoutes,
);
router.use('/agent', requirePermission('task:manage'), agentRoutes);
router.use('/agent-mode', requirePermission('task:manage'), agentRoutes);
router.use('/dify-config-audit', requirePermission('task:manage'), difyConfigAuditRoutes);
router.use('/skills-md-audit', requirePermission('task:manage'), skillsMdAuditRoutes);
router.use('/mcp-audit', requirePermission('task:manage'), mcpAuditRoutes);
router.use('/coze-config-audit', requirePermission('task:manage'), cozeConfigAuditRoutes);
router.use('/fastgpt-config-audit', requirePermission('task:manage'), fastgptConfigAuditRoutes);
router.use('/n8n-config-audit', requirePermission('task:manage'), n8nConfigAuditRoutes);
wireCapabilityAuditIntoApiV1(router, requirePermission('task:manage'));
router.use('/workflow-config-assets', requirePermission('task:manage'), workflowConfigAssetsRoutes);
router.use('/external-api-keys', requirePermission('task:manage'), externalApiKeysMgmtRoutes);
router.use('/vulnerabilities', requirePermission('vulnerability:manage'), vulnerabilitiesRoutes);
router.use('/', requirePermission('vulnerability:manage'), vulnerabilityResourcesRoutes); // Vulnerability resources (attack-commands, solutions, etc.)
router.use('/dashboard', requirePermission('dashboard:read'), dashboardRoutes);
router.use('/reports', requirePermission('report:read'), reportsRoutes);
router.use('/findings', requirePermission('vulnerability:manage'), findingsRoutes);
router.use('/queue', requirePermission('system:read'), queueRoutes);
router.use('/system-config', requirePermission('system:read'), systemConfigRoutes);
router.use('/models', requirePermission('system:read'), modelsRoutes);
router.use('/agent-governance', requirePermission('system:read'), agentGovernanceRoutes);
router.use('/quota', quotaRoutes); // Quota routes (read-only for most users)
if (process.env.DODOGUARD_ENABLE_SUBSCRIPTION === 'true') {
  router.use('/subscription', subscriptionRoutes);
}

export default router;
