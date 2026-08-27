/**
 * FastGPT Config Audit Wizard - 3-step flow
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { Button } from '@/components/ui/button';
import {
  fastgptConfigAuditApi,
  type FastGptConfigAuditData,
} from '@/services/api/fastgpt-config-audit';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getAuditModule } from '@/features/audit/audit-registry';
import { auditToMarkdown } from './utils';
import { Step1Upload } from './steps/step1-upload';
import { Step2Reviewer } from './steps/step2-reviewer';
import { Step3RunResults } from './steps/step3-run-results';

function getAnalyzeErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) {
      return m;
    }
  }
  return 'Analysis failed';
}

function getAnalyzeErrorCode(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

export function FastGptConfigAuditWizard({ embedded = false }: { embedded?: boolean } = {}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const steps = useMemo(
    () => [
      { label: tr('Upload', '上传'), description: tr('Upload or paste FastGPT workflow JSON', '上传或粘贴 FastGPT 工作流 JSON') },
      { label: tr('Reviewer', '审查模型'), description: tr('Select audit model', '选择审计模型') },
      { label: tr('Run & Results', '运行与结果'), description: tr('Execute and view findings', '执行并查看发现') },
    ],
    [isZh],
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [jsonText, setJsonText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [selectedModelValue, setSelectedModelValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(FastGptConfigAuditData & { reportId?: string }) | null>(
    null,
  );
  const [analyzeError, setAnalyzeError] = useState<{
    message: string;
    code?: string;
  } | null>(null);

  const {
    modelOptions,
    isLoading: isLoadingIntegrations,
    isError: integrationsError,
  } = useLlmModelOptions();

  useEffect(() => {
    if (modelOptions.length === 0) {
      return;
    }
    const stillValid = modelOptions.some((m) => m.value === selectedModelValue);
    if (!selectedModelValue || !stillValid) {
      setSelectedModelValue(modelOptions[0].value);
    }
  }, [modelOptions, selectedModelValue]);

  const clearResultAndError = useCallback(() => {
    setResult(null);
    setAnalyzeError(null);
  }, []);

  const runAnalyze = useCallback(async () => {
    if (!jsonText.trim()) {
      toast.error(tr('Upload or paste JSON first', '请先上传或粘贴 JSON'));
      return;
    }
    setLoading(true);
    setResult(null);
    setAnalyzeError(null);
    try {
      const selected = modelOptions.find((m) => m.value === selectedModelValue);
      const data = await fastgptConfigAuditApi.analyze({
        json: jsonText,
        fileName,
        ...(selectedModelValue
          ? {
              provider: {
                id: selectedModelValue,
                config: {
                  ...(selected?.config?.apiKey ? { apiKey: selected.config.apiKey } : {}),
                  ...(selected?.config?.apiBaseUrl
                    ? { apiBaseUrl: selected.config.apiBaseUrl }
                    : {}),
                },
              },
            }
          : {}),
      });
      setResult(data);
      const { reportId, ...auditRest } = data as FastGptConfigAuditData & { reportId?: string };
      getAuditModule('fastgpt-config')?.storage.save({
        result: auditRest,
        metadata: {
          fileName,
          overallRisk: auditRest.overallRisk,
          reportId,
        },
      });
      toast.success(
        reportId
          ? tr('Analysis complete. Saved to Reports.', '分析完成，已保存到报告。')
          : tr('Analysis complete.', '分析完成。'),
      );
    } catch (e) {
      const msg = getAnalyzeErrorMessage(e);
      const code = getAnalyzeErrorCode(e);
      setAnalyzeError({ message: msg, code });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [jsonText, fileName, modelOptions, selectedModelValue]);

  const copyMd = useCallback(() => {
    if (!result) return;
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName));
    toast.success(tr('Markdown copied', 'Markdown 已复制'));
  }, [result, fileName]);


  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      if (!jsonText.trim()) {
        toast.error(tr('Please upload a file or paste JSON content first', '请先上传文件或粘贴 JSON 内容'));
        return;
      }
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void runAnalyze();
    }
  }, [currentStep, jsonText, runAnalyze]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Step1Upload
            jsonText={jsonText}
            setJsonText={setJsonText}
            fileName={fileName}
            setFileName={setFileName}
            onJsonChange={clearResultAndError}
          />
        );
      case 1:
        return (
          <Step2Reviewer
            modelOptions={modelOptions}
            selectedModelValue={selectedModelValue}
            setSelectedModelValue={setSelectedModelValue}
            isLoading={isLoadingIntegrations}
            integrationsError={!!integrationsError}
          />
        );
      case 2:
        return (
          <Step3RunResults
            loading={loading}
            result={result}
            analyzeError={analyzeError}
            onRun={runAnalyze}
            onCopyMd={copyMd}
          />
        );
      default:
        return null;
    }
  };

  const isLastStep = currentStep === steps.length - 1;
  const nextButtonLabel = isLastStep ? tr('Run Audit', '运行审计') : tr('Next', '下一步');

  return (
    <Card>
      {embedded ? null : (
        <CardHeader>
          <CardTitle>{tr('FastGPT Config Audit', 'FastGPT 配置审计')}</CardTitle>
          <CardDescription>
            {tr(
              'Step-by-step wizard for auditing FastGPT workflow exports (JSON) with LLM security review',
              '用于审计 FastGPT 工作流导出文件（JSON）的分步向导，结合 LLM 安全审查。',
            )}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        <Stepper steps={steps} currentStep={currentStep + 1} />

        <div className="min-h-[400px] py-6">{renderStepContent()}</div>

        <div className="flex justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={loading || currentStep === 0}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {tr('Back', '上一步')}
          </Button>
          {!(isLastStep && result) ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={
                loading ||
                (currentStep === 0 && !jsonText.trim()) ||
                (isLastStep && !jsonText.trim())
              }
            >
              {loading && isLastStep ? (
                <>
                  <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {tr('Analyzing…', '分析中…')}
                </>
              ) : (
                <>
                  {nextButtonLabel}
                  {!isLastStep && <ChevronRight className="ml-2 h-4 w-4" />}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
