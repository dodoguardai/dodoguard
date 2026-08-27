import { useMemo } from 'react';
import { Activity, AlertTriangle, Clock3, Filter, PlayCircle, TerminalSquare } from 'lucide-react';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type LlmSecurityTestingRunsProps = {
  showChrome?: boolean;
};

export function LlmSecurityTestingRuns({ showChrome = true }: LlmSecurityTestingRunsProps) {
  const runRows = useMemo(
    () => [
      {
        id: 'run_20260324_001',
        model: 'openai/gpt-4.1',
        modules: 8,
        progress: 82,
        status: 'running',
        risk: 'high',
      },
      {
        id: 'run_20260324_000',
        model: 'anthropic/claude-sonnet',
        modules: 8,
        progress: 100,
        status: 'completed',
        risk: 'medium',
      },
    ],
    [],
  );

  const body = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Eval Runs</h2>
          <p className="text-muted-foreground">
            Observability-style execution console for LLM security jobs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button>
            <PlayCircle className="mr-2 h-4 w-4" />
            New Run
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Running
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">0</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              Avg Duration
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">12m 42s</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4" />
              Recent Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Pipeline healthy</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              High Risk Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">1</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run Explorer</CardTitle>
          <CardDescription>Dense table view for drill-down and triage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input placeholder="Search run ID..." />
            <Input placeholder="Filter model..." />
            <Input placeholder="Filter status..." />
            <Input placeholder="Filter risk..." />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.id}</TableCell>
                    <TableCell>{row.model}</TableCell>
                    <TableCell>{row.modules}</TableCell>
                    <TableCell className="w-52">
                      <div className="flex items-center gap-2">
                        <Progress value={row.progress} className="h-2" />
                        <span className="text-muted-foreground text-xs">{row.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'running' ? 'default' : 'secondary'}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.risk === 'high'
                            ? 'destructive'
                            : row.risk === 'medium'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {row.risk}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline Timeline</CardTitle>
            <CardDescription>Execution stage durations and retries</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Badge variant="outline">Probe Generation: 3m</Badge>
              <Badge variant="outline">Execution: 7m</Badge>
              <Badge variant="outline">Scoring: 2m</Badge>
            </div>
            <div className="rounded border p-3">
              Timeline chart placeholder for Grafana-like panel integration.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live Logs</CardTitle>
            <CardDescription>Streaming run diagnostics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            <div className="rounded border p-2">[12:41:03] module=prompt-extraction started</div>
            <div className="rounded border p-2">[12:41:26] strategy=multi-turn probe=42 passed</div>
            <div className="rounded border p-2">[12:41:44] risk=high finding=policy-leak</div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  if (!showChrome) {
    return <div className="flex flex-col gap-4 sm:gap-6">{body}</div>;
  }

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">{body}</Main>
    </>
  );
}
