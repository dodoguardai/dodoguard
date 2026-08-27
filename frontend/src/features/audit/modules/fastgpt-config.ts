/**
 * FastGPT Config Audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { fastgptConfigAuditApi } from '@/services/api/fastgpt-config-audit';
import type {
  AnalyzeFastGptConfigRequest,
  FastGptConfigAuditData,
} from '@/services/api/fastgpt-config-audit';

const module = createAuditModule<AnalyzeFastGptConfigRequest, FastGptConfigAuditData>({
  type: 'fastgpt-config',
  label: 'FastGPT Config Audit',
  historyLabel: 'FastGPT Audit History',
  routePath: 'fastgpt-config',
  analyze: async (input) => fastgptConfigAuditApi.analyze(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as fastgptConfigAuditModule };
