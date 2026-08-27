/**
 * Step 2: Select Target
 */

import { useEffect, useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Bot, Target } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
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
import { agentsApi } from '@/services/api/agents';
import {
  getRegisteredAgentIdsFromTargetConfig,
  MAX_AGENTS_PER_BATCH,
} from '../task-wizard-agent-target';

import type { TaskFormData } from '../configuration-mode-wizard';

type Surface =
  | 'all'
  | 'agent'
  | 'coze'
  | 'fastgpt'
  | 'n8n'
  | 'tencent-adp'
  | 'mcp'
  | 'tool'
  | 'platform'
  | 'llm';

interface Step2SelectTargetProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function Step2SelectTarget({ form, surface = 'all' }: Step2SelectTargetProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step2';
  const targetTypes = useMemo(
    () => [
      {
        value: 'agent' as const,
        label: t(`${p}.agentTypeLabel`),
        icon: Bot,
        description: t(`${p}.agentTypeDesc`),
      },
    ],
    [t, p],
  );
  const targetType = form.watch('targetType');
  const agentPlatform =
    surface === 'coze'
      ? 'coze'
      : surface === 'fastgpt'
        ? 'fastgpt'
        : surface === 'n8n'
          ? 'n8n'
          : surface === 'tencent-adp'
            ? 'tencent-adp'
            : 'dify';

  const {
    data: agents,
    isLoading: agentsLoading,
    isFetched: agentsFetched,
  } = useQuery({
    queryKey: ['target-agents', targetType, agentPlatform],
    queryFn: () => agentsApi.list({ type: agentPlatform }),
    enabled: targetType === 'agent',
  });

  useEffect(() => {
    if (targetType !== 'agent' || !agents?.data) {
      return;
    }
    const list = agents.data;
    if (list.length === 0) {
      return;
    }
    const ids = getRegisteredAgentIdsFromTargetConfig(form.getValues('targetConfig'));
    const valid = ids.filter((id) => list.some((a) => a.id === id));
    if (valid.length !== ids.length) {
      form.setValue('targetConfig.agentIds', valid);
    }
  }, [targetType, agents?.data, form]);

  const renderTargetConfig = () => {
    switch (targetType) {
      case 'agent': {
        const rawWatch = form.watch('targetConfig.agentIds');
        const selectedIds = Array.isArray(rawWatch)
          ? rawWatch.filter((x): x is string => typeof x === 'string')
          : [];

        const setAgentIds = (next: string[]) => {
          form.setValue('targetConfig.agentIds', next, { shouldValidate: true });
        };

        const toggleAgent = (agentId: string, checked: boolean) => {
          const cur = getRegisteredAgentIdsFromTargetConfig(form.getValues('targetConfig'));
          if (checked) {
            if (cur.includes(agentId) || cur.length >= MAX_AGENTS_PER_BATCH) {
              return;
            }
            setAgentIds([...cur, agentId]);
          } else {
            setAgentIds(cur.filter((id) => id !== agentId));
          }
        };

        const selectAllListed = () => {
          const all = agents?.data?.map((a) => a.id) ?? [];
          setAgentIds(all.slice(0, MAX_AGENTS_PER_BATCH));
        };

        const clearListed = () => {
          setAgentIds([]);
        };

        const agentIdsErr = (
          form.formState.errors.targetConfig as { agentIds?: { message?: string } } | undefined
        )?.agentIds?.message;

        const agentRows = agents?.data ?? [];
        const showList = !agentsLoading && agentRows.length > 0;

        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel className="text-base">
                {surface === 'coze'
                  ? t(`${p}.labelAgentCoze`)
                  : surface === 'fastgpt'
                    ? t(`${p}.labelAgentFastgpt`)
                    : surface === 'n8n'
                      ? t(`${p}.labelAgentN8n`)
                      : t(`${p}.labelAgentDify`)}
                <span className="text-muted-foreground ml-2 font-normal text-sm">
                  {t(`${p}.multiSelectBadge`)}
                </span>
              </FormLabel>
              <div
                className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm leading-snug text-foreground"
                role="note"
              >
                {t(`${p}.multiSelectCallout`)}
              </div>
              <div className="flex flex-wrap items-center gap-2 py-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllListed}
                  disabled={!showList}
                >
                  {t(`${p}.selectAllListed`)}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearListed}>
                  {t(`${p}.clearSelection`)}
                </Button>
                <span className="text-muted-foreground text-sm">
                  {t(`${p}.selectedCount`, { count: selectedIds.length })}
                  <span className="text-muted-foreground/80">
                    {' '}
                    ({t(`${p}.maxAgentsHint`, { max: MAX_AGENTS_PER_BATCH })})
                  </span>
                </span>
              </div>
              {agentsLoading ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{t(`${p}.agentsLoading`)}</p>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : null}
              {!agentsLoading && agentsFetched && agentRows.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t(`${p}.agentsEmpty`)}
                </div>
              ) : null}
              {showList ? (
                <div className="max-h-[280px] divide-y overflow-y-auto rounded-md border">
                  {agentRows.map((agent) => {
                    const checked = selectedIds.includes(agent.id);
                    const atCap = !checked && selectedIds.length >= MAX_AGENTS_PER_BATCH;
                    return (
                      <label
                        key={agent.id}
                        htmlFor={`agent-pick-${agent.id}`}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`agent-pick-${agent.id}`}
                          checked={checked}
                          disabled={atCap}
                          onCheckedChange={(v) => toggleAgent(agent.id, v === true)}
                        />
                        <span className="text-sm font-medium leading-none">{agent.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <FormDescription>
                {surface === 'coze'
                  ? t(`${p}.hintAgentCoze`)
                  : surface === 'fastgpt'
                    ? t(`${p}.hintAgentFastgpt`)
                    : surface === 'n8n'
                      ? t(`${p}.hintAgentN8n`)
                      : t(`${p}.hintAgentDify`)}
              </FormDescription>
              <p className="text-muted-foreground text-sm">{t(`${p}.multiAgentHint`)}</p>
              {agentIdsErr ? (
                <p className="text-destructive text-sm font-medium">{agentIdsErr}</p>
              ) : null}
            </FormItem>
          </div>
        );
      }

      case 'mcp':
        return (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="targetConfig.mcp.serverUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.mcpServerUrl`)}</FormLabel>
                  <FormControl>
                    <Input placeholder="ws://localhost:8080" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetConfig.mcp.apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.apiKey`)}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t(`${p}.apiKeyPlaceholder`)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'llm':
        return (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="targetConfig.llm.apiUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.apiUrl`)}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://api.openai.com/v1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetConfig.llm.apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.apiKeyRequired`)}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t(`${p}.apiKeyPlaceholder`)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetConfig.llm.model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.model`)}</FormLabel>
                  <FormControl>
                    <Input placeholder="gpt-4" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'composite':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t(`${p}.compositeHint`)}</p>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name={`targetConfig.${targetType}.endpoint`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.endpointUrl`)}</FormLabel>
                  <FormControl>
                    <Input placeholder={t(`${p}.endpointPlaceholder`)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`targetConfig.${targetType}.apiKey`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.apiKey`)}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t(`${p}.apiKeyPlaceholder`)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>
          {surface === 'agent'
            ? t(`${p}.descAgentSurface`)
            : surface === 'coze'
              ? t(`${p}.descCoze`)
              : surface === 'fastgpt'
                ? t(`${p}.descFastgpt`)
                : surface === 'n8n'
                  ? t(`${p}.descN8n`)
                  : t(`${p}.descAll`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {surface !== 'agent' &&
          surface !== 'coze' &&
          surface !== 'fastgpt' &&
          surface !== 'n8n' && (
            <FormField
              control={form.control}
              name="targetType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.targetType`)}</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder={t(`${p}.targetTypePlaceholder`)} />
                      </SelectTrigger>
                      <SelectContent>
                        {targetTypes.map((type) => {
                          const Icon = type.icon;
                          return (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">{type.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {type.description}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

        {targetType && (
          <div className="pt-4 border-t">
            <h3 className="mb-4 text-sm font-medium">
              {targetType === 'agent'
                ? t(`${p}.targetAgentsMultiHeading`)
                : t(`${p}.targetConfigHeading`)}
            </h3>
            {renderTargetConfig()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
