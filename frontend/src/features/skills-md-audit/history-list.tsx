/**
 * SKILLS.md Audit — history list (browser localStorage + server reports).
 */

import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { FileText, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Main } from '@/components/layout/main';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SkillsAuditShell } from './skills-audit-shell';
import { useSkillsAuditHistoryItems } from './use-skills-audit-history';
import { riskVariant } from './utils';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

export function SkillsMdAuditHistoryListPage() {
  const { t } = useTranslation();
  const { items, isLoading } = useSkillsAuditHistoryItems();

  return (
    <SkillsAuditShell>
      <Main>
        <div className="mb-6 flex items-center gap-2">
          <History className="size-8" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t('pages.skillsMdAudit.historyTitle')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('pages.skillsMdAudit.historySubtitle')}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <FileText className="mx-auto mb-4 size-12 text-muted-foreground" />
            <p className="text-muted-foreground">{t('pages.skillsMdAudit.historyEmpty')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('pages.skillsMdAudit.historyEmptyHint')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild variant="default">
                <Link to="/skills-md-audit/run" search={{ skillSlug: undefined }}>
                  {t('pages.skillsMdAudit.historyGoRun')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/skills-md-audit">{t('pages.skillsMdAudit.historyGoTo')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('pages.skillsMdAudit.historyColFile')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.historyColRisk')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.historyColSummary')}</TableHead>
                    <TableHead>{t('pages.skillsMdAudit.historyColCreated')}</TableHead>
                    <TableHead className="w-[100px]">
                      {t('pages.skillsMdAudit.historyColActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {(item.metadata?.fileName as string) || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={riskVariant(
                            (item.result.overallRisk as SkillsMdAuditData['overallRisk']) ??
                              'medium',
                          )}
                        >
                          {(item.metadata?.overallRisk as string) ?? item.result.overallRisk}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground text-sm">
                        {item.result.summary}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/skills-md-audit/history/$id" params={{ id: item.id }}>
                            {t('pages.skillsMdAudit.historyColView')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" asChild>
                <Link to="/skills-md-audit/run" search={{ skillSlug: undefined }}>
                  {t('pages.skillsMdAudit.historyNewAudit')}
                </Link>
              </Button>
            </div>
          </>
        )}
      </Main>
    </SkillsAuditShell>
  );
}
