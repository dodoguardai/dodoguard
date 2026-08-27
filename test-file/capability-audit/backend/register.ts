/**
 * Capability Audit — backend route registration.
 */

import type { RequestHandler, Router } from 'express';
import skillsMdAuditRoutes from '../../backend/src/server/routes/api/v1/skills-md-audit';
import mcpAuditRoutes from '../../backend/src/server/routes/api/v1/mcp-audit';
import callbacksRoutes from './routes/callbacks';
import capabilityScanRoutes from './routes/capability-scan';
import engineRoutes from './routes/engines';

export type RegisterCapabilityAuditOptions = {
  permissionMiddleware?: RequestHandler;
  includeLegacyAuditRoutes?: boolean;
};

/**
 * Mount capability audit + multi-engine scan routes.
 * - /skills-md-audit/*  (LLM-only legacy)
 * - /mcp-audit/*
 * - /capability-scan/*   legacy integration path
 * - /capability-scans/*  Word-plan task API path
 * - /engines/status
 */
export function registerCapabilityAuditRoutes(
  router: Router,
  options: RegisterCapabilityAuditOptions = {},
): void {
  const guard = options.permissionMiddleware;
  const mount = (path: string, handler: Router) => {
    if (guard) {
      router.use(path, guard, handler);
    } else {
      router.use(path, handler);
    }
  };

  // Engine health is read-only diagnostics — auth only (parent /api/v1 already authenticates).
  router.use('/engines', engineRoutes);

  if (options.includeLegacyAuditRoutes) {
    mount('/skills-md-audit', skillsMdAuditRoutes);
    mount('/mcp-audit', mcpAuditRoutes);
  }
  mount('/capability-scan', capabilityScanRoutes);
  mount('/capability-scans', capabilityScanRoutes);
  mount('/callbacks', callbacksRoutes);
}

export { skillsMdAuditRoutes, mcpAuditRoutes, capabilityScanRoutes };
export { runCapabilityScan, registerScanEngine } from './scan/runner';
export type { CapabilityScanResult, ScanStrategy, ScanArtifactKind } from './scan/types';
