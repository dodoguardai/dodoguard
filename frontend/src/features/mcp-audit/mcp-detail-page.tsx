import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Plug, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAuditModule } from '@/features/audit/audit-registry';
import { riskVariant } from '@/features/skills-md-audit/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  auditsForMcpSlug,
  listReferenceMcpRows,
  type McpAuditHistoryRow,
} from './mcp-audit-helpers';
import { McpAuditShell } from './mcp-audit-shell';

export function McpAuditMcpDetailPage() {
  const { slug = '' } = useParams({ strict: false }) as { slug?: string };
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const lang = isZh ? 'zh' : 'en';

  const mcpMeta = useMemo(() => listReferenceMcpRows(lang).find((r) => r.slug === slug), [lang, slug]);

  const registryQuery = useQuery({
    queryKey: ['capability-components', 'mcp-by-slug', slug],
    enabled: Boolean(slug) && !mcpMeta,
    queryFn: () =>
      detectionScanningApi.listCapabilityComponents({
        componentKind: 'mcp',
        search: slug,
        limit: 50,
      }),
  });

  const registryMatch = useMemo(() => {
    const rows = registryQuery.data?.data || [];
    const needle = slug.trim().toLowerCase();
    return rows.find(
      (row) =>
        (row.componentKey || '').toLowerCase() === needle ||
        row.name.toLowerCase() === needle ||
        row.id === slug,
    );
  }, [registryQuery.data, slug]);

  const auditItems = useMemo(() => {
    const mod = getAuditModule('mcp-source');
    return (mod?.storage.list() ?? []) as McpAuditHistoryRow[];
  }, []);

  const forMcp = useMemo(() => auditsForMcpSlug(auditItems, slug), [auditItems, slug]);

  if (!mcpMeta && registryMatch) {
    return (
      <McpAuditShell>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/mcp-audit">
              <ArrowLeft className="me-1 size-4" />
              {t('pages.mcpAudit.mcpBackOverview')}
            </Link>
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{registryMatch.name}</CardTitle>
              <CardDescription>{t('pages.mcpAudit.mcpRedirectToCapability')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  to="/scan/capability-risks"
                  search={{ kind: 'mcp', componentId: registryMatch.id }}
                >
                  {t('pages.mcpAudit.catalogOpenCapabilityDetail')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/mcp-audit/run" search={{ mcpSlug: slug }}>
                  {t('pages.mcpAudit.catalogRunAudit')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </McpAuditShell>
    );
  }

  if (!mcpMeta) {
    return (
      <McpAuditShell>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/mcp-audit">
              <ArrowLeft className="me-1 size-4" />
              {t('pages.mcpAudit.mcpBackOverview')}
            </Link>
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.mcpAudit.mcpNotFoundTitle')}</CardTitle>
              <CardDescription>{t('pages.mcpAudit.mcpNotFoundBody', { slug })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/mcp-audit/run" search={{ mcpSlug: slug }}>
                  {t('pages.mcpAudit.catalogRunAudit')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </McpAuditShell>
    );
  }

  return (
    <McpAuditShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/mcp-audit">
              <ArrowLeft className="me-1 size-4" />
              {t('pages.mcpAudit.mcpBackOverview')}
            </Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link to="/mcp-audit/run" search={{ mcpSlug: slug }}>
              {t('pages.mcpAudit.mcpStartNewAudit')}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Shield className="text-muted-foreground mt-1 size-9 shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{mcpMeta.name}</h1>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                {mcpMeta.description || (isZh ? '（无描述）' : '(No description)')}
              </p>
              <p className="text-muted-foreground mt-2 font-mono text-xs">{slug}</p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            <Plug className="me-1 size-3" />
            {t('pages.mcpAudit.sourceCatalogExtra')}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('pages.mcpAudit.mcpSecurityAuditsTitle')}</CardTitle>
            <CardDescription>{t('pages.mcpAudit.mcpSecurityAuditsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {forMcp.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('pages.mcpAudit.mcpNoAudits')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('pages.skillsMdAudit.skillColTime')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.skillColRisk')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.skillColFindings')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.skillColFile')}</TableHead>
                    <TableHead className="w-[100px]">
                      {t('pages.skillsMdAudit.skillColActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forMcp.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={riskVariant(item.result.overallRisk)}>
                          {item.result.overallRisk}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.result.findings?.length ?? 0}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {(item.metadata?.fileName as string) || '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/mcp-audit/history/$id" params={{ id: item.id }}>
                            {t('pages.skillsMdAudit.skillViewRecord')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </McpAuditShell>
  );
}
