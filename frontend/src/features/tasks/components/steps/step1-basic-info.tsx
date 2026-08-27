/**
 * Step 1: Basic Information
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { teamsApi } from '@/services/api/teams';
import { agentsApi } from '@/services/api/agents';

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

interface Step1BasicInfoProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function Step1BasicInfo({ form, surface = 'all' }: Step1BasicInfoProps) {
  const { t } = useTranslation();
  const taskKind = form.watch('taskKind');
  const agentIds = form.watch('targetConfig.agentIds');
  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  });

  const isCoze = surface === 'coze';
  const isFastgpt = surface === 'fastgpt';
  const isN8n = surface === 'n8n';
  const isTencentAdp = surface === 'tencent-adp';

  const preselectedAgentId =
    Array.isArray(agentIds) && typeof agentIds[0] === 'string' ? agentIds[0] : undefined;
  const { data: preselectedAgent } = useQuery({
    queryKey: ['target-agents', preselectedAgentId, 'step1-transport'],
    queryFn: () => agentsApi.get(preselectedAgentId!),
    enabled: isTencentAdp && Boolean(preselectedAgentId),
  });
  const transportMode =
    preselectedAgent?.config?.transportMode === 'websocket' ? 'WebSocket' : 'SSE';

  useEffect(() => {
    if (isTencentAdp && taskKind !== 'api_test') {
      form.setValue('taskKind', 'api_test', { shouldDirty: false, shouldValidate: true });
    }
  }, [isTencentAdp, taskKind, form]);

  const p = 'pages.tasks.createWizard.step1';
  let taskTypeDescription = t(`${p}.helpDifyApi`);
  if (isTencentAdp) {
    taskTypeDescription = preselectedAgent
      ? `对腾讯 ADP 智能体进行 API 黑盒安全测试。当前目标智能体接入方式：${transportMode}。`
      : '对腾讯 ADP 智能体进行 API 黑盒安全测试。接入方式（SSE / WebSocket）由下一步选择的目标智能体配置决定。';
  } else if (isCoze) {
    taskTypeDescription =
      taskKind === 'config_static'
        ? t(`${p}.helpCozeStatic`)
        : taskKind === 'config_audit'
          ? t(`${p}.helpCozeAudit`)
          : t(`${p}.helpCozeApi`);
  } else if (isFastgpt) {
    taskTypeDescription =
      taskKind === 'config_static'
        ? t(`${p}.helpFastgptStatic`)
        : taskKind === 'config_audit'
          ? t(`${p}.helpFastgptAudit`)
          : t(`${p}.helpFastgptApi`);
  } else if (isN8n) {
    taskTypeDescription =
      taskKind === 'config_static'
        ? t(`${p}.helpN8nStatic`)
        : taskKind === 'config_audit'
          ? t(`${p}.helpN8nAudit`)
          : t(`${p}.helpN8nApi`);
  } else {
    taskTypeDescription =
      taskKind === 'config_static'
        ? t(`${p}.helpDifyStatic`)
        : taskKind === 'config_audit'
          ? t(`${p}.helpDifyAudit`)
          : t(`${p}.helpDifyApi`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>
          {isTencentAdp
            ? '配置腾讯 ADP API 黑盒测试任务的基本信息。'
            : isCoze
              ? t(`${p}.cardDescCoze`)
              : isFastgpt
                ? t(`${p}.cardDescFastgpt`)
                : isN8n
                  ? t(`${p}.cardDescN8n`)
                  : t(`${p}.cardDescDify`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="taskKind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.taskType`)}</FormLabel>
              {isTencentAdp ? (
                <FormControl>
                  <Input value="腾讯 ADP API 黑盒测试" readOnly className="bg-muted" />
                </FormControl>
              ) : (
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t(`${p}.taskTypePlaceholder`)} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="api_test">
                      {isCoze
                        ? t(`${p}.optApiCoze`)
                        : isFastgpt
                          ? t(`${p}.optApiFastgpt`)
                          : isN8n
                            ? t(`${p}.optApiN8n`)
                            : t(`${p}.optApiDify`)}
                    </SelectItem>
                    <SelectItem value="config_static">
                      {isCoze
                        ? t(`${p}.optStaticCoze`)
                        : isFastgpt
                          ? t(`${p}.optStaticFastgpt`)
                          : isN8n
                            ? t(`${p}.optStaticN8n`)
                            : t(`${p}.optStaticDify`)}
                    </SelectItem>
                    <SelectItem value="config_audit">
                      {isCoze
                        ? t(`${p}.optAuditCoze`)
                        : isFastgpt
                          ? t(`${p}.optAuditFastgpt`)
                          : isN8n
                            ? t(`${p}.optAuditN8n`)
                            : t(`${p}.optAuditDify`)}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <FormDescription>{taskTypeDescription}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.taskName`)}</FormLabel>
              <FormControl>
                <Input placeholder={t(`${p}.taskNamePlaceholder`)} {...field} />
              </FormControl>
              <FormDescription>{t(`${p}.taskNameHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.description`)}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t(`${p}.descriptionPlaceholder`)}
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>{t(`${p}.descriptionHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="teamId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.team`)}</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(value === 'none' ? undefined : value)}
                value={field.value || 'none'}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t(`${p}.teamPlaceholder`)} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">{t(`${p}.noTeam`)}</SelectItem>
                  {teams?.data?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>{t(`${p}.teamHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
