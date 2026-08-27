/**
 * Task Run Detail Page
 * Three-column layout with real-time updates via WebSocket
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { tasksApi } from '@/services/api/tasks';
import { useWebSocket } from '@/hooks/use-websocket';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

interface TaskRunPageProps {
  taskId: string;
  runId: string;
}

/** Detection shape from tasksApi.getRun; may be partial when fallback to {}. */
interface TaskRunDetection {
  ruleResults?: Array<{
    ruleId: string;
    ruleName: string;
    matched: boolean;
    evidence: string;
    severity: string;
    confidence: number;
  }>;
  llmResult?: {
    vulnerable: boolean;
    confidence: number;
    reasoning: string;
    riskLevel: string;
  };
  finalVerdict?: {
    vulnerable: boolean;
    confidence: number;
    reason: string;
    riskLevel: string;
  };
}

export function TaskRunPage({ taskId, runId }: TaskRunPageProps) {
  const router = useRouter();

  const { data: taskRun, isLoading } = useQuery({
    queryKey: ['taskRun', runId],
    queryFn: () => tasksApi.getRun(runId),
    enabled: !!runId,
  });

  // WebSocket for real-time updates
  const { connected } = useWebSocket(`/ws/task-runs/${runId}`, {
    onMessage: (message) => {
      // React Query will handle cache updates automatically
      console.log('WebSocket message:', message);
    },
  });

  const sessions = taskRun?.sessions || [];
  const conversation = taskRun?.conversation || [];
  const detection: TaskRunDetection = taskRun?.detection ?? {};

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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Task Execution</h2>
            <p className="text-muted-foreground">Real-time monitoring of attack task execution</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connected ? 'default' : 'secondary'}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
            <Button
              variant="outline"
              onClick={() =>
                router.navigate({
                  to: `/app/reports/generate?taskId=${taskId}&runId=${runId}`,
                })
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Left: Session List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>Attack conversation sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {sessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No sessions yet</p>
                    ) : (
                      sessions.map((session: any, index: number) => (
                        <div
                          key={session.id || index}
                          className="rounded-lg border p-3 hover:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Session {index + 1}</span>
                            {session.status && <Badge variant="outline">{session.status}</Badge>}
                          </div>
                          {session.timestamp && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(session.timestamp), 'HH:mm:ss')}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Center: Conversation Replay */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
                <CardDescription>Attack conversation replay</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {conversation.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No conversation yet</p>
                    ) : (
                      conversation.map((msg: any, index: number) => (
                        <div
                          key={index}
                          className={`rounded-lg p-3 ${
                            msg.role === 'attacker'
                              ? 'bg-destructive/10 border-l-4 border-destructive'
                              : 'bg-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant={msg.role === 'attacker' ? 'destructive' : 'default'}>
                              {msg.role === 'attacker' ? 'Attacker' : 'Agent'}
                            </Badge>
                            {msg.timestamp && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.timestamp), 'HH:mm:ss')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.riskLevel && (
                            <Badge
                              variant={
                                msg.riskLevel === 'high' || msg.riskLevel === 'critical'
                                  ? 'destructive'
                                  : 'default'
                              }
                              className="mt-2"
                            >
                              Risk: {msg.riskLevel}
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Right: Risk Assessment */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Risk Assessment</CardTitle>
                <CardDescription>Detection results and verdict</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {/* Rule Results */}
                    {detection.ruleResults && (
                      <div>
                        <h4 className="font-semibold mb-2">Rule Detection</h4>
                        <div className="space-y-2">
                          {detection.ruleResults.map((rule: any, index: number) => (
                            <div
                              key={index}
                              className={`rounded-lg border p-3 ${
                                rule.matched ? 'bg-destructive/10 border-destructive' : 'bg-muted'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{rule.ruleName}</span>
                                <Badge variant={rule.matched ? 'destructive' : 'secondary'}>
                                  {rule.matched ? 'Matched' : 'Not Matched'}
                                </Badge>
                              </div>
                              {rule.evidence && (
                                <p className="text-xs text-muted-foreground">{rule.evidence}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  Severity: {rule.severity}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Confidence: {(rule.confidence * 100).toFixed(0)}%
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* LLM Result */}
                    {detection.llmResult && (
                      <div>
                        <h4 className="font-semibold mb-2">LLM Detection</h4>
                        <div
                          className={`rounded-lg border p-3 ${
                            detection.llmResult.vulnerable
                              ? 'bg-destructive/10 border-destructive'
                              : 'bg-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge
                              variant={detection.llmResult.vulnerable ? 'destructive' : 'default'}
                            >
                              {detection.llmResult.vulnerable ? 'Vulnerable' : 'Safe'}
                            </Badge>
                            <Badge variant="outline">
                              {(detection.llmResult.confidence * 100).toFixed(0)}% confidence
                            </Badge>
                          </div>
                          {detection.llmResult.reasoning && (
                            <p className="text-sm text-muted-foreground">
                              {detection.llmResult.reasoning}
                            </p>
                          )}
                          {detection.llmResult.riskLevel && (
                            <Badge variant="outline" className="mt-2">
                              Risk Level: {detection.llmResult.riskLevel}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Final Verdict */}
                    {detection.finalVerdict && (
                      <div>
                        <h4 className="font-semibold mb-2">Final Verdict</h4>
                        <div
                          className={`rounded-lg border p-4 ${
                            detection.finalVerdict.vulnerable
                              ? 'bg-destructive/10 border-destructive'
                              : 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge
                              variant={
                                detection.finalVerdict.vulnerable ? 'destructive' : 'default'
                              }
                              className="text-base"
                            >
                              {detection.finalVerdict.vulnerable ? 'VULNERABLE' : 'SAFE'}
                            </Badge>
                            <Badge variant="outline" className="text-base">
                              {(detection.finalVerdict.confidence * 100).toFixed(0)}% confidence
                            </Badge>
                          </div>
                          {detection.finalVerdict.reason && (
                            <p className="text-sm mt-2">{detection.finalVerdict.reason}</p>
                          )}
                          {detection.finalVerdict.riskLevel && (
                            <Badge
                              variant={
                                detection.finalVerdict.riskLevel === 'critical' ||
                                detection.finalVerdict.riskLevel === 'high'
                                  ? 'destructive'
                                  : 'default'
                              }
                              className="mt-2"
                            >
                              Risk: {detection.finalVerdict.riskLevel.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </Main>
    </>
  );
}
