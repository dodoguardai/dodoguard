import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, FileArchive } from 'lucide-react';
import { McpAuditWizard } from './mcp-audit-wizard';
import { McpAuditShell } from './mcp-audit-shell';

export function McpAuditRunPage() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { mcpSlug?: string };
  const linkedMcpSlug =
    typeof search.mcpSlug === 'string' && search.mcpSlug.trim() ? search.mcpSlug.trim() : undefined;

  return (
    <McpAuditShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <FileArchive className="size-8 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('pages.mcpAudit.runPageTitle')}</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {t('pages.mcpAudit.runPageSubtitle')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/reports">{t('pages.mcpAudit.viewReports')}</Link>
        </Button>
      </div>

      <Collapsible defaultOpen={false} className="group/collapse mb-6">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-muted bg-muted/30 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
          >
            {t('pages.mcpAudit.howItWorksDisclaimer')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 rounded-b-md border border-t-0 border-muted bg-muted/20 px-4 py-3">
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{t('pages.mcpAudit.howItWorks')}</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-1 text-xs">
                <ol className="list-inside list-decimal space-y-1">
                  <li>{t('pages.mcpAudit.howItWorksSteps.1')}</li>
                  <li>{t('pages.mcpAudit.howItWorksSteps.2')}</li>
                  <li>{t('pages.mcpAudit.howItWorksSteps.3')}</li>
                  <li>{t('pages.mcpAudit.howItWorksSteps.4')}</li>
                </ol>
              </AlertDescription>
            </Alert>
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{t('pages.mcpAudit.disclaimer')}</AlertTitle>
              <AlertDescription className="text-muted-foreground text-xs">
                {t('pages.mcpAudit.disclaimerBody')}
              </AlertDescription>
            </Alert>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {linkedMcpSlug && (
        <Alert className="mb-6">
          <AlertTitle>{t('pages.mcpAudit.navRun')}</AlertTitle>
          <AlertDescription>{t('pages.mcpAudit.runLinkedMcpHint', { slug: linkedMcpSlug })}</AlertDescription>
        </Alert>
      )}

      <McpAuditWizard linkedMcpSlug={linkedMcpSlug} />
    </McpAuditShell>
  );
}
