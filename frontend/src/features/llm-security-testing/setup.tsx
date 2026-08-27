import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Brain,
  ClipboardCheck,
  Crosshair,
  ShieldAlert,
  Target,
  Workflow,
} from 'lucide-react';
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

type LlmSecurityTestingSetupProps = {
  showChrome?: boolean;
  onRun?: () => void;
};

export function LlmSecurityTestingSetup({ showChrome = true, onRun }: LlmSecurityTestingSetupProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const steps = [
    { id: 0, label: 'Target', icon: Crosshair },
    { id: 1, label: 'Model Config', icon: Target },
    { id: 2, label: 'Attack Modules', icon: ShieldAlert },
    { id: 3, label: 'Strategies', icon: Brain },
    { id: 4, label: 'Review', icon: ClipboardCheck },
  ];
  const activeModules = useMemo(
    () => [
      { name: 'Prompt Extraction', severity: 'high' },
      { name: 'Policy Leak', severity: 'high' },
      { name: 'Guardrail Evasion', severity: 'medium' },
      { name: 'Toxicity Safety', severity: 'low' },
    ],
    [],
  );

  const handleRun = () => {
    if (onRun) {
      onRun();
      return;
    }
    navigate({ to: '/tasks', search: { surface: 'all', status: 'running' } });
  };

  const stepProgress = ((step + 1) / steps.length) * 100;

  const body = (
    <>
      <Card className="h-fit w-72 shrink-0">
        <CardHeader>
          <CardTitle className="text-base">Create Attack Task</CardTitle>
          <CardDescription>Step-by-step configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {steps.map((item) => (
            <Button
              key={item.id}
              variant={step === item.id ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setStep(item.id)}
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted/40 text-xs font-medium">
                {String(item.id + 1).padStart(2, '0')}
              </span>
              <item.icon className="mr-2 h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Security Eval Setup</h2>
            <p className="text-muted-foreground">
              Target → Model → Modules → Strategies → Review, then launch.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="secondary">
              Step {step + 1}/{steps.length}
            </Badge>
            <div className="hidden w-44 md:block">
              <Progress value={stepProgress} className="h-2" />
            </div>
          </div>
        </div>

        {step === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Target
              </CardTitle>
              <CardDescription>Choose which model or gateway to evaluate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Target model key (from Models)" />
                <Input placeholder="Provider id" />
                <Input placeholder="Execution version (optional)" />
              </div>
              <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                Secrets should be referenced by environment variable name, not stored as raw values.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                Model Config
              </CardTitle>
              <CardDescription>Runtime knobs that affect probing behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Max concurrency" />
                <Input placeholder="Delay (ms)" />
                <Input placeholder="Budget cap (calls)" />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Temperature" />
                <Input placeholder="Max output tokens" />
                <Input placeholder="Stop rules (optional)" />
              </div>
              <div className="rounded border p-3 text-sm text-muted-foreground">
                Advanced panel placeholder: retry policy, backoff, and custom transforms.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Attack Modules
              </CardTitle>
              <CardDescription>Select module categories and severities.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                {activeModules.map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">Module preset</div>
                    </div>
                    <Badge
                      variant={
                        m.severity === 'high' ? 'destructive' : m.severity === 'medium' ? 'secondary' : 'outline'
                      }
                    >
                      {m.severity}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
                Coverage metrics will update once real module mappings are wired.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Strategies
              </CardTitle>
              <CardDescription>Control probing style and escalation behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Strategy intensity (0-100)" />
                <Input placeholder="Max strategies (optional)" />
                <Input placeholder="Risk threshold" />
              </div>
              <div className="rounded border p-3 text-sm text-muted-foreground">
                Placeholder: multi-turn probe generation, transforms, and stopping rules.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Estimated Runtime</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">14m</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Modules Enabled</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{activeModules.length}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Max Concurrency</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">4</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Risk Threshold</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">70</CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Review & Launch
                </CardTitle>
                <CardDescription>
                  Final checks before execution: readiness gates and module coverage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Config completeness</span>
                    <span>86%</span>
                  </div>
                  <Progress value={86} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Module coverage</span>
                    <span>74%</span>
                  </div>
                  <Progress value={74} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Policy mapping</span>
                    <span>69%</span>
                  </div>
                  <Progress value={69} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              Step {step + 1}/{steps.length}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((v) => v - 1)}>
              Back
            </Button>
            <Button disabled={step === steps.length - 1} onClick={() => setStep((v) => v + 1)}>
              Next
            </Button>
            <Button disabled={step !== steps.length - 1} onClick={handleRun}>
              Run
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  if (!showChrome) {
    return <div className="flex gap-4 sm:gap-6">{body}</div>;
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
      <Main className="flex flex-1 gap-4 sm:gap-6">{body}</Main>
    </>
  );
}
