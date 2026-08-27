/**
 * One-line backend integration for teammates merging capability-audit.
 *
 * In backend/src/server/routes/api/v1/index.ts:
 *
 *   import { wireCapabilityAuditIntoApiV1 } from '../../../../../../capability-audit/integration/backend';
 *   wireCapabilityAuditIntoApiV1(router, requirePermission('task:manage'));
 */

import type { RequestHandler, Router } from 'express';

import { registerCapabilityAuditRoutes } from '../backend/register';

export function wireCapabilityAuditIntoApiV1(
  router: Router,
  permissionMiddleware?: RequestHandler,
): void {
  registerCapabilityAuditRoutes(router, { permissionMiddleware });
}

/**
 * By default this only mounts /capability-scan. Pass includeLegacyAuditRoutes
 * to registerCapabilityAuditRoutes only in apps that have not already mounted
 * /skills-md-audit and /mcp-audit.
 */
