/**
 * MCP audit hub — overview + MCP directory (list, upload, audit).
 */

import { useTranslation } from 'react-i18next';
import { FileArchive } from 'lucide-react';
import { McpAuditCatalogSection } from './mcp-catalog-section';
import { McpAuditShell } from './mcp-audit-shell';

export function McpAuditIndexPage() {
  const { t } = useTranslation();

  return (
    <McpAuditShell>
      <div className="mb-8 flex items-start gap-3">
        <FileArchive className="size-9 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pages.mcpAudit.pageTitle')}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            {t('pages.mcpAudit.pageSubtitle')}
          </p>
        </div>
      </div>

      <McpAuditCatalogSection />
    </McpAuditShell>
  );
}
