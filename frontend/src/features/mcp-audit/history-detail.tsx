/**
 * MCP source audit — history detail (localStorage).
 */

import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getAuditModule } from '@/features/audit/audit-registry';
import { inferSkillAuditDimensionClient } from '@/features/skills-md-audit/dimensions';
import { auditToMarkdown, riskVariant } from '@/features/skills-md-audit/utils';
import { ArrowLeft, ChevronDown, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { McpAuditData } from '@/services/api/mcp-audit';
import { McpAuditShell } from './mcp-audit-shell';

interface McpAuditHistoryDetailPageProps {
  id: string;
}

export function McpAuditHistoryDetailPage({ id }: McpAuditHistoryDetailPageProps) {
  const { t, i18n } = useTranslation();
  const module = getAuditModule('mcp-source');
  const item = useMemo(() => {
    if (!module?.storage || !id) {
      return null;
    }
    return module.storage.getById(id) as {
      id: string;
      result: McpAuditData;
      metadata?: { fileName?: string };
      createdAt: string;
    } | null;
  }, [module, id]);

  if (!item) {
    return (
      <McpAuditShell>
        <Alert variant="destructive">
          <AlertTitle>{t('pages.mcpAudit.detailNotFoundTitle')}</AlertTitle>
          <AlertDescription>{t('pages.mcpAudit.detailNotFoundBody')}</AlertDescription>
        </Alert>
        <Button asChild className="mt-4">
          <Link to="/mcp-audit/history">{t('pages.mcpAudit.backToHistory')}</Link>
        </Button>
      </McpAuditShell>
    );
  }

  const { result, metadata } = item;
  const fileName = metadata?.fileName as string | undefined;

  const copyMd = () => {
    const title = t('pages.mcpAudit.exportMarkdownTitle');
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName, { reportTitle: title }));
    toast.success(t('pages.mcpAudit.markdownCopied'));
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mcp-audit-${fileName ?? 'mcp-server'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const savedDate = new Date(item.createdAt).toLocaleString(
    i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
  );

  return (
    <McpAuditShell>
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/mcp-audit/history">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {fileName
              ? t('pages.mcpAudit.detailAuditWithFile', { fileName })
              : t('pages.mcpAudit.detailTitleDefault')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('pages.mcpAudit.detailSavedAt', { date: savedDate })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{t('pages.mcpAudit.resultsCardTitle')}</CardTitle>
            <CardDescription>
              {result.truncated && 'Part of the archive was truncated for model limits. '}
              {result.warnings && result.warnings.length > 0 && (
                <span className="text-amber-600 dark:text-amber-500">{result.warnings.join(' ')}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={riskVariant(result.overallRisk)}>{result.overallRisk}</Badge>
            <Button variant="outline" size="sm" onClick={copyMd}>
              <Copy className="mr-1 size-4" />
              {t('pages.mcpAudit.detailCopyMarkdown')}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadJson}>
              <Download className="mr-1 size-4" />
              {t('pages.mcpAudit.detailDownloadJson')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground text-sm">
            {t('pages.mcpAudit.scannedFiles', { count: result.scannedFiles?.length ?? 1 })} ·{' '}
            {t('pages.mcpAudit.findingsCount', { count: result.findings.length })}
          </p>
          {result.scannedFiles && result.scannedFiles.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="hover:bg-muted/50 text-muted-foreground flex items-center gap-2 text-sm font-medium"
                >
                  <ChevronDown className="size-4" />
                  {t('pages.mcpAudit.detailScannedFilesList')} ({result.scannedFiles.length})
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
            <h3 className="mb-2 font-semibold">{t('pages.mcpAudit.detailSummaryHeading')}</h3>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{result.summary}</p>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">
              {t('pages.mcpAudit.detailFindingsTitle', { count: result.findings.length })}
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
                          {t('pages.mcpAudit.sourceFile')}: {f.sourceFile}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">{f.location}</span>
                    </div>
                    <p className="mb-2">{f.issue}</p>
                    <p className="text-muted-foreground mb-2 text-xs">
                      <strong>{t('pages.mcpAudit.detailEvidenceLabel')}</strong> {f.evidence}
                    </p>
                    <p className="text-xs">
                      <strong>{t('pages.mcpAudit.detailRecommendationLabel')}</strong>{' '}
                      {f.recommendation}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
          {result.recommendations.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">{t('pages.mcpAudit.detailGeneralRecommendations')}</h3>
              <ul className="list-inside list-disc text-sm">
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </McpAuditShell>
  );
}
