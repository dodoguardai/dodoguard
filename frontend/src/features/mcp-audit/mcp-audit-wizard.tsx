/**
 * MCP source audit wizard — ZIP only, 3 steps.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { getAuditModule } from '@/features/audit/audit-registry';
import { formatApiClientError } from '@/services/api/client';
import { type McpAuditData, mcpAuditApi } from '@/services/api/mcp-audit';
import { Step2Reviewer } from '@/features/skills-md-audit/steps/step2-reviewer';
import { Step3RunResults } from '@/features/skills-md-audit/steps/step3-run-results';
import { auditToMarkdown } from '@/features/skills-md-audit/utils';
import { registerUserMcpAfterAudit } from './mcp-catalog-registration';
import { McpStep1Zip } from './mcp-step1-zip';
import { takePendingMcpUpload } from './pending-mcp-upload';

function getAnalyzeErrorMessage(e: unknown): string {
  const viaClient = formatApiClientError(e);
  if (viaClient && viaClient !== 'Request failed' && !viaClient.startsWith('[object')) {
    return viaClient;
  }
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

export function McpAuditWizard(props: { linkedMcpSlug?: string } = {}) {
  const { linkedMcpSlug } = props;
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const steps = useMemo(
    () => [
      {
        label: t('pages.mcpAudit.wizardStepUpload'),
        description: t('pages.mcpAudit.wizardStepUploadDesc'),
      },
      {
        label: t('pages.mcpAudit.wizardStepReviewer'),
        description: t('pages.mcpAudit.wizardStepReviewerDesc'),
      },
      {
        label: t('pages.mcpAudit.wizardStepRun'),
        description: t('pages.mcpAudit.wizardStepRunDesc'),
      },
    ],
    [t],
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [fileName, setFileName] = useState<string | undefined>();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(McpAuditData & { reportId?: string }) | null>(null);
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

  useEffect(() => {
    const p = takePendingMcpUpload();
    if (!p) {
      return;
    }
    if (p.kind === 'zip') {
      setZipFile(p.file);
      setFileName(p.file.name);
    }
    clearResultAndError();
  }, [clearResultAndError]);
  const runAnalyze = useCallback(async () => {
    if (!zipFile) {
      toast.error(t('pages.mcpAudit.toastNeedZip'));
      return;
    }
    setLoading(true);
    setResult(null);
    setAnalyzeError(null);
    try {
      const selected = modelOptions.find((m) => m.value === selectedModelValue);
      const provider =
        selectedModelValue && selected
          ? {
              // Prefer managed model UUID so the server can resolve apiKey from Settings → Models
              id: selected.modelId || selectedModelValue,
              config: {
                ...(selected.config?.apiKey ? { apiKey: selected.config.apiKey } : {}),
                ...(selected.config?.apiBaseUrl ? { apiBaseUrl: selected.config.apiBaseUrl } : {}),
              },
            }
          : undefined;

      const data = await mcpAuditApi.analyzeArchive({ archive: zipFile, provider });
      setResult(data);

      const auditMod = getAuditModule('mcp-source');
      if (auditMod?.storage) {
        const { reportId, ...auditRest } = data as McpAuditData & { reportId?: string };
        const resolvedSlug = registerUserMcpAfterAudit({
          linkedMcpSlug,
          zipFileName: zipFile.name,
          audit: auditRest,
        });
        auditMod.storage.save({
          result: auditRest,
          metadata: {
            fileName: zipFile.name,
            overallRisk: auditRest.overallRisk,
            reportId,
            mcpSlug: resolvedSlug,
          },
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['capability-components'] });

      toast.success(
        (data as { reportId?: string }).reportId
          ? tr(
              'Analysis complete. Synced to Capability Component Management.',
              '分析完成，已同步到能力组件管理。',
            )
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
  }, [zipFile, modelOptions, selectedModelValue, linkedMcpSlug, queryClient, tr]);

  const copyMd = useCallback(() => {
    if (!result) {
      return;
    }
    const title = t('pages.mcpAudit.exportMarkdownTitle');
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName, { reportTitle: title }));
    toast.success(t('pages.mcpAudit.markdownCopied'));
  }, [result, fileName, t]);

  const downloadJson = useCallback(() => {
    if (!result) {
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mcp-audit-${fileName ?? 'mcp-server'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, fileName]);

  const handleNext = useCallback(() => {
    if (currentStep === 0 && !zipFile) {
      toast.error(t('pages.mcpAudit.toastNeedZipStep'));
      return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void runAnalyze();
    }
  }, [currentStep, zipFile, steps.length, runAnalyze, t]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <McpStep1Zip
            zipFile={zipFile}
            setZipFile={setZipFile}
            setFileName={setFileName}
            onZipSelected={clearResultAndError}
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
            onDownloadJson={downloadJson}
            i18nPagePrefix="pages.mcpAudit"
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
      <CardHeader>
        <CardTitle>{t('pages.mcpAudit.wizardTitle')}</CardTitle>
        <CardDescription>{t('pages.mcpAudit.wizardSubtitle')}</CardDescription>
      </CardHeader>
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
            {tr('Back', '返回')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">{t('pages.mcpAudit.viewReports')}</Link>
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={loading || (currentStep === 0 && !zipFile) || (isLastStep && !zipFile)}
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
