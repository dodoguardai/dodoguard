import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, FileText } from 'lucide-react';
import { SkillsMdAuditWizard } from './audit-wizard';
import { SkillsAuditShell } from './skills-audit-shell';

export function SkillsMdAuditRunPage() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { skillSlug?: string };
  const linkedSkillSlug =
    typeof search.skillSlug === 'string' && search.skillSlug.trim() ? search.skillSlug.trim() : undefined;

  return (
    <SkillsAuditShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <FileText className="size-8 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('pages.skillsMdAudit.runPageTitle')}</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {t('pages.skillsMdAudit.runPageSubtitle')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/reports">{t('pages.skillsMdAudit.viewReports')}</Link>
        </Button>
      </div>

      {linkedSkillSlug && (
        <Alert className="mb-6">
          <AlertTitle>{t('pages.skillsMdAudit.navRun')}</AlertTitle>
          <AlertDescription>{t('pages.skillsMdAudit.runLinkedSkillHint', { slug: linkedSkillSlug })}</AlertDescription>
        </Alert>
      )}

      <Collapsible defaultOpen={false} className="group/collapse mb-6">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-muted bg-muted/30 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
          >
            {t('pages.skillsMdAudit.howItWorksDisclaimer')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 rounded-b-md border border-t-0 border-muted bg-muted/20 px-4 py-3">
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{t('pages.skillsMdAudit.howItWorks')}</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-1 text-xs">
                <ol className="list-inside list-decimal space-y-1">
                  <li>{t('pages.skillsMdAudit.howItWorksSteps.1')}</li>
                  <li>{t('pages.skillsMdAudit.howItWorksSteps.2')}</li>
                  <li>{t('pages.skillsMdAudit.howItWorksSteps.3')}</li>
                  <li>{t('pages.skillsMdAudit.howItWorksSteps.4')}</li>
                </ol>
              </AlertDescription>
            </Alert>
            <Alert className="border-0 bg-transparent p-0">
              <AlertTitle className="text-sm">{t('pages.skillsMdAudit.disclaimer')}</AlertTitle>
              <AlertDescription className="text-muted-foreground text-xs">
                {t('pages.skillsMdAudit.disclaimerBody')}
              </AlertDescription>
            </Alert>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <SkillsMdAuditWizard linkedSkillSlug={linkedSkillSlug} />
    </SkillsAuditShell>
  );
}
