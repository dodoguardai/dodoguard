/**
 * Task Run View Component
 * Displays real-time task execution status
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Clock, Shield, Square, Zap } from 'lucide-react';
import { tasksApi } from '@/services/api/tasks';
import { useWebSocketStore } from '@/stores/websocket-store';

interface TaskRunViewProps {
  taskId: string;
  runId: string;
}

interface TaskRunData {
  taskId: string;
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  sessions: Array<{
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed';
    startTime: string;
    endTime?: string;
  }>;
  conversation: Array<{
    id: string;
    role: 'attacker' | 'agent';
    content: string;
    timestamp: string;
    sessionId?: string;
    riskLevel?: 'critical' | 'high' | 'medium' | 'low';
  }>;
  detection: {
    ruleResults: Array<{
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
    finalVerdict: {
      vulnerable: boolean;
      confidence: number;
      reason: string;
      riskLevel: string;
    };
  } | null;
}

export function TaskRunView({ taskId, runId }: TaskRunViewProps) {
  const [runData, setRunData] = useState<TaskRunData | null>(null);
  const { isConnected, subscribe } = useWebSocketStore();

  // Fetch initial run data
  const { data: initialData, isLoading } = useQuery({
    queryKey: ['task-run', runId],
    queryFn: () => tasksApi.getRun(runId),
    enabled: !!runId,
    refetchInterval: runData?.status === 'running' ? 2000 : false,
  });

  // Update local state when data changes
  useEffect(() => {
    if (initialData) {
      setRunData({
        ...initialData,
        status: initialData.status as TaskRunData['status'],
      });
    }
  }, [initialData]);

  // Subscribe to WebSocket updates
  useEffect(() => {
    if (isConnected && taskId) {
      subscribe(`task:${taskId}`);
      subscribe(`run:${runId}`);
    }
  }, [isConnected, taskId, runId, subscribe]);

  // Listen for WebSocket messages
  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const message = event.detail;
      if (message.type === 'task.update' && message.data.taskId === taskId) {
        setRunData((prev) =>
          prev
            ? {
                ...prev,
                status: message.data.status as TaskRunData['status'],
                ...(message.data.progress !== undefined && { progress: message.data.progress }),
                ...(message.data.currentStep && { currentStep: message.data.currentStep }),
              }
            : null,
        );
      }
    };

    window.addEventListener('websocket-message', handleMessage as EventListener);
    return () => window.removeEventListener('websocket-message', handleMessage as EventListener);
  }, [taskId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'canceled':
        return <Square className="h-4 w-4 text-gray-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-600">
            Completed
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return (
          <Badge variant="default" className="bg-blue-600">
            Running
          </Badge>
        );
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRiskBadge = (level?: string) => {
    if (!level) return null;

    switch (level) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return (
          <Badge variant="default" className="bg-yellow-600">
            Medium
          </Badge>
        );
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  if (isLoading || !runData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Task Execution</CardTitle>
            <CardDescription>Loading execution details...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Task Status Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(runData.status)}
                Task Execution Status
              </CardTitle>
              <CardDescription>
                Task ID: {runData.taskId} | Run ID: {runData.runId}
              </CardDescription>
            </div>
            {getStatusBadge(runData.status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>
                  {runData.sessions.filter((s) => s.status === 'completed').length} /{' '}
                  {runData.sessions.length} sessions
                </span>
              </div>
              <Progress
                value={
                  (runData.sessions.filter((s) => s.status === 'completed').length /
                    runData.sessions.length) *
                  100
                }
                className="h-2"
              />
            </div>

            {/* Sessions */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Attack Sessions</h4>
              <div className="grid gap-2">
                {runData.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(session.status)}
                      <span className="text-sm font-medium">{session.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(session.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(session.startTime).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversation Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Attack Conversation
          </CardTitle>
          <CardDescription>
            Real-time conversation between attacker and target agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {runData.conversation.map((message, index) => (
                <div key={message.id || index} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={message.role === 'attacker' ? 'default' : 'secondary'}>
                      {message.role === 'attacker' ? 'Attacker' : 'Agent'}
                    </Badge>
                    {getRiskBadge(message.riskLevel)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div
                    className={`p-3 rounded border ${
                      message.role === 'attacker'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <pre className="text-sm whitespace-pre-wrap font-mono">{message.content}</pre>
                  </div>
                </div>
              ))}
              {runData.conversation.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No conversation data available yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detection Results */}
      {runData.detection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Detection Results
            </CardTitle>
            <CardDescription>Vulnerability detection analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rule Results */}
            {runData.detection.ruleResults.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Rule-Based Detection</h4>
                <div className="space-y-2">
                  {runData.detection.ruleResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div>
                        <div className="font-medium text-sm">{result.ruleName}</div>
                        <div className="text-xs text-muted-foreground">{result.evidence}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.matched ? 'destructive' : 'secondary'}>
                          {result.matched ? 'Matched' : 'No Match'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(result.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LLM Result */}
            {runData.detection.llmResult && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">LLM-Based Analysis</h4>
                <div className="p-3 border rounded">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant={runData.detection.llmResult.vulnerable ? 'destructive' : 'secondary'}
                    >
                      {runData.detection.llmResult.vulnerable ? 'Vulnerable' : 'Safe'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(runData.detection.llmResult.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm">{runData.detection.llmResult.reasoning}</p>
                </div>
              </div>
            )}

            {/* Final Verdict */}
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Final Verdict</h4>
              <div className="p-3 border rounded bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    variant={
                      runData.detection.finalVerdict.vulnerable ? 'destructive' : 'secondary'
                    }
                    className="text-base px-3 py-1"
                  >
                    {runData.detection.finalVerdict.vulnerable ? 'VULNERABLE' : 'SAFE'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(runData.detection.finalVerdict.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-sm">{runData.detection.finalVerdict.reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WebSocket Connection Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-sm text-muted-foreground">
              Real-time updates: {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
