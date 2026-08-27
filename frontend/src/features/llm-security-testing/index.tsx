import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  Gauge,
  ShieldAlert,
  ListTodo,
} from 'lucide-react';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
} from '@/components/ui/card';
import { LlmSecurityTestingRuns } from '@/features/llm-security-testing/runs';
import { LlmSecurityTestingSetup } from '@/features/llm-security-testing/setup';

type TabValue = 'setup' | 'runs';

export function LlmSecurityTesting() {
  const [tab, setTab] = useState<TabValue>('setup');

  const kpis = useMemo(
    () => [
      { title: 'Estimated runtime', value: '14m', icon: Activity, hint: 'Based on selected modules' },
      { title: 'Modules enabled', value: '4', icon: Gauge, hint: 'Active category coverage' },
      { title: 'Max concurrency', value: '4', icon: ListTodo, hint: 'Parallel probes' },
      { title: 'Risk threshold', value: '70', icon: ShieldAlert, hint: 'Escalation boundary' },
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">LLM Security Testing</h2>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Configure modules, run evaluations, and inspect results in an observability-style console.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Setup → Runs → Reports</Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/reports">Reports</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.title} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-muted-foreground text-xs">{k.title}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
                </div>
                <k.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-2 text-muted-foreground text-xs">{k.hint}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {tab === 'setup' ? 'Security evaluation setup' : 'Execution console'}
                </div>
                <div className="text-muted-foreground text-xs">
                  {tab === 'setup' ? 'Target → Model → Modules → Strategies → Review' : 'Monitor progress, triage, and inspect findings'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={tab === 'setup' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTab('setup')}
                >
                  Setup
                </Button>
                <Button
                  type="button"
                  variant={tab === 'runs' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTab('runs')}
                >
                  Runs
                </Button>

                {tab === 'setup' ? (
                  <Button size="sm" onClick={() => setTab('runs')}>
                    Create Attack Task
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/reports">View Reports</Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="p-4">
              {tab === 'setup' ? (
                <LlmSecurityTestingSetup showChrome={false} onRun={() => setTab('runs')} />
              ) : (
                <LlmSecurityTestingRuns showChrome={false} />
              )}
            </div>
          </Card>
        </div>
      </Main>
    </>
  );
}
