/**
 * Create Attack Task Form Component
 */

import { useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Shield, Target, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { markAttackTaskRunJustStarted } from '@/features/tasks/active-run-session';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { tasksApi } from '@/services/api/tasks';
import type { CreateAttackTaskRequest } from '@/types/api';
import type { AttackTask } from '@/types/entities';

// NOTE:
// This form is currently not used in the main task creation flow.
// The configuration-mode wizard uses its own schema (taskFormSchema).
// Keeping this schema simple and aligned with the backend prevents
// zod resolver runtime issues when this component is bundled.
const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required'),
  description: z.string().optional(),
  targetType: z.enum(['agent']),
  targetConfig: z.record(z.string(), z.unknown()),
  vulnerabilities: z.array(z.string()).min(1, 'At least one vulnerability must be selected'),
  attackMode: z.enum(['simple', 'conversation', 'composite']),
  detectionConfig: z.record(z.string(), z.unknown()),
  agentConfig: z.record(z.string(), z.unknown()).optional(),
});

type CreateTaskFormData = z.infer<typeof createTaskSchema>;

const RUN_AFTER_CREATE_STORAGE_KEY = 'attack-task-wizard-run-after-create';

// Mock vulnerability options
const vulnerabilityOptions = [
  { id: 'vuln-agent-excessive-agency', name: 'Excessive Agency', category: 'Agent' },
  { id: 'vuln-agent-prompt-injection', name: 'Prompt Injection', category: 'Agent' },
  { id: 'vuln-agent-jailbreak', name: 'Jailbreak Attacks', category: 'Agent' },
  { id: 'vuln-llm-data-exfiltration', name: 'Data Exfiltration', category: 'LLM' },
  { id: 'vuln-llm-toxic-content', name: 'Toxic Content Generation', category: 'LLM' },
];

interface CreateTaskFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreateTaskForm({ onSuccess, onCancel }: CreateTaskFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedVulnerabilities, setSelectedVulnerabilities] = useState<string[]>([]);
  const [runAfterCreate, setRunAfterCreate] = useState(() => {
    try {
      const v = localStorage.getItem(RUN_AFTER_CREATE_STORAGE_KEY);
      return v === 'true';
    } catch {
      return false;
    }
  });

  const setRunAfterCreatePersist = (value: boolean) => {
    setRunAfterCreate(value);
    try {
      localStorage.setItem(RUN_AFTER_CREATE_STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  };

  const form = useForm<CreateTaskFormData>({
    resolver: zodResolverV4<CreateTaskFormData>(createTaskSchema),
    defaultValues: {
      targetType: 'agent',
      attackMode: 'simple',
      vulnerabilities: [],
      detectionConfig: {
        useRule: true,
        useLLM: true,
        useKnowledgeBase: false,
      },
      agentConfig: {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
      },
      targetConfig: {
        agent: {
          apiBaseUrl: '',
          apiKey: '',
          userId: '',
        },
      },
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      shouldRun,
    }: {
      payload: CreateAttackTaskRequest;
      shouldRun: boolean;
    }) => {
      const task = await tasksApi.create(payload);
      let runStartedSuccessfully = false;
      if (shouldRun) {
        try {
          await tasksApi.run({ taskId: task.id });
          runStartedSuccessfully = true;
        } catch (runErr: unknown) {
          const msg = runErr instanceof Error ? runErr.message : String(runErr);
          toast.error(`Task created, but failed to start run: ${msg}`);
        }
      }
      return { task, runStartedSuccessfully };
    },
    onSuccess: ({ task, runStartedSuccessfully }, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      if (variables.shouldRun && runStartedSuccessfully) {
        markAttackTaskRunJustStarted(task.id);
        queryClient.setQueryData<AttackTask>(['attack-task', task.id], (prev) => ({
          ...(prev ?? (task as AttackTask)),
          ...(task as AttackTask),
          status: 'running',
        }));
        toast.success('Attack task created and run started');
      } else {
        toast.success('Attack task created successfully');
      }
      onSuccess?.();
      navigate({ to: `/tasks/${task.id}` });
    },
    onError: (error: any) => {
      toast.error(`Failed to create task: ${error?.message || 'Unknown error'}`);
    },
  });

  const onSubmit = (data: CreateTaskFormData) => {
    const detectionConfig = data.detectionConfig as Record<string, unknown>;
    const submitData = {
      ...data,
      vulnerabilities: selectedVulnerabilities,
      detectionConfig: {
        useRule: Boolean(detectionConfig?.useRule),
        useLLM: Boolean(detectionConfig?.useLLM),
        useKnowledgeBase: Boolean(detectionConfig?.useKnowledgeBase),
        ruleSetId: detectionConfig?.ruleSetId as string | undefined,
      },
    };
    createMutation.mutate({
      payload: submitData as CreateAttackTaskRequest,
      shouldRun: runAfterCreate,
    });
  };

  const toggleVulnerability = (vulnerabilityId: string) => {
    setSelectedVulnerabilities((prev) =>
      prev.includes(vulnerabilityId)
        ? prev.filter((id) => id !== vulnerabilityId)
        : [...prev, vulnerabilityId],
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="target">Target</TabsTrigger>
            <TabsTrigger value="vulnerabilities">Vulnerabilities</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>Provide basic details for your attack task</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter task name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what this attack task will test"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="targetType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value as string}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select target type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="agent">AI Agent</SelectItem>
                            <SelectItem value="mcp">MCP Server</SelectItem>
                            <SelectItem value="llm">LLM API</SelectItem>
                            <SelectItem value="tool">Tool/Service</SelectItem>
                            <SelectItem value="platform">Platform</SelectItem>
                            <SelectItem value="composite">Composite Target</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="attackMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Testing Mode</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Simple Scanning" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="simple">Simple Scanning</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>Only Simple Scanning is available.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="target" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Target Configuration
                </CardTitle>
                <CardDescription>Configure the target system for testing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="targetConfig.agent.apiBaseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Base URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://api.dify.ai" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetConfig.agent.apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter API key" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="targetConfig.agent.userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="User identifier" {...field} />
                      </FormControl>
                      <FormDescription>
                        Optional user identifier for the target system
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vulnerabilities" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Vulnerabilities to Test
                </CardTitle>
                <CardDescription>Select the vulnerabilities you want to test for</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {vulnerabilityOptions.map((vuln) => (
                    <div key={vuln.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={vuln.id}
                        checked={selectedVulnerabilities.includes(vuln.id)}
                        onCheckedChange={() => toggleVulnerability(vuln.id)}
                      />
                      <label
                        htmlFor={vuln.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {vuln.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({vuln.category})
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                {selectedVulnerabilities.length === 0 && (
                  <p className="text-sm text-destructive mt-2">
                    Please select at least one vulnerability to test.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Detection Configuration</CardTitle>
                <CardDescription>Configure how vulnerabilities will be detected</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="detectionConfig.useRule"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Use Rule-Based Detection</FormLabel>
                          <FormDescription>
                            Enable pattern-based vulnerability detection
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="detectionConfig.useLLM"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Use LLM-Based Detection</FormLabel>
                          <FormDescription>
                            Enable AI-powered vulnerability analysis
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="detectionConfig.useKnowledgeBase"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Use Knowledge Base</FormLabel>
                          <FormDescription>Leverage historical vulnerability data</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent Configuration</CardTitle>
                <CardDescription>Configure the attack agent behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="agentConfig.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value as boolean}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Enable Attack Agent</FormLabel>
                        <FormDescription>
                          Use AI agent to perform intelligent attacks
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {Boolean(form.watch('agentConfig.enabled')) && (
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="agentConfig.provider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value as string}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select provider" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="openai">OpenAI</SelectItem>
                              <SelectItem value="anthropic">Anthropic</SelectItem>
                              <SelectItem value="google">Google</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="agentConfig.model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="gpt-4"
                              {...field}
                              value={String(field.value ?? '')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="agentConfig.temperature"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Temperature</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="2"
                              {...field}
                              value={Number(field.value) || 0}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <Checkbox
            id="legacy-run-after-create"
            checked={runAfterCreate}
            onCheckedChange={(v) => setRunAfterCreatePersist(v === true)}
          />
          <div className="grid gap-1.5 leading-none">
            <Label htmlFor="legacy-run-after-create" className="cursor-pointer font-medium">
              Start task immediately after creation
            </Label>
            <p className="text-muted-foreground text-sm">
              When enabled, the attack run begins as soon as the task is saved.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || selectedVulnerabilities.length === 0}
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Task
          </Button>
        </div>
      </form>
    </Form>
  );
}
