/**
 * Dify Config audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { difyConfigAuditApi } from '@/services/api/dify-config-audit';
import type {
  AnalyzeDifyConfigRequest,
  DifyConfigAuditData,
} from '@/services/api/dify-config-audit';

const module = createAuditModule<AnalyzeDifyConfigRequest, DifyConfigAuditData>({
  type: 'dify-config',
  label: 'Dify Config',
  historyLabel: 'Dify Audit History',
  routePath: 'dify-config',
  analyze: async (input) => difyConfigAuditApi.analyze(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as difyConfigAuditModule };
