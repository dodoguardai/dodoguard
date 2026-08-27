/**
 * SKILLS.md Audit — history detail (localStorage or server report).
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Main } from '@/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronDown, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { inferSkillAuditDimensionClient } from './dimensions';
import { SkillsAuditShell } from './skills-audit-shell';
import { useSkillsAuditHistoryItem } from './use-skills-audit-history';
import { auditToMarkdown, riskVariant } from './utils';

interface SkillsMdAuditHistoryDetailPageProps {
  id: string;
}

export function SkillsMdAuditHistoryDetailPage({ id }: SkillsMdAuditHistoryDetailPageProps) {
  const { t, i18n } = useTranslation();
  const { item, isLoading } = useSkillsAuditHistoryItem(id);

  if (isLoading) {
    return (
      <SkillsAuditShell>
        <Main>
          <Skeleton className="mb-4 h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </Main>
      </SkillsAuditShell>
    );
  }

  if (!item) {
    return (
      <SkillsAuditShell>
        <Main>
          <Alert variant="destructive">
            <AlertTitle>{t('pages.skillsMdAudit.detailNotFoundTitle')}</AlertTitle>
            <AlertDescription>{t('pages.skillsMdAudit.detailNotFoundBody')}</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to="/skills-md-audit/history">{t('pages.skillsMdAudit.backToHistory')}</Link>
          </Button>
        </Main>
      </SkillsAuditShell>
    );
  }

  const { result, metadata } = item;
  const fileName = metadata?.fileName as string | undefined;
  const reportId = metadata?.reportId as string | undefined;

  const copyMd = () => {
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName));
    toast.success(t('pages.skillsMdAudit.markdownCopied'));
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skills-md-audit-${fileName ?? 'SKILLS'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const savedDate = new Date(item.createdAt).toLocaleString(
    i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
  );

  return (
    <SkillsAuditShell>
      <Main>
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/skills-md-audit/history">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {fileName
                ? t('pages.skillsMdAudit.detailAuditWithFile', { fileName })
                : t('pages.skillsMdAudit.detailTitleDefault')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('pages.skillsMdAudit.detailSavedAt', { date: savedDate })}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t('pages.skillsMdAudit.resultsCardTitle')}</CardTitle>
              <CardDescription>
                {result.truncated && 'Part of the document was truncated for model limits. '}
                {result.warnings && result.warnings.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-500">
                    {result.warnings.join(' ')}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={riskVariant(result.overallRisk)}>{result.overallRisk}</Badge>
              {reportId && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/reports/$reportId" params={{ reportId }}>
                    {t('pages.skillsMdAudit.detailViewReport')}
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={copyMd}>
                <Copy className="mr-1 size-4" />
                {t('pages.skillsMdAudit.detailCopyMarkdown')}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadJson}>
                <Download className="mr-1 size-4" />
                {t('pages.skillsMdAudit.detailDownloadJson')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm">
              {t('pages.skillsMdAudit.scannedFiles', { count: result.scannedFiles?.length ?? 1 })} ·{' '}
              {t('pages.skillsMdAudit.findingsCount', { count: result.findings.length })}
            </p>
            {result.scannedFiles && result.scannedFiles.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-muted/50 text-muted-foreground flex items-center gap-2 text-sm font-medium"
                  >
                    <ChevronDown className="size-4" />
                    {t('pages.skillsMdAudit.detailScannedFilesList')} ({result.scannedFiles.length})
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="border-border mt-2 max-h-40 list-inside list-disc overflow-y-auto rounded-md border p-3 font-mono text-xs">
                    {result.scannedFiles.map((s) => (
                      <li key={s.path}>{s.path}</li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
            <div>
              <h3 className="mb-2 font-semibold">{t('pages.skillsMdAudit.detailSummaryHeading')}</h3>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{result.summary}</p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                {t('pages.skillsMdAudit.detailFindingsTitle', { count: result.findings.length })}
              </h3>
              <ul className="space-y-4">
                {result.findings.map((f, i) => {
                  const dim = inferSkillAuditDimensionClient({
                    category: f.category,
                    dimension: f.dimension,
                  });
                  return (
                    <li key={`${f.location}-${i}`} className="rounded-md border p-4 text-sm">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant={riskVariant(f.severity)}>{f.severity}</Badge>
                        <Badge variant="outline">{t(`pages.skillsMdAudit.dimensions.${dim}`)}</Badge>
                        <span className="font-medium">{f.category}</span>
                        {f.sourceFile && (
                          <span className="text-muted-foreground text-xs">
                            {t('pages.skillsMdAudit.sourceFile')}: {f.sourceFile}
                          </span>
                        )}
                        <span className="text-muted-foreground text-xs">{f.location}</span>
                      </div>
                      <p className="mb-2">{f.issue}</p>
                      <p className="text-muted-foreground mb-2 text-xs">
                        <strong>{t('pages.skillsMdAudit.detailEvidenceLabel')}</strong> {f.evidence}
                      </p>
                      <p className="text-xs">
                        <strong>{t('pages.skillsMdAudit.detailRecommendationLabel')}</strong>{' '}
                        {f.recommendation}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
            {result.recommendations.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold">
                  {t('pages.skillsMdAudit.detailGeneralRecommendations')}
                </h3>
                <ul className="list-inside list-disc text-sm">
                  {result.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </SkillsAuditShell>
  );
}
