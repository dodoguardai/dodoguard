import { useEffect, useMemo } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { zodResolverV4 } from '@/lib/zod-resolver';
import {
  mergeTaskDetectionConfigUpdate,
  parseTaskDetectionConfig,
} from '@/features/tasks/parse-task-detection-config';
import { agentsApi } from '@/services/api/agents';
import { tasksApi } from '@/services/api/tasks';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import type { AttackTask } from '@/types/entities';

const detectionEditSchema = z
  .object({
    useRule: z.boolean(),
    useLLM: z.boolean(),
    useKnowledgeBase: z.boolean(),
    llmModel: z.string(),
    confidenceThresholdStr: z.string().optional(),
    successDescription: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.useRule && !d.useLLM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enable at least one of rules or LLM',
        path: ['useRule'],
      })
    }
    if (d.useLLM && !d.llmModel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an LLM model for judgment',
        path: ['llmModel'],
      })
    }
  })

function createTaskEditSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().nullable(),
    attackMode: z.enum(['simple', 'conversation', 'composite']),
    vulnerabilities: z
      .array(z.string())
      .min(1, t('pages.tasks.createWizard.step3.errorSelectAtLeastOne')),
    agentId: z.string().min(1, 'Please select an agent'),
    detection: detectionEditSchema,
  });
}

type TaskEditFormValues = z.infer<ReturnType<typeof createTaskEditSchema>>;

interface TaskEditProps {
  taskId: string;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function TaskEdit({ taskId, onCancel, onSuccess }: TaskEditProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const {
    data: taskResponse,
    isLoading: isTaskLoading,
    isError: isTaskError,
  } = useQuery({
    queryKey: ['attack-tasks', taskId],
    queryFn: () => tasksApi.get(taskId),
  });

  const { data: vulnerabilitiesResponse, isLoading: isVulnsLoading } = useQuery({
    queryKey: ['vulnerabilities', 'for-task-edit'],
    queryFn: () =>
      vulnerabilitiesApi.list({
        limit: 1000,
      }),
  });

  // tasksApi.get already returns an AttackTask, not an ApiResponse wrapper
  const task = taskResponse as AttackTask | undefined;
  const vulnerabilities = vulnerabilitiesResponse?.data || [];

  const { data: agentsResponse, isLoading: isAgentsLoading } = useQuery({
    queryKey: ['target-agents', 'for-task-edit'],
    queryFn: () => agentsApi.list(),
  });

  const agents = agentsResponse?.data || [];

  const { modelOptions: availableModels, isLoading: isLoadingModels } = useLlmModelOptions();
  const defaultModels = [
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  ]
  const modelOptions = availableModels.length > 0 ? availableModels : defaultModels

  const taskEditSchema = useMemo(() => createTaskEditSchema(t), [t]);

  const form = useForm<TaskEditFormValues>({
    resolver: zodResolverV4<TaskEditFormValues>(taskEditSchema),
    defaultValues: {
      name: '',
      description: '',
      attackMode: 'simple',
      vulnerabilities: [],
      agentId: '',
      detection: {
        useRule: true,
        useLLM: false,
        useKnowledgeBase: false,
        llmModel: '',
        confidenceThresholdStr: '',
        successDescription: '',
      },
    },
  });

  useEffect(() => {
    if (task) {
      const existingTargetConfig = (task.targetConfig || {}) as any;
      const existingAgentId = existingTargetConfig.agentId as string | undefined;
      const dc = parseTaskDetectionConfig(task.detectionConfig);
      const th = dc.llmConfig?.confidenceThreshold
      form.reset({
        name: task.name || '',
        description: task.description || '',
        attackMode: task.attackMode || 'simple',
        vulnerabilities: Array.isArray(task.vulnerabilities) ? task.vulnerabilities : [],
        agentId: existingAgentId || '',
        detection: {
          useRule: dc.useRule,
          useLLM: dc.useLLM,
          useKnowledgeBase: dc.useKnowledgeBase,
          llmModel: dc.llmConfig?.model || '',
          confidenceThresholdStr:
            th != null && Number.isFinite(th) ? String(th) : '',
          successDescription: dc.llmConfig?.successDescription || '',
        },
      });
    }
  }, [task, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: TaskEditFormValues) => {
      const prevTargetConfig = (task?.targetConfig || {}) as any;
      const newTargetConfig = {
        ...prevTargetConfig,
        agentId: values.agentId,
      };

      const thRaw = values.detection.confidenceThresholdStr?.trim();
      const thParsed = thRaw ? Number.parseFloat(thRaw) : undefined;
      const confidenceThreshold =
        thParsed != null && Number.isFinite(thParsed) ? thParsed : undefined;

      const detectionConfig = mergeTaskDetectionConfigUpdate(task!.detectionConfig, {
        useRule: values.detection.useRule,
        useLLM: values.detection.useLLM,
        useKnowledgeBase: values.detection.useKnowledgeBase,
        llmModel: values.detection.llmModel,
        confidenceThreshold,
        successDescription: values.detection.successDescription,
      });

      return tasksApi.update(taskId, {
        name: values.name,
        description: values.description ?? undefined,
        attackMode: values.attackMode,
        vulnerabilities: values.vulnerabilities,
        targetConfig: newTargetConfig,
        detectionConfig: detectionConfig as AttackTask['detectionConfig'],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attack-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['attack-tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['attack-task', taskId] });
      toast.success('Task updated successfully. You can now re-run it from the list.');
      if (onSuccess) {
        onSuccess();
      } else {
        navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update task');
    },
  });

  const onSubmit = (values: TaskEditFormValues) => {
    updateMutation.mutate(values);
  };

  const selectedVulnerabilities = form.watch('vulnerabilities') || [];
  const detectionUseLLM = form.watch('detection.useLLM');
  const taskKindMeta = (task?.metadata as Record<string, unknown> | undefined)?.taskKind as
    | 'api_test'
    | 'config_audit'
    | 'config_static'
    | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Task</CardTitle>
        <CardDescription>
          Update task name, target agent, vulnerabilities, and detection settings (rules / LLM model).
          After saving, re-run the task from the list to apply changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isTaskError && (
          <div className="text-sm text-red-500 mb-4">
            Failed to load task details. Please try again.
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Task name" {...field} />
                  </FormControl>
                  <FormDescription>
                    This name will be shown in the task list and findings.
                  </FormDescription>
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
                      rows={4}
                      placeholder="Describe what this task does"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description to help you remember the purpose of this task.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Agent</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={isAgentsLoading}
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue
                          placeholder={
                            isAgentsLoading ? 'Loading agents...' : 'Select an agent to test'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    Choose which AI agent this task will attack when running.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="text-sm font-medium">Detection</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Same options as in the task wizard: rules and/or LLM judgment on responses (or YAML
                  for config-static).
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <FormField
                  control={form.control}
                  name="detection.useRule"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => field.onChange(c === true)}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal">Use detection rules</FormLabel>
                        <FormDescription>Regex / keyword / structure rules from the library.</FormDescription>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="detection.useLLM"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(c) => field.onChange(c === true)}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-normal">Use LLM judgment</FormLabel>
                        <FormDescription>
                          Structured judge model; choose the model below when enabled.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                {taskKindMeta === 'config_static' && (
                  <FormField
                    control={form.control}
                    name="detection.useKnowledgeBase"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(c) => field.onChange(c === true)}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">Static YAML LLM audit</FormLabel>
                          <FormDescription>
                            Runs full DSL static analysis and fills report §6.1 summary when the task
                            completes.
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                )}
              </div>
              {detectionUseLLM && (
                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="detection.llmModel"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>LLM model</FormLabel>
                        {isLoadingModels ? (
                          <Skeleton className="h-10 w-full max-w-md" />
                        ) : (
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="max-w-md">
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {modelOptions.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormDescription>
                          Used for output judgment (and static YAML audit when enabled).
                          {availableModels.length > 0
                            ? ' Lists models from Enterprise → Integrations (LLM).'
                            : ''}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="detection.confidenceThresholdStr"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confidence threshold (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.7"
                            className="max-w-48"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>0–1, reserved for extended config.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="detection.successDescription"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Additional notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Optional judge hints" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="attackMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Testing Mode</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange} disabled>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Simple Scanning" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple Scanning</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>
                    All tasks use Simple Scanning. Saving updates stored mode to match.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vulnerabilities"
              render={() => (
                <FormItem>
                  <FormLabel>Vulnerabilities</FormLabel>
                  <FormDescription>
                    Select which vulnerabilities this task should test. At least one is required.
                  </FormDescription>
                  <div className="mt-2 max-h-[320px] overflow-y-auto rounded-md border p-3 space-y-2">
                    {isVulnsLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-5/6" />
                        <Skeleton className="h-6 w-4/6" />
                      </div>
                    ) : vulnerabilities.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No vulnerabilities found. Please configure vulnerabilities first.
                      </div>
                    ) : (
                      vulnerabilities.map((vuln) => (
                        <label
                          key={vuln.id}
                          className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedVulnerabilities.includes(vuln.id)}
                            onCheckedChange={(checked) => {
                              const current = selectedVulnerabilities;
                              const updated = checked
                                ? Array.from(new Set([...current, vuln.id]))
                                : current.filter((id) => id !== vuln.id);
                              form.setValue('vulnerabilities', updated, { shouldValidate: true });
                            }}
                          />
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium leading-none">{vuln.name}</div>
                            {vuln.description && (
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {vuln.description}
                              </div>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onCancel
                    ? onCancel()
                    : navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } })
                }
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isTaskLoading || isVulnsLoading || isAgentsLoading || updateMutation.isPending
                }
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
