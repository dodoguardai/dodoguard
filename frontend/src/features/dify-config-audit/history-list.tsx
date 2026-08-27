/**
 * Dify Config Gray-Box Scanning — history list (localStorage).
 */

import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
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
import { FileCode2, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { riskVariant } from './utils';
import type { DifyConfigAuditData } from '@/services/api/dify-config-audit';

export function DifyConfigAuditHistoryListPage() {
  const module = getAuditModule('dify-config');
  const items = useMemo(() => {
    if (!module?.storage) return [];
    return module.storage.list() as Array<{
      id: string;
      result: DifyConfigAuditData;
      metadata?: { fileName?: string; overallRisk?: string };
      createdAt: string;
    }>;
  }, [module]);

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className="mb-6 flex items-center gap-2">
          <History className="size-8" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dify Audit History</h1>
            <p className="text-muted-foreground text-sm">
              Past audits saved in this browser. Data is stored locally and not synced across
              devices.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <FileCode2 className="mx-auto mb-4 size-12 text-muted-foreground" />
            <p className="text-muted-foreground">No audit history yet.</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Run an audit on the Dify Config Gray-Box Scanning page to build your history.
            </p>
            <Button asChild className="mt-4">
              <Link to="/dify-config-audit">Go to Dify Config Gray-Box Scanning</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
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
                            (item.result.overallRisk as DifyConfigAuditData['overallRisk']) ??
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
                          <Link to="/dify-config-audit/history/$id" params={{ id: item.id }}>
                            View
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
                <Link to="/dify-config-audit">New audit</Link>
              </Button>
            </div>
          </>
        )}
      </Main>
    </>
  );
}
