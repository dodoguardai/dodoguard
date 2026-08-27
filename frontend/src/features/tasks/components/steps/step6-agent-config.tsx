/**
 * Step 6: Agent Driver Configuration
 */

import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Sparkles } from 'lucide-react';
import type { TaskFormData } from '../configuration-mode-wizard';

interface Step6AgentConfigProps {
  form: UseFormReturn<TaskFormData>;
}

export function Step6AgentConfig({ form }: Step6AgentConfigProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step6';
  const agentEnabled = form.watch('agentConfig.enabled');

  const { modelOptions: availableModels, isLoading: isLoadingModels } = useLlmModelOptions();

  // Fallback to default models if no Enterprise models configured
  const defaultModels = [
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { value: 'deepseek-r1-distill-qwen-7b', label: 'DeepSeek R1 Distill Qwen 7B' },
  ];

  const modelOptions = availableModels.length > 0 ? availableModels : defaultModels;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>{t(`${p}.cardDescription`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
          control={form.control}
          name="agentConfig.enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <FormLabel className="text-base font-semibold">{t(`${p}.enableTitle`)}</FormLabel>
                </div>
                <FormDescription>{t(`${p}.enableHint`)}</FormDescription>
              </div>
            </FormItem>
          )}
        />

        {agentEnabled && (
          <div className="space-y-4 pt-4 border-t">
            <FormField
              control={form.control}
              name="agentConfig.model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.modelLabel`)}</FormLabel>
                  {isLoadingModels ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t(`${p}.modelPlaceholder`)} />
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
                    {availableModels.length > 0
                      ? t(`${p}.modelHintEnterprise`)
                      : t(`${p}.modelHintDefault`)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agentConfig.temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`${p}.temperature`)}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      placeholder="0.7"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0.7)}
                    />
                  </FormControl>
                  <FormDescription>{t(`${p}.temperatureHint`)}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h4 className="text-sm font-semibold">{t(`${p}.capabilitiesTitle`)}</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t(`${p}.cap1`)}</li>
                <li>{t(`${p}.cap2`)}</li>
                <li>{t(`${p}.cap3`)}</li>
                <li>{t(`${p}.cap4`)}</li>
                <li>{t(`${p}.cap5`)}</li>
              </ul>
            </div>
          </div>
        )}

        {!agentEnabled && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-1">{t(`${p}.disabledTitle`)}</p>
            <p className="text-xs text-muted-foreground">{t(`${p}.disabledHint`)}</p>
          </div>
        )}

        {agentEnabled && (
          <div className="pt-4 border-t">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {t(`${p}.benefitsTitle`)}
              </h4>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li>{t(`${p}.ben1`)}</li>
                <li>{t(`${p}.ben2`)}</li>
                <li>{t(`${p}.ben3`)}</li>
                <li>{t(`${p}.ben4`)}</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
