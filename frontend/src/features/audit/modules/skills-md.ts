/**
 * SKILLS Audit module — registered for factory/registry.
 */

import { createAuditModule } from '../audit-factory';
import { registerAuditModule } from '../audit-registry';
import { skillsMdAuditApi } from '@/services/api/skills-md-audit';
import type { AnalyzeSkillsMdRequest, SkillsMdAuditData } from '@/services/api/skills-md-audit';

const module = createAuditModule<AnalyzeSkillsMdRequest, SkillsMdAuditData>({
  type: 'skills-md',
  label: 'SKILLS Audit',
  historyLabel: 'SKILLS Audit History',
  routePath: 'skills-md',
  analyze: async (input) => skillsMdAuditApi.analyze(input),
  storage: { maxItems: 50 },
});

registerAuditModule(module);

export { module as skillsMdAuditModule };
