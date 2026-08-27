/**
 * Step: Detection — API Test (LLM-only) vs Gray-box task (optional rules + LLM in parallel).
 */

import { AlertCircle, Brain, Info, Search, Shield } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';

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

interface Step5DetectionConfigProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function Step5DetectionConfig({ form, surface = 'all' }: Step5DetectionConfigProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step5';
  const taskKind = form.watch('taskKind');
  const isCoze = surface === 'coze';
  const isFastgpt = surface === 'fastgpt';
  const isN8n = surface === 'n8n';
  const useRule = form.watch('detectionConfig.useRule') === true;
  const useLLM = form.watch('detectionConfig.useLLM') === true;

  const { modelOptions: availableModels, isLoading: isLoadingModels } = useLlmModelOptions();

  const defaultModels = [
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { value: 'deepseek-r1-distill-qwen-7b', label: 'DeepSeek R1 Distill Qwen 7B' },
  ];

  const modelOptions = availableModels.length > 0 ? availableModels : defaultModels;

  const renderLlmFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="detectionConfig.llmConfig.model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.llmModel`)}</FormLabel>
              {isLoadingModels ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t(`${p}.selectModel`)} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {modelOptions.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormDescription>
                {t(`${p}.llmModelHint`)}
                {availableModels.length > 0 ? t(`${p}.llmModelHintEnterprise`) : ''}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="detectionConfig.llmConfig.confidenceThreshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.confidenceThreshold`)}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="0.7"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0.7)}
                />
              </FormControl>
              <FormDescription>{t(`${p}.confidenceHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="detectionConfig.llmConfig.successDescription"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t(`${p}.additionalNotes`)}</FormLabel>
            <FormControl>
              <Textarea
                placeholder={t(`${p}.additionalNotesPlaceholder`)}
                className="min-h-[100px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  if (taskKind === 'api_test') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t(`${p}.apiTestTitle`)}
          </CardTitle>
          <CardDescription>{t(`${p}.apiTestDescription`)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              {t(`${p}.apiTestInfoBefore`)}
              <code className="text-xs">non_vulnerability</code> /{' '}
              <code className="text-xs">expected_success</code>
              {t(`${p}.apiTestInfoAfter`)}
            </p>
          </div>
          {renderLlmFields()}
        </CardContent>
      </Card>
    );
  }

  // Gray-box task: Rule + LLM multi-select, both may run
  const syncDetectionMode = (nextUseRule: boolean, nextUseLLM: boolean) => {
    form.setValue('detectionConfig.useRule', nextUseRule);
    form.setValue('detectionConfig.useLLM', nextUseLLM);
    if (nextUseLLM && !nextUseRule) {
      form.setValue('detectionConfig.detectionMode', 'llm');
    } else if (nextUseRule && !nextUseLLM) {
      form.setValue('detectionConfig.detectionMode', 'rule');
    } else if (nextUseRule && nextUseLLM) {
      form.setValue('detectionConfig.detectionMode', 'llm');
    }
  };

  return (
    <div className="flex gap-6">
      <div className="w-64 flex-shrink-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(`${p}.sidebarRuleTitle`)}</CardTitle>
            <CardDescription>{t(`${p}.sidebarRuleDescription`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="det-rule"
                checked={useRule}
                onCheckedChange={(v) => syncDetectionMode(v === true, useLLM)}
              />
              <div className="grid gap-1">
                <Label htmlFor="det-rule" className="flex items-center gap-1 text-sm font-medium">
                  <Search className="h-4 w-4" />
                  {t(`${p}.ruleBase`)}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(`${p}.ruleSidebarBefore`)}
                  <code className="text-xs">detection_rules</code>
                  {t(`${p}.ruleSidebarAfter`)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="det-llm"
                checked={useLLM}
                onCheckedChange={(v) => syncDetectionMode(useRule, v === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="det-llm" className="flex items-center gap-1 text-sm font-medium">
                  <Brain className="h-4 w-4" />
                  {t(`${p}.llmBase`)}
                </Label>
                <p className="text-xs text-muted-foreground">{t(`${p}.llmBaseHint`)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {taskKind === 'config_static'
                ? isCoze
                  ? t(`${p}.titleStaticCoze`)
                  : isFastgpt
                    ? t(`${p}.titleStaticFastgpt`)
                    : isN8n
                      ? t(`${p}.titleStaticN8n`)
                      : t(`${p}.titleStaticDify`)
                : isCoze
                  ? t(`${p}.titleAuditCoze`)
                  : isFastgpt
                    ? t(`${p}.titleAuditFastgpt`)
                    : isN8n
                      ? t(`${p}.titleAuditN8n`)
                      : t(`${p}.titleAuditDify`)}
            </CardTitle>
            <CardDescription>{t(`${p}.mainDescription`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!useRule && !useLLM && (
              <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {t(`${p}.warnSelectOne`)}
                </p>
              </div>
            )}

            {useRule && (
              <div className="pt-2 border-t space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  {t(`${p}.ruleSectionTitle`)}
                </h3>
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  {t(`${p}.ruleExplainPart1`)}
                  <code className="text-xs">detection_rules</code>
                  {taskKind === 'config_static'
                    ? t(`${p}.ruleExplainStaticTail`)
                    : t(`${p}.ruleExplainRuntimeTail`)}
                </p>
              </div>
            )}

            {useLLM && (
              <div className="pt-2 border-t space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  {t(`${p}.llmSectionTitle`)}
                </h3>
                {taskKind === 'config_static' && (
                  <p className="text-sm text-muted-foreground">{t(`${p}.llmStaticHint`)}</p>
                )}
                {renderLlmFields()}
              </div>
            )}

            {(taskKind === 'config_audit' || taskKind === 'config_static') && (
              <div className="pt-2 border-t space-y-2">
                <FormField
                  control={form.control}
                  name="detectionConfig.useKnowledgeBase"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>{t(`${p}.fullFileAudit`)}</FormLabel>
                        <FormDescription>
                          {taskKind === 'config_static'
                            ? isCoze
                              ? t(`${p}.grayStaticCoze`)
                              : isFastgpt
                                ? t(`${p}.grayStaticFastgpt`)
                                : isN8n
                                  ? t(`${p}.grayStaticN8n`)
                                  : t(`${p}.grayStaticDify`)
                            : isCoze
                              ? t(`${p}.auditExtraCoze`)
                              : isFastgpt
                                ? t(`${p}.auditExtraFastgpt`)
                                : isN8n
                                  ? t(`${p}.auditExtraN8n`)
                                  : t(`${p}.auditExtraDify`)}
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
