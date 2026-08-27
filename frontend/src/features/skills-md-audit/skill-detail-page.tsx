import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { agentModeApi } from '@/services/api/agent-mode';
import {
  auditsForSkillSlug,
  mergeBundledAndExtras,
} from './skills-audit-helpers';
import { SkillsAuditShell } from './skills-audit-shell';
import { useSkillsAuditHistoryItems } from './use-skills-audit-history';
import { useUserSkillCatalog } from './user-skill-catalog-storage';
import { riskVariant } from './utils';

export function SkillsMdAuditSkillDetailPage() {
  const { slug = '' } = useParams({ strict: false }) as { slug?: string };
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');

  const { data: apiSkills = [], isLoading } = useQuery({
    queryKey: ['agent-bundled-skills-catalog'],
    queryFn: () => agentModeApi.listBundledSkills(),
  });

  const userCatalog = useUserSkillCatalog();

  const skillMeta = useMemo(() => {
    const rows = mergeBundledAndExtras(apiSkills, isZh ? 'zh' : 'en', userCatalog);
    return rows.find((r) => r.slug === slug);
  }, [apiSkills, slug, isZh, userCatalog]);

  const { items: auditItems } = useSkillsAuditHistoryItems();

  const forSkill = useMemo(() => auditsForSkillSlug(auditItems, slug), [auditItems, slug]);

  if (isLoading) {
    return (
      <SkillsAuditShell>
        <Skeleton className="mb-4 h-10 w-64" />
        <Skeleton className="h-48 w-full max-w-2xl" />
      </SkillsAuditShell>
    );
  }

  if (!skillMeta) {
    return (
      <SkillsAuditShell>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/skills-md-audit">
              <ArrowLeft className="me-1 size-4" />
              {t('pages.skillsMdAudit.skillBackCatalog')}
            </Link>
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.skillsMdAudit.skillNotFoundTitle')}</CardTitle>
              <CardDescription>
                {t('pages.skillsMdAudit.skillNotFoundBody', { slug })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/skills-md-audit/run" search={{ skillSlug: slug }}>
                  {t('pages.skillsMdAudit.catalogRunAudit')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SkillsAuditShell>
    );
  }

  return (
    <SkillsAuditShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/skills-md-audit">
              <ArrowLeft className="me-1 size-4" />
              {t('pages.skillsMdAudit.skillBackCatalog')}
            </Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link to="/skills-md-audit/run" search={{ skillSlug: slug }}>
              {t('pages.skillsMdAudit.skillStartNewAudit')}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Shield className="text-muted-foreground mt-1 size-9 shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{skillMeta.name}</h1>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                {skillMeta.description || (isZh ? '（无描述）' : '(No description)')}
              </p>
              <p className="text-muted-foreground mt-2 font-mono text-xs">{slug}</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('pages.skillsMdAudit.skillSecurityAuditsTitle')}</CardTitle>
            <CardDescription>
              {t('pages.skillsMdAudit.skillSecurityAuditsSubtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forSkill.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('pages.skillsMdAudit.skillNoAudits')}
              </p>
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
                  {forSkill.map((item) => (
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
                          <Link to="/skills-md-audit/history/$id" params={{ id: item.id }}>
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
    </SkillsAuditShell>
  );
}
