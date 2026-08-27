/**
 * Step 3: Run audit and view results (n8n) — report-style layout.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfigAuditResultView } from '@/features/reports/config-audit-result-view';
import type { N8nConfigAuditData } from '@/services/api/n8n-config-audit';

export interface Step3RunResultsProps {
  loading: boolean;
  result: (N8nConfigAuditData & { reportId?: string }) | null;
  analyzeError: { message: string; code?: string } | null;
  onRun: () => void;
  onCopyMd: () => void;
}

export function Step3RunResults({
  loading,
  result,
  analyzeError,
  onRun,
  onCopyMd,
}: Step3RunResultsProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  if (result) {
    return (
      <ConfigAuditResultView
        platform="n8n"
        result={result}
        reportId={result.reportId}
        embedded
        onCopyMd={onCopyMd}
        extraActions={
          <Button variant="outline" size="sm" disabled={loading} onClick={onRun}>
            {loading ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1 size-4" />
            )}
            {tr('Re-run', '重新审计')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {analyzeError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{tr('Analysis failed', '分析失败')}</AlertTitle>
          <AlertDescription className="space-y-2">
            {analyzeError.code ? (
              <p className="font-mono text-xs opacity-90">
                {tr('Code', '错误码')}: {analyzeError.code}
              </p>
            ) : null}
            <p className="text-sm">{analyzeError.message}</p>
            <p className="text-muted-foreground text-xs">
              {tr(
                'If the error mentions invalid JSON, try a model that follows JSON output reliably in Settings → Models, or use a smaller export and run again.',
                '若提示 JSON 无效，请在「设置 → 模型」中换用更稳定遵循 JSON 输出的模型，或缩小配置文件后重试。',
              )}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
        <p className="text-muted-foreground mb-6 max-w-md text-sm leading-relaxed">
          {tr(
            'Click below to run the security audit with your selected model. This may take a minute.',
            '点击下方按钮，使用已选审查模型运行配置安全审计（约需一分钟）。',
          )}
        </p>
        <Button size="lg" disabled={loading} onClick={onRun}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {tr('Analyzing…', '分析中…')}
            </>
          ) : (
            tr('Run Audit', '运行审计')
          )}
        </Button>
      </div>
    </div>
  );
}
