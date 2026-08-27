import { useMemo } from 'react';
import { AlertTriangle, Gauge, ShieldCheck, Siren, TrendingUp } from 'lucide-react';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function LlmSecurityTestingReports() {
  const moduleRows = useMemo(
    () => [
      { module: 'Prompt Extraction', failRate: 42, severity: 'high', findings: 6 },
      { module: 'Guardrail Evasion', failRate: 28, severity: 'medium', findings: 3 },
      { module: 'Policy Leak', failRate: 14, severity: 'high', findings: 2 },
      { module: 'Toxicity Safety', failRate: 8, severity: 'low', findings: 1 },
    ],
    [],
  );

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
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Eval Reports</h2>
          <p className="text-muted-foreground">
            Datadog-style risk dashboard with module analytics and findings drill-down.
          </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">Export PDF</Button>
            <Button>Create Finding Ticket</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Risk Score
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">71</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                High/Critical
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">8</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Compliance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">72% controls pass</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Siren className="h-4 w-4" />
                Escalations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">2</CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Module Risk Heatmap</CardTitle>
              <CardDescription>Failure pressure by module and strategy intensity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {moduleRows.map((row) => (
                <div key={row.module} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{row.module}</span>
                    <span className="text-muted-foreground">{row.failRate}% fail rate</span>
                  </div>
                  <Progress value={row.failRate} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Trend
              </CardTitle>
              <CardDescription>Weekly risk score movement</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <div className="rounded border p-2">W-3: score 58</div>
              <div className="rounded border p-2">W-2: score 63</div>
              <div className="rounded border p-2">W-1: score 71</div>
              <div className="rounded border p-2">Current: score 71</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Findings</CardTitle>
            <CardDescription>Prioritized by severity, exploitability, and confidence</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead>Fail Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleRows.map((row) => (
                    <TableRow key={row.module}>
                      <TableCell>{row.module}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.severity === 'high'
                              ? 'destructive'
                              : row.severity === 'medium'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {row.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.findings}</TableCell>
                      <TableCell>{row.failRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
