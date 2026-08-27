/**
 * Security Analytics Tab
 * Uses real dashboard stats: task trend, security metrics, risk distribution, tasks by status.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Overview } from './overview';
import type { DashboardStats } from '@/types/entities';
import { Target, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';

export interface AnalyticsProps {
  stats?: DashboardStats | null;
  organizationId?: string | null;
  isLoading?: boolean;
  hasNoOrg?: boolean;
  onNavigateToOrganizations?: () => void;
}

function SimpleBarList({
  items,
  valueFormatter,
  barClass,
}: {
  items: { name: string; value: number }[];
  valueFormatter: (n: number) => string;
  barClass: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const width = `${Math.round((i.value / max) * 100)}%`;
        return (
          <li key={i.name} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate text-xs text-muted-foreground">{i.name}</div>
              <div className="h-2.5 w-full rounded-full bg-muted">
                <div className={`h-2.5 rounded-full ${barClass}`} style={{ width }} />
              </div>
            </div>
            <div className="ps-2 text-xs font-medium tabular-nums">{valueFormatter(i.value)}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function Analytics({
  stats,
  organizationId: _organizationId,
  isLoading,
  hasNoOrg,
  onNavigateToOrganizations,
}: AnalyticsProps) {
  if (hasNoOrg) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Select an organization to view analytics.
          </p>
          {onNavigateToOrganizations && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={onNavigateToOrganizations}>
                Manage organizations
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="mt-1 h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48" />
            </CardContent>
          </Card>
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalTasks = stats?.totalTasks ?? 0;
  const completedTasks = stats?.completedTasks ?? 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const highRiskFindings =
    (stats?.criticalVulnerabilities ?? 0) + (stats?.highVulnerabilities ?? 0);
  const quota = stats?.quotaUsage?.attackTasksPerMonth;
  const tasksThisMonth = quota?.used ?? 0;
  const tasksLimit = quota?.limit ?? 0;

  const riskItems =
    stats?.riskDistribution?.map((r) => ({
      name: r.level.charAt(0).toUpperCase() + r.level.slice(1),
      value: r.count,
    })) ?? [];
  const tasksByStatusItems = [
    { name: 'Completed', value: stats?.completedTasks ?? 0 },
    { name: 'Running', value: stats?.runningTasks ?? 0 },
    { name: 'Failed', value: stats?.failedTasks ?? 0 },
    {
      name: 'Pending',
      value: Math.max(
        0,
        (stats?.totalTasks ?? 0) -
          (stats?.completedTasks ?? 0) -
          (stats?.runningTasks ?? 0) -
          (stats?.failedTasks ?? 0),
      ),
    },
  ].filter((i) => i.value > 0);
  const hasTasksByStatus = tasksByStatusItems.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Attack tasks over time</CardTitle>
          <CardDescription>Monthly task count (last 12 months)</CardDescription>
        </CardHeader>
        <CardContent className="px-6">
          <Overview data={stats?.monthlyActivity} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks this month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tasksThisMonth}/{tasksLimit}
            </div>
            <p className="text-xs text-muted-foreground">Attack tasks created this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High-risk findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highRiskFindings}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalVulnerabilities ?? 0} total findings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active agents</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeAgents ?? 0}</div>
            <p className="text-xs text-muted-foreground">Target agents in scope</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle>Findings by risk</CardTitle>
            <CardDescription>Vulnerability count by risk level</CardDescription>
          </CardHeader>
          <CardContent>
            {riskItems.length > 0 ? (
              <SimpleBarList
                items={riskItems}
                barClass="bg-primary"
                valueFormatter={(n) => `${n}`}
              />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No findings by risk yet
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Tasks by status</CardTitle>
            <CardDescription>Breakdown of attack tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {hasTasksByStatus ? (
              <SimpleBarList
                items={tasksByStatusItems}
                barClass="bg-muted-foreground"
                valueFormatter={(n) => `${n}`}
              />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No tasks yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
