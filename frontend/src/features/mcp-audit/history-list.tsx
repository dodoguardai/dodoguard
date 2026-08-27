/**
 * MCP source audit — history list (localStorage).
 */

import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { FileArchive, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { McpAuditData } from '@/services/api/mcp-audit';
import { McpAuditShell } from './mcp-audit-shell';

export function McpAuditHistoryListPage() {
  const { t } = useTranslation();
  const module = getAuditModule('mcp-source');
  const items = useMemo(() => {
    if (!module?.storage) {
      return [];
    }
    return module.storage.list() as Array<{
      id: string;
      result: McpAuditData;
      metadata?: { fileName?: string; overallRisk?: string };
      createdAt: string;
    }>;
  }, [module]);

  return (
    <McpAuditShell>
      <div className="mb-6 flex items-center gap-2">
        <History className="size-8" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pages.mcpAudit.historyTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('pages.mcpAudit.historySubtitle')}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileArchive className="mx-auto mb-4 size-12 text-muted-foreground" />
          <p className="text-muted-foreground">{t('pages.mcpAudit.historyEmpty')}</p>
          <p className="mt-1 text-muted-foreground text-sm">{t('pages.mcpAudit.historyEmptyHint')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="default">
                <Link to="/mcp-audit/run" search={{ mcpSlug: undefined }}>
                  {t('pages.mcpAudit.historyGoRun')}
                </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/mcp-audit">{t('pages.mcpAudit.historyGoTo')}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.mcpAudit.historyColFile')}</TableHead>
                  <TableHead>{t('pages.mcpAudit.historyColRisk')}</TableHead>
                  <TableHead>{t('pages.mcpAudit.historyColSummary')}</TableHead>
                  <TableHead>{t('pages.mcpAudit.historyColCreated')}</TableHead>
                  <TableHead className="w-[100px]">{t('pages.mcpAudit.historyColActions')}</TableHead>
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
                          (item.result.overallRisk as McpAuditData['overallRisk']) ?? 'medium',
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
                        <Link to="/mcp-audit/history/$id" params={{ id: item.id }}>
                          {t('pages.mcpAudit.historyColView')}
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
              <Link to="/mcp-audit/run" search={{ mcpSlug: undefined }}>
                {t('pages.mcpAudit.historyNewAudit')}
              </Link>
            </Button>
          </div>
        </>
      )}
    </McpAuditShell>
  );
}
