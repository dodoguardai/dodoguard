/**
 * Step 3: Run audit and view results (TrustTools-style summary + dimension cards).
 */

import { useMemo, useState } from 'react';

import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  inferSkillAuditDimensionClient,
  SKILL_AUDIT_DIMENSION_IDS,
  type SkillAuditDimensionId,
} from '../dimensions';
import { riskVariant } from '../utils';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';
import { engineLabel } from 'capability-audit/shared/engines';

export interface Step3RunResultsProps {
  loading: boolean;
  result: (SkillsMdAuditData & { reportId?: string }) | null;
  analyzeError: { message: string; code?: string } | null;
  onRun: () => void;
  onCopyMd: () => void;
  onDownloadJson: () => void;
  /** i18n key prefix for page strings; dimension labels always use pages.skillsMdAudit.dimensions.* */
  i18nPagePrefix?: string;
}

function dimensionForFinding(f: SkillsMdAuditData['findings'][number]): SkillAuditDimensionId {
  return inferSkillAuditDimensionClient({
    category: f.category,
    dimension: f.dimension,
  });
}

export function Step3RunResults({
  loading,
  result,
  analyzeError,
  onRun,
  onCopyMd,
  onDownloadJson,
  i18nPagePrefix = 'pages.skillsMdAudit',
}: Step3RunResultsProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const [dimensionFilter, setDimensionFilter] = useState<SkillAuditDimensionId | 'all'>('all');

  const countsByDimension = useMemo(() => {
    const m = new Map<SkillAuditDimensionId, number>();
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      m.set(id, 0);
    }
    if (!result) {
      return m;
    }
    for (const f of result.findings) {
      const d = dimensionForFinding(f);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [result]);

  const filteredFindings = useMemo(() => {
    if (!result) {
      return [];
    }
    if (dimensionFilter === 'all') {
      return result.findings;
    }
    return result.findings.filter((f) => dimensionForFinding(f) === dimensionFilter);
  }, [result, dimensionFilter]);

  if (result) {
    const scannedCount = result.scannedFiles?.length ?? 1;
    const harmless = result.findings.length === 0 && result.overallRisk === 'low';

    return (
      <div className="space-y-6">
        <div
          className={
            harmless
              ? 'flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 sm:flex-row sm:items-start sm:justify-between'
              : 'flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-start sm:justify-between'
          }
        >
          <div className="flex gap-3">
            {harmless ? (
              <CheckCircle2
                className="text-emerald-600 dark:text-emerald-400 mt-0.5 size-9 shrink-0"
                aria-hidden
              />
            ) : (
              <ShieldAlert
                className="text-amber-600 dark:text-amber-400 mt-0.5 size-9 shrink-0"
                aria-hidden
              />
            )}
            <div>
              <h3 className="text-lg font-semibold">
                {harmless
                  ? t(`${i18nPagePrefix}.statusHarmless`)
                  : t(`${i18nPagePrefix}.statusRisks`)}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {t(`${i18nPagePrefix}.scannedFiles`, { count: scannedCount })} ·{' '}
                {t(`${i18nPagePrefix}.findingsCount`, { count: result.findings.length })}
              </p>
              {result.truncated && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                  {tr(
                    'Part of the package was truncated for model limits.',
                    '部分内容因模型上下文限制被截断。',
                  )}
                </p>
              )}
              {result.warnings && result.warnings.length > 0 && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                  {result.warnings.join(' ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={riskVariant(result.overallRisk)}>{result.overallRisk}</Badge>
            {result.reportId && (
              <Button variant="default" size="sm" asChild>
                <Link to="/reports/$reportId" params={{ reportId: result.reportId }}>
                  {tr('View in Reports', '在报告中查看')}
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onCopyMd}>
              <Copy className="mr-1 size-4" />
              {tr('Copy Markdown', '复制 Markdown')}
            </Button>
            <Button variant="outline" size="sm" onClick={onDownloadJson}>
              <Download className="mr-1 size-4" />
              {tr('Download JSON', '下载 JSON')}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-semibold">{tr('Summary', '摘要')}</h4>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{result.summary}</p>
        </div>

        {result.scannedFiles && result.scannedFiles.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="hover:bg-muted/50 text-muted-foreground flex items-center gap-2 text-sm font-medium"
              >
                <ChevronDown className="size-4" />
                {tr('Scanned files', '已扫描文件列表')} ({result.scannedFiles.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="border-border mt-2 max-h-40 list-inside list-disc overflow-y-auto rounded-md border p-3 font-mono text-xs">
                {result.scannedFiles.map((s) => (
                  <li key={s.path}>{s.path}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{t(`${i18nPagePrefix}.dimensionsTitle`)}</h4>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={dimensionFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDimensionFilter('all')}
              >
                {t(`${i18nPagePrefix}.dimensionFilterAll`)}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SKILL_AUDIT_DIMENSION_IDS.map((id) => {
              const n = countsByDimension.get(id) ?? 0;
              const active = dimensionFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDimensionFilter(active ? 'all' : id)}
                  className={
                    active
                      ? 'border-primary bg-primary/5 rounded-lg border p-3 text-left text-sm shadow-xs'
                      : 'hover:bg-muted/50 rounded-lg border p-3 text-left text-sm shadow-xs'
                  }
                >
                  <div className="text-muted-foreground text-xs font-medium">
                    {t(`pages.skillsMdAudit.dimensions.${id}`)}
                  </div>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug">
                    {t(`pages.skillsMdAudit.dimensionDescriptions.${id}`)}
                  </p>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-semibold">
            {tr('Findings', '发现项')}
            {dimensionFilter !== 'all'
              ? ` — ${t(`pages.skillsMdAudit.dimensions.${dimensionFilter}`)}`
              : ''}{' '}
            ({filteredFindings.length})
          </h4>
          {filteredFindings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tr('No findings in this filter.', '该筛选下无发现项。')}
            </p>
          ) : (
            <ul className="space-y-4">
              {filteredFindings.map((f, i) => (
                <li key={`${f.location}-${i}`} className="rounded-md border p-4 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={riskVariant(f.severity)}>{f.severity}</Badge>
                    <Badge variant="outline">
                      {t(`pages.skillsMdAudit.dimensions.${dimensionForFinding(f)}`)}
                    </Badge>
                    {(f.sourceEngines ?? []).map((eng) => (
                      <Badge key={eng} variant="secondary" className="text-xs">
                        {engineLabel(eng, isZh)}
                      </Badge>
                    ))}
                    <span className="font-medium">{f.category}</span>
                    {f.sourceFile && (
                      <span className="text-muted-foreground text-xs">
                        {t(`${i18nPagePrefix}.sourceFile`)}: {f.sourceFile}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">{f.location}</span>
                  </div>
                  <p className="mb-2">{f.issue}</p>
                  <p className="text-muted-foreground mb-2 text-xs">
                    <strong>{tr('Evidence:', '证据：')}</strong> {f.evidence}
                  </p>
                  <p className="text-xs">
                    <strong>{tr('Recommendation:', '建议：')}</strong> {f.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="hover:bg-muted/50 flex items-center gap-2 text-sm font-semibold"
            >
              <ChevronDown className="size-4" />
              {t(`${i18nPagePrefix}.detailByDimension`)}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            {SKILL_AUDIT_DIMENSION_IDS.map((id) => {
              const inDim = result.findings.filter((f) => dimensionForFinding(f) === id);
              if (inDim.length === 0) {
                return null;
              }
              return (
                <div key={id} className="rounded-md border">
                  <div className="bg-muted/40 px-3 py-2 text-sm font-semibold">
                    {t(`pages.skillsMdAudit.dimensions.${id}`)} ({inDim.length})
                  </div>
                  <ul className="divide-y p-2">
                    {inDim.map((f, j) => (
                      <li key={`${id}-${j}`} className="py-2 text-xs">
                        <span className="font-medium">{f.severity}</span> — {f.issue}
                        {f.sourceFile ? (
                          <span className="text-muted-foreground"> ({f.sourceFile})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        {result.recommendations.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold">{tr('General recommendations', '通用建议')}</h4>
            <ul className="list-inside list-disc text-sm">
              {result.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {analyzeError && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{tr('Analysis failed', '分析失败')}</AlertTitle>
          <AlertDescription className="space-y-2">
            {analyzeError.code && (
              <p className="font-mono text-xs opacity-90">
                {tr('Code', '错误码')}: {analyzeError.code}
              </p>
            )}
            <p className="text-sm">{analyzeError.message}</p>
            <p className="text-muted-foreground text-xs">
              {tr(
                'If the error mentions invalid JSON, try a model that follows JSON output reliably in Settings → Integrations, or shorten the document and run again.',
                '若错误提示 JSON 无效，请在 设置 → 集成 中选择更稳定输出 JSON 的模型，或缩短文档后重试。',
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-6">
          {tr(
            'Click below to run the security audit with your selected model. This may take a minute.',
            '点击下方按钮使用已选模型运行安全审计，可能需要约一分钟。',
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
