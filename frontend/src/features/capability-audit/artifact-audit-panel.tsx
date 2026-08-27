import { useCallback, useEffect, useState } from 'react';

import { useLlmModelOptions } from '@/hooks/use-llm-model-options';
import { useQuery } from '@tanstack/react-query';
import {
  type CapabilityAuditVariantId,
  getCapabilityVariant,
} from 'capability-audit/shared/constants';
import { buildCapabilityScanSnapshot } from 'capability-audit/shared/history-snapshot';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAuditModule } from '@/features/audit/audit-registry';
import { registerUserMcpAfterAudit } from '@/features/mcp-audit/mcp-catalog-registration';
import { registerUserSkillAfterAudit } from '@/features/skills-md-audit/skills-catalog-registration';
import { auditToMarkdown } from '@/features/skills-md-audit/utils';
import { agentModeApi } from '@/services/api/agent-mode';
import { capabilityScanApi } from '@/services/api/capability-scan';
import { formatApiClientError } from '@/services/api/client';
import { type SkillsMdAuditData } from '@/services/api/skills-md-audit';
import { capabilityHistoryMetadata, loadCapabilityHistoryRecord } from './capability-history';
import { ScanReportPanel } from './scan-report-panel';
import { buildReportTocItems, type TocItem } from './scan-report-toc';
import { ScanSubmitBar } from './scan-submit-bar';
import type { ScanStrategy } from 'capability-audit/shared/scan';
import { useCapabilityAuditUiConfig } from './use-capability-audit-ui-config';

function getAnalyzeErrorMessage(e: unknown): string {
  const viaClient = formatApiClientError(e);
  if (viaClient && viaClient !== 'Request failed' && !viaClient.startsWith('[object')) {
    return viaClient;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return 'Analysis failed';
}

type ArtifactAuditPanelProps = {
  variantId: CapabilityAuditVariantId;
  isZh: boolean;
  historySelection?: { auditType: string; id: string; nonce: number } | null;
  onHistorySelectionClear?: () => void;
  onAuditComplete?: () => void;
  onReportTocChange?: (items: TocItem[] | null) => void;
};

export function ArtifactAuditPanel({
  variantId,
  isZh,
  historySelection,
  onHistorySelectionClear,
  onAuditComplete,
  onReportTocChange,
}: ArtifactAuditPanelProps) {
  const variant = getCapabilityVariant(variantId);
  const tr = useCallback((en: string, zh: string) => (isZh ? zh : en), [isZh]);
  const isSkills = variantId === 'skills';

  const [markdownText, setMarkdownText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [selectedModelValue, setSelectedModelValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(SkillsMdAuditData & { reportId?: string }) | null>(null);
  const [scanMeta, setScanMeta] = useState<NonNullable<
    Awaited<ReturnType<typeof capabilityScanApi.analyze>>['scan']
  > | null>(null);
  const [scanStrategy, setScanStrategy] = useState<ScanStrategy>('standard');
  const [debugEnginesText, setDebugEnginesText] = useState(
    'skillspector,cisco_skill_scanner,snyk_agent_scan',
  );
  const [useAsyncScan, setUseAsyncScan] = useState(false);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<{ message: string; code?: string } | null>(null);
  const [viewingHistoryAt, setViewingHistoryAt] = useState<string | null>(null);
  const { config: uiConfig } = useCapabilityAuditUiConfig();
  const showScanStrategy = uiConfig.showAdvancedScanUi;

  useEffect(() => {
    if (!showScanStrategy && scanStrategy !== 'standard') {
      setScanStrategy('standard');
    }
  }, [showScanStrategy, scanStrategy]);

  const applyHistoryRecord = useCallback(
    (record: NonNullable<ReturnType<typeof loadCapabilityHistoryRecord>>) => {
      setResult(record.result);
      setFileName(
        typeof record.metadata.fileName === 'string' ? record.metadata.fileName : undefined,
      );
      setZipFile(null);
      setMarkdownText('');
      setSourceUrl('');
      setAnalyzeError(null);
      setViewingHistoryAt(record.createdAt);

      if (record.scanSnapshot) {
        setScanMeta({
          taskId: record.scanSnapshot.taskId,
          status: record.scanSnapshot.status,
          strategy: record.scanSnapshot.strategy,
          artifactKind: record.scanSnapshot.artifactKind,
          engines: record.scanSnapshot.engines,
          assetManifest: record.scanSnapshot.assetManifest,
          skillPreview: record.scanSnapshot.skillPreview,
        });
        setScanStrategy(record.scanSnapshot.strategy);
      } else {
        setScanMeta({
          taskId:
            (typeof record.metadata.reportId === 'string' && record.metadata.reportId) || record.id,
          status: 'completed',
          strategy: 'standard',
          artifactKind: variantId,
          engines: [],
        });
      }
    },
    [variantId],
  );

  useEffect(() => {
    if (!historySelection) {
      return;
    }
    const record = loadCapabilityHistoryRecord(historySelection.auditType, historySelection.id);
    if (!record) {
      toast.error(tr('History record not found', '历史记录不存在或已删除'));
      onHistorySelectionClear?.();
      return;
    }
    applyHistoryRecord(record);
    toast.message(tr('Loaded historical scan', '已加载历史扫描结果'));
    requestAnimationFrame(() => {
      document
        .getElementById('capability-scan-report')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [historySelection, applyHistoryRecord, onHistorySelectionClear, tr]);

  const { data: apiSkills = [] } = useQuery({
    queryKey: ['agent-bundled-skills-catalog'],
    queryFn: () => agentModeApi.listBundledSkills(),
    enabled: isSkills,
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

  useEffect(() => {
    setMarkdownText('');
    setSourceUrl('');
    setFileName(undefined);
    setZipFile(null);
    setResult(null);
    setScanMeta(null);
    setViewingHistoryAt(null);
    setTaskStatus(null);
    setAnalyzeError(null);
    setDebugEnginesText('skillspector,cisco_skill_scanner,snyk_agent_scan');
    onHistorySelectionClear?.();
    onReportTocChange?.(null);
    // Only reset when switching SKILLS / MCP tab — not when parent callbacks are re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId]);

  const needsLlm =
    scanStrategy === 'standard' ||
    scanStrategy === 'deep_offline' ||
    scanStrategy === 'online_enhanced' ||
    scanStrategy === 'llm_only';

  useEffect(() => {
    if (result) {
      onReportTocChange?.(
        buildReportTocItems(
          isZh,
          result.recommendations.length > 0,
          Boolean(scanMeta?.skillPreview?.files?.length),
        ),
      );
    } else {
      onReportTocChange?.(null);
    }
  }, [result, scanMeta, isZh, onReportTocChange]);

  const runAnalyze = useCallback(async () => {
    if (isSkills) {
      if (!zipFile && !markdownText.trim() && !sourceUrl.trim()) {
        toast.error(
          tr(
            'Upload ZIP, paste Markdown, or enter URL first',
            '请先上传 ZIP、粘贴 Markdown 或填写 URL',
          ),
        );
        return;
      }
    } else if (!zipFile) {
      toast.error(tr('Upload MCP source ZIP first', '请先上传 MCP 源码 ZIP'));
      return;
    }

    setLoading(true);
    setResult(null);
    setScanMeta(null);
    setViewingHistoryAt(null);
    onHistorySelectionClear?.();
    setTaskStatus(null);
    setAnalyzeError(null);
    onReportTocChange?.(null);

    try {
      const selected = modelOptions.find((m) => m.value === selectedModelValue);
      const provider =
        needsLlm && selectedModelValue && selected
          ? {
              id: selectedModelValue,
              config: {
                ...(selected.modelId ? { modelId: selected.modelId } : {}),
                ...(selected.config?.apiKey ? { apiKey: selected.config.apiKey } : {}),
                ...(selected.config?.apiBaseUrl ? { apiBaseUrl: selected.config.apiBaseUrl } : {}),
              },
            }
          : undefined;

      const request = {
        strategy: scanStrategy,
        artifactKind: variantId,
        archive: zipFile ?? undefined,
        markdown: !zipFile && !sourceUrl.trim() && markdownText.trim() ? markdownText : undefined,
        sourceUrl: !zipFile && sourceUrl.trim() ? sourceUrl.trim() : undefined,
        fileName,
        provider,
        engines:
          scanStrategy === 'debug'
            ? debugEnginesText
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)
            : undefined,
      } as const;

      const data = useAsyncScan
        ? await (async () => {
            const { taskId } = await capabilityScanApi.createTask(request);
            setTaskStatus('queued');
            return capabilityScanApi.waitForTask(taskId, setTaskStatus);
          })()
        : await capabilityScanApi.analyze(request);

      const { scan, ...auditRest } = data;
      setResult(auditRest);
      setScanMeta(scan ?? null);

      const auditMod = getAuditModule(variant.auditType);
      if (auditMod?.storage) {
        const reportId = (auditRest as { reportId?: string }).reportId;
        const scanSnapshot = scan
          ? buildCapabilityScanSnapshot({
              taskId: scan.taskId,
              status: scan.status,
              strategy: scan.strategy,
              artifactKind: scan.artifactKind,
              engines: scan.engines,
              assetManifest: scan.assetManifest,
              skillPreview: scan.skillPreview,
            })
          : null;
        const historyMeta = {
          fileName: zipFile?.name ?? fileName ?? sourceUrl ?? '',
          overallRisk: auditRest.overallRisk,
          reportId,
          ...capabilityHistoryMetadata(scanSnapshot),
        };
        if (isSkills) {
          const resolvedSlug = registerUserSkillAfterAudit({
            apiSkills,
            zipFileName: zipFile?.name,
            mdFileName: zipFile ? undefined : fileName,
            audit: auditRest,
          });
          auditMod.storage.save({
            result: auditRest,
            metadata: {
              ...historyMeta,
              skillSlug: resolvedSlug,
            },
          });
        } else {
          const resolvedSlug = registerUserMcpAfterAudit({
            zipFileName: zipFile?.name,
            audit: auditRest,
          });
          auditMod.storage.save({
            result: auditRest,
            metadata: {
              ...historyMeta,
              mcpSlug: resolvedSlug,
            },
          });
        }
      }

      setViewingHistoryAt(null);

      const synced = (auditRest as { syncedFindings?: number }).syncedFindings ?? 0;
      const reportId = (auditRest as { reportId?: string }).reportId;
      toast.success(
        scan?.status === 'partial_completed'
          ? tr('Scan complete (partial)', '扫描完成（部分引擎跳过或失败）')
          : reportId || synced > 0
            ? tr(
                `Audit complete · report saved${synced > 0 ? `, ${synced} risk(s) pushed` : ''}`,
                `审计完成 · 报告已写入${synced > 0 ? `，已推送 ${synced} 项风险` : ''}`,
              )
            : tr('Audit complete', '审计完成'),
      );
      onAuditComplete?.();
    } catch (e) {
      const msg = getAnalyzeErrorMessage(e);
      setAnalyzeError({ message: msg });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [
    apiSkills,
    debugEnginesText,
    fileName,
    isSkills,
    markdownText,
    sourceUrl,
    modelOptions,
    needsLlm,
    onAuditComplete,
    onHistorySelectionClear,
    onReportTocChange,
    scanStrategy,
    selectedModelValue,
    tr,
    useAsyncScan,
    variant.auditType,
    variantId,
    zipFile,
  ]);

  const copyMd = useCallback(() => {
    if (!result) {
      return;
    }
    const title = isSkills ? undefined : tr('MCP Source Security Audit', 'MCP 源码安全审计报告');
    void navigator.clipboard.writeText(auditToMarkdown(result, fileName, { reportTitle: title }));
    toast.success(tr('Markdown copied', 'Markdown 已复制'));
  }, [fileName, isSkills, result, tr]);

  const downloadJson = useCallback(() => {
    if (!result) {
      return;
    }
    const payload = scanMeta ? { ...result, scan: scanMeta } : result;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${variantId}-audit-${fileName ?? 'result'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [fileName, result, scanMeta, variantId]);

  const downloadSarif = useCallback(async () => {
    const taskId = scanMeta?.taskId;
    if (!taskId) {
      toast.error(tr('No scan task id for SARIF export', '无扫描任务 ID，无法导出 SARIF'));
      return;
    }
    try {
      const blob = await capabilityScanApi.downloadSarif(taskId);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `capability-scan-${taskId}.sarif.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(tr('SARIF downloaded', 'SARIF 已下载'));
    } catch (e) {
      toast.error(getAnalyzeErrorMessage(e));
    }
  }, [scanMeta?.taskId, tr]);

  const clearResults = useCallback(() => {
    setResult(null);
    setScanMeta(null);
    setViewingHistoryAt(null);
    onHistorySelectionClear?.();
    setAnalyzeError(null);
  }, [onHistorySelectionClear]);

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      <ScanSubmitBar
        isSkills={isSkills}
        isZh={isZh}
        loading={loading}
        zipFile={zipFile}
        setZipFile={setZipFile}
        markdownText={markdownText}
        setMarkdownText={setMarkdownText}
        fileName={fileName}
        setFileName={setFileName}
        sourceUrl={sourceUrl}
        setSourceUrl={setSourceUrl}
        scanStrategy={scanStrategy}
        setScanStrategy={setScanStrategy}
        debugEnginesText={debugEnginesText}
        setDebugEnginesText={setDebugEnginesText}
        useAsyncScan={useAsyncScan}
        setUseAsyncScan={setUseAsyncScan}
        needsLlm={needsLlm}
        modelOptions={modelOptions}
        selectedModelValue={selectedModelValue}
        setSelectedModelValue={setSelectedModelValue}
        taskStatus={taskStatus}
        onInputChange={clearResults}
        onRun={() => void runAnalyze()}
        showScanStrategy={showScanStrategy}
      />

      {needsLlm && integrationsError && (
        <p className="text-muted-foreground text-xs">
          {tr(
            'Could not load LLM integrations — server default may be used.',
            '无法加载 LLM 集成 — 将使用服务端默认配置。',
          )}
        </p>
      )}
      {needsLlm && isLoadingIntegrations && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" />
          {tr('Loading models…', '加载模型中…')}
        </p>
      )}

      {(result || analyzeError || loading) && (
        <div className="space-y-4">
          {analyzeError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>{tr('Analysis failed', '分析失败')}</AlertTitle>
              <AlertDescription>{analyzeError.message}</AlertDescription>
            </Alert>
          )}

          {loading && !result && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white/60 py-16 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-200">
              <div className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin" />
                {tr('Running security scan…', '正在进行安全扫描…')}
              </div>
              {scanStrategy === 'standard' || scanStrategy === 'deep_offline' ? (
                <span className="text-muted-foreground text-xs">
                  {tr(
                    'Two engines + LLM review may take 2–5 minutes',
                    '双引擎 + LLM 复审，通常需 2–5 分钟',
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {tr('Two engines, no LLM — usually 1–3 minutes', '双引擎无 LLM，通常 1–3 分钟')}
                </span>
              )}
            </div>
          )}

          {loading && result && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {tr('Re-scanning…', '正在重新扫描…')}
            </p>
          )}

          {result && (
            <div id="capability-scan-report" className="space-y-3">
              {viewingHistoryAt && (
                <p className="text-muted-foreground text-xs">
                  {tr('Viewing saved scan from', '正在查看历史扫描结果')} ·{' '}
                  {new Date(viewingHistoryAt).toLocaleString(isZh ? 'zh-CN' : undefined)}
                </p>
              )}
              <ScanReportPanel
                result={result}
                fileName={fileName ?? zipFile?.name ?? (sourceUrl.trim() || undefined)}
                strategy={scanMeta?.strategy}
                engines={scanMeta?.engines}
                assetManifest={scanMeta?.assetManifest}
                skillPreview={scanMeta?.skillPreview}
                isZh={isZh}
                onCopyMd={copyMd}
                onDownloadJson={downloadJson}
                onDownloadSarif={scanMeta?.taskId ? () => void downloadSarif() : undefined}
              />
            </div>
          )}
        </div>
      )}

      {!result && !loading && !analyzeError && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-muted-foreground text-sm">
            {tr(
              'Upload a package and run audit to view the security report.',
              '上传制品并运行审计后，将在此展示安全报告。',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
