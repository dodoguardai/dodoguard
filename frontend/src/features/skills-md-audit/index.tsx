/**
 * SKILLS audit hub — skill catalog (default) and links to run / history.
 */

import { SkillsMdAuditCatalogPage } from './catalog-page';
import { SkillsAuditShell } from './skills-audit-shell';

export function SkillsMdAuditPage() {
  return (
    <SkillsAuditShell>
      <SkillsMdAuditCatalogPage />
    </SkillsAuditShell>
  );
}
