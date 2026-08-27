/**
 * Dify Config Gray-Box Scanning Wizard - 3-step flow
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { Button } from '@/components/ui/button';
import { difyConfigAuditApi, type DifyConfigAuditData } from '@/services/api/dify-config-audit';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getAuditModule } from '@/features/audit/audit-registry';
import { auditToMarkdown } from './utils';
import { DifyStructureBetaSheet } from './dify-structure-beta-sheet';
import { Step1Upload } from './steps/step1-upload';
import { Step2Reviewer } from './steps/step2-reviewer';
import { Step3RunResults } from './steps/step3-run-results';

function getAnalyzeErrorMessage(e: unknown, isZh: boolean): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) {
      return m;
    }
  }
  return isZh ? '分析失败' : 'Analysis failed';
}

function getAnalyzeErrorCode(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

export function AuditWizard({ embedded = false }: { embedded?: boolean } = {}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [currentStep, setCurrentStep] = useState(0);
  const [yamlText, setYamlText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [selectedModelValue, setSelectedModelValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(DifyConfigAuditData & { reportId?: string }) | null>(null);
  const [analyzeError, setAnalyzeError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);

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
    if (!yamlText.trim()) {
      toast.error(tr('Upload or paste YAML first', '请先上传或粘贴 YAML'));
      return;
    }
    setLoading(true);
    setResult(null);
    setAnalyzeError(null);
    try {
      const selected = modelOptions.find((m) => m.value === selectedModelValue);
      // Always send provider when a model is selected (Ollama doesn't need apiKey)
      const data = await difyConfigAuditApi.analyze({
        yaml: yamlText,
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
      const { reportId, ...auditRest } = data as DifyConfigAuditData & { reportId?: string };
      const auditMod = getAuditModule('dify-config');
      auditMod?.storage.save({
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
      const msg = getAnalyzeErrorMessage(e, isZh);
      const code = getAnalyzeErrorCode(e);
      setAnalyzeError({ message: msg, code });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [yamlText, fileName, modelOptions, selectedModelValue, isZh]);

  const copyMd = useCallback(() => {
    if (!result) return;
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName));
    toast.success(tr('Markdown copied', '已复制 Markdown'));
  }, [result, fileName, isZh]);

  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      if (!yamlText.trim()) {
        toast.error(tr('Please upload a file or paste YAML content first', '请先上传文件或粘贴 YAML 内容'));
        return;
      }
    }
    if (currentStep < 3 - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void runAnalyze();
    }
  }, [currentStep, yamlText, runAnalyze, isZh]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const openStructureExplorer = useCallback(() => {
    if (!yamlText.trim()) {
      toast.error(tr('Upload or paste YAML first', '请先上传或粘贴 YAML'));
      return;
    }
    setStructureSheetOpen(true);
  }, [yamlText, isZh]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Step1Upload
            yamlText={yamlText}
            setYamlText={setYamlText}
            fileName={fileName}
            setFileName={setFileName}
            onYamlChange={clearResultAndError}
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

  const isLastStep = currentStep === 2;
  const showFooterRun = !(isLastStep && result);
  const steps = useMemo(
    () => [
      { label: tr('Upload', '上传'), description: tr('Upload or paste Dify YAML', '上传或粘贴 Dify YAML') },
      { label: tr('Reviewer', '审查模型'), description: tr('Select audit model', '选择审计模型') },
      { label: tr('Run & Results', '运行与结果'), description: tr('Execute and view findings', '执行并查看发现') },
    ],
    [isZh],
  );

  const structureExplorerButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 gap-2"
      onClick={openStructureExplorer}
    >
      {tr('Structured explorer', '结构化浏览器')}
      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
        Beta
      </Badge>
    </Button>
  );

  return (
    <Card>
      {embedded ? (
        <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-2">
          {structureExplorerButton}
        </CardHeader>
      ) : (
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>
                {tr('Dify Config Gray-Box Scanning Task', 'Dify 配置灰盒扫描任务')}
              </CardTitle>
              <CardDescription>
                {tr(
                  'Step-by-step wizard for auditing Dify app exports (YAML) with LLM security review',
                  '用于审计 Dify 应用导出文件（YAML）的分步向导，结合 LLM 安全审查。',
                )}
              </CardDescription>
            </div>
            {structureExplorerButton}
          </div>
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
          {showFooterRun ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={
                loading ||
                (currentStep === 0 && !yamlText.trim()) ||
                (isLastStep && !yamlText.trim())
              }
            >
              {loading && isLastStep ? (
                <>
                  <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {tr('Analyzing…', '分析中…')}
                </>
              ) : (
                <>
                  {isLastStep ? tr('Run Audit', '运行审计') : tr('Next', '下一步')}
                  {!isLastStep && <ChevronRight className="ml-2 h-4 w-4" />}
                </>
              )}
            </Button>
          ) : null}
        </div>
      </CardContent>

      <DifyStructureBetaSheet
        open={structureSheetOpen}
        onOpenChange={setStructureSheetOpen}
        yamlText={yamlText}
        findings={result?.findings ?? null}
      />
    </Card>
  );
}
