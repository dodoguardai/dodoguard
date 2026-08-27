/**
 * Security operations work queue — links into testing, findings, and admission flows.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ADMISSION_OVERVIEW_STATS } from '../constants/admission-overview';
import type { DashboardStats } from '@/types/entities';

interface SecurityTodosProps {
  stats?: DashboardStats | null;
}

type TodoItem = {
  id: string;
  label: string;
  count: number;
  urgency?: 'default' | 'warning' | 'danger';
  href?: string;
  onClick?: () => void;
};

export function SecurityTodos({ stats }: SecurityTodosProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const admission = ADMISSION_OVERVIEW_STATS;

  const highRiskFindings =
    (stats?.criticalVulnerabilities ?? 0) + (stats?.highVulnerabilities ?? 0);
  const runningTasks = stats?.runningTasks ?? 0;

  const todos = [
    {
      id: 'admission-review',
      label: t('pages.dashboard.todos.admissionReview'),
      count: admission.pendingReview,
      urgency: admission.pendingReview > 0 ? ('warning' as const) : ('default' as const),
      href: '/admission/index.html#overview',
    },
    {
      id: 'admission-remediation',
      label: t('pages.dashboard.todos.admissionRemediation'),
      count: admission.pendingRemediation,
      urgency: admission.overdue > 0 ? ('danger' as const) : ('default' as const),
      href: '/admission/index.html#offline',
    },
    {
      id: 'admission-overdue',
      label: t('pages.dashboard.todos.admissionOverdue'),
      count: admission.overdue,
      urgency: admission.overdue > 0 ? ('danger' as const) : ('default' as const),
      href: '/admission/index.html#offline?tab=remediation',
    },
    {
      id: 'admission-materials',
      label: t('pages.dashboard.todos.admissionMaterials'),
      count: admission.materialPending,
      href: '/admission/index.html#applications',
    },
    {
      id: 'admission-security-test',
      label: t('pages.dashboard.todos.admissionSecurityTest'),
      count: admission.pendingSecurityTest,
      href: '/admission/index.html#applications',
    },
    {
      id: 'running-detect',
      label: t('pages.dashboard.todos.runningDetect'),
      count: runningTasks,
      urgency: runningTasks > 0 ? ('warning' as const) : ('default' as const),
      onClick: () => navigate({ to: '/tasks', search: { surface: 'all', status: 'running' } }),
    },
    {
      id: 'high-risk-findings',
      label: t('pages.dashboard.todos.highRiskFindings'),
      count: highRiskFindings,
      urgency: highRiskFindings > 0 ? ('danger' as const) : ('default' as const),
      onClick: () =>
        navigate({
          to: '/findings',
          search: {
            riskLevel: 'high',
            status: undefined,
            search: undefined,
            page: 1,
            agentId: undefined,
          },
        }),
    },
  ].filter((item) => item.count > 0) satisfies TodoItem[];

  const urgencyVariant = (urgency?: TodoItem['urgency']) => {
    if (urgency === 'danger') return 'destructive';
    if (urgency === 'warning') return 'default';
    return 'secondary';
  };

  const handleRowClick = (item: TodoItem) => {
    if (item.onClick) {
      item.onClick();
      return;
    }
    if (item.href) {
      window.location.href = item.href;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.dashboard.todos.title')}</CardTitle>
        <CardDescription>{t('pages.dashboard.todos.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('pages.dashboard.todos.item')}</TableHead>
              <TableHead className="w-24 text-right">{t('pages.dashboard.todos.count')}</TableHead>
              <TableHead className="w-24 text-right">{t('pages.dashboard.todos.priority')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {todos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t('pages.dashboard.todos.empty')}
                </TableCell>
              </TableRow>
            ) : (
              todos.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleRowClick(item)}
                >
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                  <TableCell className="text-right">
                    {item.urgency === 'danger' ? (
                      <Badge variant={urgencyVariant(item.urgency)}>
                        {t('pages.dashboard.todos.urgent')}
                      </Badge>
                    ) : item.urgency === 'warning' ? (
                      <Badge variant={urgencyVariant(item.urgency)}>
                        {t('pages.dashboard.todos.attention')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
