/**
 * SKILLS.md Audit Wizard - 3-step flow
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { getAuditModule } from '@/features/audit/audit-registry';
import { agentModeApi } from '@/services/api/agent-mode';
import { formatApiClientError } from '@/services/api/client';
import { type SkillsMdAuditData, skillsMdAuditApi } from '@/services/api/skills-md-audit';
import { takePendingSkillUpload } from './pending-skill-upload';
import { registerUserSkillAfterAudit } from './skills-catalog-registration';
import { Step1Upload } from './steps/step1-upload';
import { Step2Reviewer } from './steps/step2-reviewer';
import { Step3RunResults } from './steps/step3-run-results';
import { auditToMarkdown } from './utils';

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

type SkillsMdAuditWizardProps = {
  linkedSkillSlug?: string;
};

export function SkillsMdAuditWizard(props: SkillsMdAuditWizardProps = {}) {
  const { linkedSkillSlug } = props;
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const steps = useMemo(
    () => [
      {
        label: tr('Upload', '上传'),
        description: tr('ZIP package or Markdown', 'ZIP 技能包或 Markdown'),
      },
      { label: tr('Reviewer', '审查模型'), description: tr('Select audit model', '选择审计模型') },
      {
        label: tr('Run & Results', '运行与结果'),
        description: tr('Execute and view findings', '执行并查看发现'),
      },
    ],
    [isZh],
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [markdownText, setMarkdownText] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(SkillsMdAuditData & { reportId?: string }) | null>(null);
  const [analyzeError, setAnalyzeError] = useState<{
    message: string;
    code?: string;
  } | null>(null);

  const { data: apiSkills = [] } = useQuery({
    queryKey: ['agent-bundled-skills-catalog'],
    queryFn: () => agentModeApi.listBundledSkills(),
  });

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
    const p = takePendingSkillUpload();
    if (!p) {
      return;
    }
    if (p.kind === 'zip') {
      setZipFile(p.file);
      setMarkdownText('');
      setFileName(p.file.name);
    } else {
      setZipFile(null);
      setMarkdownText(p.text);
      setFileName(p.fileName);
    }
    clearResultAndError();
  }, [clearResultAndError]);

  const runAnalyze = useCallback(async () => {
    if (!zipFile && !markdownText.trim()) {
      toast.error(
        tr('Upload a ZIP package or paste Markdown first', '请先上传 ZIP 技能包或粘贴 Markdown'),
      );
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
              id: selectedModelValue,
              config: {
                ...(selected.config?.apiKey ? { apiKey: selected.config.apiKey } : {}),
                ...(selected.config?.apiBaseUrl ? { apiBaseUrl: selected.config.apiBaseUrl } : {}),
              },
            }
          : undefined;

      const data = zipFile
        ? await skillsMdAuditApi.analyzeArchive({ archive: zipFile, provider })
        : await skillsMdAuditApi.analyze({
            markdown: markdownText,
            fileName,
            provider,
          });
      setResult(data);

      const auditMod = getAuditModule('skills-md');
      if (auditMod?.storage) {
        const { reportId, ...auditRest } = data as SkillsMdAuditData & { reportId?: string };
        const resolvedSlug = registerUserSkillAfterAudit({
          apiSkills,
          linkedSkillSlug,
          zipFileName: zipFile?.name,
          mdFileName: zipFile ? undefined : fileName,
          audit: auditRest,
        });
        auditMod.storage.save({
          result: auditRest,
          metadata: {
            fileName: zipFile?.name ?? fileName ?? '',
            overallRisk: auditRest.overallRisk,
            reportId,
            skillSlug: resolvedSlug,
          },
        });
      }

      toast.success(
        (data as { reportId?: string }).reportId
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
  }, [
    markdownText,
    fileName,
    zipFile,
    modelOptions,
    selectedModelValue,
    linkedSkillSlug,
    apiSkills,
    tr,
  ]);

  const copyMd = useCallback(() => {
    if (!result) {
      return;
    }
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName));
    toast.success(tr('Markdown copied', 'Markdown 已复制'));
  }, [result, fileName]);

  const downloadJson = useCallback(() => {
    if (!result) {
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skills-md-audit-${fileName ?? 'SKILLS'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, fileName]);

  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      if (!zipFile && !markdownText.trim()) {
        toast.error(
          tr(
            'Please upload a ZIP package or Markdown content first',
            '请先上传 ZIP 技能包或 Markdown 内容',
          ),
        );
        return;
      }
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      void runAnalyze();
    }
  }, [currentStep, markdownText, runAnalyze]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Step1Upload
            markdownText={markdownText}
            setMarkdownText={setMarkdownText}
            fileName={fileName}
            setFileName={setFileName}
            zipFile={zipFile}
            setZipFile={setZipFile}
            onMarkdownChange={clearResultAndError}
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
        <CardTitle>{tr('SKILLS.md Audit', 'SKILLS.md 审计')}</CardTitle>
        <CardDescription>
          {tr(
            'Step-by-step wizard for auditing agent skill documents (Markdown) with LLM security review',
            '用于审计智能体技能文档（Markdown）的分步向导，结合 LLM 安全审查。',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Stepper steps={steps} currentStep={currentStep + 1} />

        <div className="min-h-[400px] py-6">{renderStepContent()}</div>

        <div className="flex justify-between pt-4 border-t">
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
              <Link to="/reports">{tr('View Reports', '查看报告')}</Link>
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={
                loading ||
                (currentStep === 0 && !zipFile && !markdownText.trim()) ||
                (isLastStep && !zipFile && !markdownText.trim())
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
