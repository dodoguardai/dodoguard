/**
 * N8N Config Audit — history list (localStorage).
 */

import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { History, Workflow } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { riskVariant } from './utils';
import type { N8nConfigAuditData } from '@/services/api/n8n-config-audit';

export function N8nConfigAuditHistoryListPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const module = getAuditModule('n8n-config');
  const items = useMemo(() => {
    if (!module?.storage) return [];
    return module.storage.list() as Array<{
      id: string;
      result: N8nConfigAuditData;
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
            <h1 className="text-2xl font-bold tracking-tight">{tr('N8N Config Audit History', 'N8N 配置审计历史')}</h1>
            <p className="text-muted-foreground text-sm">
              {tr(
                'Past audits saved in this browser. Data is stored locally and not synced across devices.',
                '历史审计结果保存在当前浏览器中，数据仅本地存储，不会跨设备同步。',
              )}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Workflow className="mx-auto mb-4 size-12 text-muted-foreground" />
            <p className="text-muted-foreground">{tr('No audit history yet.', '暂无审计历史。')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {tr('Run an audit on the N8N Config Audit page to build your history.', '请在 N8N 配置审计页面运行一次审计以生成历史记录。')}
            </p>
            <Button asChild className="mt-4">
              <Link to="/n8n-config-audit">{tr('Go to N8N Config Audit', '前往 N8N 配置审计')}</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('File', '文件')}</TableHead>
                    <TableHead>{tr('Risk', '风险')}</TableHead>
                    <TableHead>{tr('Summary', '摘要')}</TableHead>
                    <TableHead>{tr('Created', '创建时间')}</TableHead>
                    <TableHead className="w-[100px]">{tr('Actions', '操作')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.metadata?.fileName || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={riskVariant(
                            (item.metadata?.overallRisk as N8nConfigAuditData['overallRisk']) ??
                              item.result.overallRisk,
                          )}
                        >
                          {item.metadata?.overallRisk ?? item.result.overallRisk}
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
                          <Link to="/n8n-config-audit/history/$id" params={{ id: item.id }}>
                            {tr('View', '查看')}
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
                <Link to="/n8n-config-audit">{tr('New audit', '新建审计')}</Link>
              </Button>
            </div>
          </>
        )}
      </Main>
    </>
  );
}

