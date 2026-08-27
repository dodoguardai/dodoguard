/**
 * Coze Config Audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { cozeConfigAuditApi } from '@/services/api/coze-config-audit';
import type { AnalyzeCozeConfigRequest, CozeConfigAuditData } from '@/services/api/coze-config-audit';

const module = createAuditModule<AnalyzeCozeConfigRequest, CozeConfigAuditData>({
  type: 'coze-config',
  label: 'Coze Config Audit',
  historyLabel: 'Coze Audit History',
  routePath: 'coze-config',
  analyze: async (input) => cozeConfigAuditApi.analyze(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as cozeConfigAuditModule };
