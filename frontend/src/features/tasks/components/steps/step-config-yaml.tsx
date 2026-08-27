/**
 * Gray-box task: upload / paste app export YAML (reuses Dify audit upload UI; Coze flow uses Coze copy).
 */

import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Step1Upload as DifyStep1Upload } from '@/features/dify-config-audit/steps/step1-upload';
import { Step1Upload as FastGptStep1Upload } from '@/features/fastgpt-config-audit/steps/step1-upload';

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

interface StepConfigYamlProps {
  form: UseFormReturn<TaskFormData>;
  surface?: Surface;
}

export function StepConfigYaml({ form, surface = 'all' }: StepConfigYamlProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.stepConfigYaml';
  const taskKind = form.watch('taskKind');
  const saveAssetEligible = taskKind === 'config_audit' || taskKind === 'config_static';
  const yamlText = form.watch('configAuditYaml') || '';
  const fileName = form.watch('configAuditFileName');
  const yamlError = form.formState.errors.configAuditYaml?.message;
  const jsonText = form.watch('configAuditYaml') || '';
  const jsonError = form.formState.errors.configAuditYaml?.message;

  return (
    <div className="space-y-4">
      {surface === 'coze' && (
        <p className="text-sm text-muted-foreground">{t(`${p}.introCoze`)}</p>
      )}
      {(surface === 'fastgpt' || surface === 'n8n') && (
        <p className="text-sm text-muted-foreground">
          {surface === 'n8n' ? t(`${p}.introN8n`) : t(`${p}.introFastgpt`)}
        </p>
      )}
      {surface === 'fastgpt' || surface === 'n8n' ? (
        <FastGptStep1Upload
          jsonText={jsonText}
          setJsonText={(v) => form.setValue('configAuditYaml', v, { shouldValidate: true })}
          fileName={fileName}
          setFileName={(v) => form.setValue('configAuditFileName', v)}
          onJsonChange={() => form.clearErrors('configAuditYaml')}
        />
      ) : (
        <DifyStep1Upload
          yamlText={yamlText}
          setYamlText={(v) => form.setValue('configAuditYaml', v, { shouldValidate: true })}
          fileName={fileName}
          setFileName={(v) => form.setValue('configAuditFileName', v)}
          onYamlChange={() => form.clearErrors('configAuditYaml')}
        />
      )}
      {surface === 'fastgpt' || surface === 'n8n' ? (
        jsonError ? <p className="text-sm font-medium text-destructive">{String(jsonError)}</p> : null
      ) : (
        yamlError ? <p className="text-sm font-medium text-destructive">{String(yamlError)}</p> : null
      )}
      {saveAssetEligible ? (
        <FormField
          control={form.control}
          name="saveWorkflowConfigAsset"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 rounded-lg border p-4 shadow-none">
              <FormControl>
                <Checkbox
                  checked={Boolean(field.value)}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              </FormControl>
              <div className="space-y-1 leading-snug">
                <FormLabel className="cursor-pointer font-normal">
                  {t(`${p}.saveWorkflowAssetLabel`)}
                </FormLabel>
                <FormDescription>{t(`${p}.saveWorkflowAssetHint`)}</FormDescription>
              </div>
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}
