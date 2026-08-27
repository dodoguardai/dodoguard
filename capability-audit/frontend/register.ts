/**
 * Capability Audit — frontend module bootstrap.
 * Side-effect: registers skills-md and mcp-source audit modules in the global registry.
 * Import once at app entry (e.g. main.tsx).
 */

import '@/features/audit/modules/skills-md';
import '@/features/audit/modules/mcp-source';

export { CapabilityAuditPage } from '@/features/capability-audit/capability-audit-page';
export { CAPABILITY_AUDIT_VARIANTS } from '../shared/constants';
