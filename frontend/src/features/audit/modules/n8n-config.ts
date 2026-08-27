/**
 * N8N Config Audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { n8nConfigAuditApi } from '@/services/api/n8n-config-audit';
import type { AnalyzeN8nConfigRequest, N8nConfigAuditData } from '@/services/api/n8n-config-audit';

const module = createAuditModule<AnalyzeN8nConfigRequest, N8nConfigAuditData>({
  type: 'n8n-config',
  label: 'N8N Config Audit',
  historyLabel: 'N8N Config Audit History',
  routePath: 'n8n-config',
  analyze: async (input) => n8nConfigAuditApi.analyze(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as n8nConfigAuditModule };

