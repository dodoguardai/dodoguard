/**
 * System-wide Agent mode: Integration LLM + base system prompt (system_configs.agent_mode_config).
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatApiClientError } from '@/services/api/client';
import { systemConfigApi } from '@/services/api/system-config';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';

const CONFIG_KEY = 'agent_mode_config';

type AgentModeConfigValue = {
  llmModelId?: string | null;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxHarnessRepairAttempts?: number;
};

function normalizeLoaded(raw: unknown): AgentModeConfigValue {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as AgentModeConfigValue;
}

export function AgentModeSystemSettings() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const qc = useQueryClient();
  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelChoice, setModelChoice] = useState<string>('default');

  const { data: configRow, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['system-config-key', CONFIG_KEY],
    queryFn: async () => {
      try {
        return await systemConfigApi.getByKey(CONFIG_KEY);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return { key: CONFIG_KEY, value: {} };
        }
        throw e;
      }
    },
    retry: false,
  });

  const { modelOptions, isLoading: isLoadingIntegrations } = useLlmModelOptions();

  useEffect(() => {
    const v = normalizeLoaded(configRow?.value);
    setSystemPrompt(typeof v.systemPrompt === 'string' ? v.systemPrompt : '');
    const mid = v.llmModelId;
    setModelChoice(typeof mid === 'string' && mid.trim() !== '' ? mid.trim() : 'default');
  }, [configRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const prev = normalizeLoaded(configRow?.value);
      const next: Record<string, unknown> = {
        ...prev,
        llmModelId: modelChoice === 'default' ? null : modelChoice,
        systemPrompt,
        temperature: typeof prev.temperature === 'number' ? prev.temperature : 0.2,
        maxTokens: typeof prev.maxTokens === 'number' ? prev.maxTokens : 4096,
        maxHarnessRepairAttempts:
          typeof prev.maxHarnessRepairAttempts === 'number' ? prev.maxHarnessRepairAttempts : 2,
      };
      await systemConfigApi.updateByKey(CONFIG_KEY, { value: next });
    },
    onSuccess: async () => {
      toast.success(isZh ? '已保存智能体模式配置' : 'Agent mode settings saved');
      await qc.invalidateQueries({ queryKey: ['system-config-key', CONFIG_KEY] });
    },
    onError: (err: unknown) => {
      const msg = formatApiClientError(err);
      toast.error(isZh ? `保存失败：${msg}` : `Save failed: ${msg}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isZh ? '智能体模式（系统）' : 'Agent mode (system)'}</CardTitle>
        <CardDescription>
          {isZh
            ? '编排助手使用的 LLM 来自「集成」中的 LLM；此处配置首选模型与基础 system 提示。'
            : 'The task-builder assistant uses LLMs from Integrations; set the preferred model and base system prompt here.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingConfig ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <Label>{isZh ? '首选模型' : 'Preferred model'}</Label>
              {isLoadingIntegrations ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={modelChoice} onValueChange={setModelChoice}>
                  <SelectTrigger>
                    <SelectValue placeholder={isZh ? '选择模型' : 'Select model'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {isZh
                        ? '默认（首个已启用 LLM 集成）'
                        : 'Default (first enabled LLM integration)'}
                    </SelectItem>
                    {modelOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                {isZh
                  ? '与检测配置中的模型 value 格式一致（如 openai:chat:gpt-4o-mini）。'
                  : 'Same model value format as detection LLM (e.g. openai:chat:gpt-4o-mini).'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mode-system-prompt">
                {isZh ? 'System 提示词' : 'System prompt'}
              </Label>
              <Textarea
                id="agent-mode-system-prompt"
                rows={8}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('common.actions.save')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
