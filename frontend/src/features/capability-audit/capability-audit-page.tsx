import { useCallback, useEffect, useState } from 'react';

import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  CAPABILITY_AUDIT_DIMENSION_COUNT,
  CAPABILITY_AUDIT_DIMENSION_IDS,
  dimensionLabel,
} from 'capability-audit/shared/dimensions';
import { History, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArtifactAuditPanel } from './artifact-audit-panel';
import { ArtifactHistoryPanel } from './artifact-history-panel';
import { CapabilityOpsPanel } from './capability-ops-panel';
import {
  CapabilityAuditShell,
  resolveCapabilityAuditView,
  type CapabilityAuditView,
} from './capability-audit-shell';
import { ScanReportToc, type TocItem } from './scan-report-toc';
import { useCapabilityAuditUiConfig } from './use-capability-audit-ui-config';

const SKILLS_VARIANT = 'skills' as const;

function OverviewSection({
  historyRefresh,
  onStart,
  onDeleted,
  onViewRecord,
}: {
  historyRefresh: number;
  onStart: () => void;
  onDeleted: () => void;
  onViewRecord: (row: { auditType: string; id: string }) => void;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const { config } = useCapabilityAuditUiConfig();

  return (
    <>
      <div className="mb-8 flex items-start gap-3">
        <Shield className="size-9 shrink-0" />
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight">
            {tr('SKILL Component Security Assessment', 'SKILL组件安全评估')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {tr(
              'Upload a SKILLS package for multi-engine scanning across 17 ClawHub security dimensions. Review local audit history anytime.',
              '上传 SKILLS 技能包，进行多引擎扫描与 ClawHub 17 维安全评估。可随时查看本机审计历史。',
            )}
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            <span className="text-foreground/80 font-medium">
              {tr(
                `${CAPABILITY_AUDIT_DIMENSION_COUNT}-dimension scope: `,
                `${CAPABILITY_AUDIT_DIMENSION_COUNT} 维评估范围：`,
              )}
            </span>
            {CAPABILITY_AUDIT_DIMENSION_IDS.map((id) => dimensionLabel(id, isZh)).join(' · ')}
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {tr(
              'Supports .zip / .tar.gz, Markdown, or a package URL in Run audit.',
              '运行审计支持 .zip / .tar.gz、Markdown 或技能包直链。',
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onStart}>
              {tr('Start audit →', '开始审计 →')}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/capability-audit" search={{ view: 'history' }}>
                {tr('View history', '查看历史')}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-8 border-t pt-10">
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold tracking-tight">{tr('Recent audits', '近期审计')}</h2>
            <Link
              to="/capability-audit"
              search={{ view: 'history' }}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              {tr('All history', '全部历史')}
            </Link>
          </div>
          <ArtifactHistoryPanel
            isZh={isZh}
            activeVariant={SKILLS_VARIANT}
            refreshKey={historyRefresh}
            layout="compact"
            showHeading={false}
            onDeleted={onDeleted}
            onViewRecord={onViewRecord}
          />
        </section>

        {config.showAdvancedScanUi ? (
          <section className="max-w-xl">
            <CapabilityOpsPanel isZh={isZh} />
          </section>
        ) : null}
      </div>
    </>
  );
}

function RunSection({
  historySelection,
  onHistorySelectionClear,
  onAuditComplete,
}: {
  historySelection: { auditType: string; id: string; nonce: number } | null;
  onHistorySelectionClear: () => void;
  onAuditComplete: () => void;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [reportToc, setReportToc] = useState<TocItem[] | null>(null);

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <Shield className="size-8 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tr('Run audit', '运行审计')}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {tr(
              'Upload a package, paste Markdown, or provide a URL, then run the multi-engine scan.',
              '上传技能包、粘贴 Markdown 或填写 URL，然后运行多引擎扫描。',
            )}
          </p>
        </div>
      </div>

      <div
        className={
          reportToc && reportToc.length > 0
            ? 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_260px]'
            : 'min-w-0'
        }
      >
        <div className="min-w-0">
          <ArtifactAuditPanel
            variantId={SKILLS_VARIANT}
            isZh={isZh}
            historySelection={historySelection}
            onHistorySelectionClear={onHistorySelectionClear}
            onAuditComplete={onAuditComplete}
            onReportTocChange={setReportToc}
          />
        </div>
        {reportToc && reportToc.length > 0 ? (
          <aside className="flex min-w-0 flex-col xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)] xl:max-h-[calc(100vh-8rem)]">
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <ScanReportToc items={reportToc} isZh={isZh} />
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function HistorySection({
  refreshKey,
  onDeleted,
  onViewRecord,
}: {
  refreshKey: number;
  onDeleted: () => void;
  onViewRecord: (row: { auditType: string; id: string }) => void;
}) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <History className="size-8 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tr('Audit history', '审计历史')}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {tr(
              'Local browser records of SKILL component assessments. Open a row to reopen the report in Run audit.',
              '本浏览器保存的 SKILL 组件评估记录。点击查看可在「运行审计」中重新打开报告。',
            )}
          </p>
        </div>
      </div>
      <ArtifactHistoryPanel
        isZh={isZh}
        activeVariant={SKILLS_VARIANT}
        refreshKey={refreshKey}
        layout="page"
        onDeleted={onDeleted}
        onViewRecord={onViewRecord}
      />
    </>
  );
}

export function CapabilityAuditPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    view?: string;
    historyId?: string;
    auditType?: string;
  };
  const activeView: CapabilityAuditView = resolveCapabilityAuditView(search);

  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historySelection, setHistorySelection] = useState<{
    auditType: string;
    id: string;
    nonce: number;
  } | null>(null);

  const setView = useCallback(
    (view: CapabilityAuditView, extra?: { historyId?: string; auditType?: string }) => {
      void navigate({
        to: '/capability-audit',
        search: {
          view,
          ...(extra?.historyId && extra.auditType
            ? { historyId: extra.historyId, auditType: extra.auditType }
            : {}),
        },
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (activeView !== 'run') {
      return;
    }
    if (typeof search.historyId === 'string' && search.historyId && typeof search.auditType === 'string') {
      setHistorySelection({
        auditType: search.auditType,
        id: search.historyId,
        nonce: Date.now(),
      });
    }
  }, [activeView, search.historyId, search.auditType]);

  const handleHistorySelectionClear = useCallback(() => {
    setHistorySelection(null);
    if (search.historyId || search.auditType) {
      void navigate({
        to: '/capability-audit',
        search: { view: 'run' },
      });
    }
  }, [navigate, search.auditType, search.historyId]);

  const handleViewHistoryRecord = useCallback(
    (row: { auditType: string; id: string }) => {
      setHistorySelection({ auditType: row.auditType, id: row.id, nonce: Date.now() });
      setView('run', { historyId: row.id, auditType: row.auditType });
    },
    [setView],
  );

  return (
    <CapabilityAuditShell activeView={activeView}>
      {activeView === 'overview' ? (
        <OverviewSection
          historyRefresh={historyRefresh}
          onStart={() => setView('run')}
          onDeleted={() => setHistoryRefresh((k) => k + 1)}
          onViewRecord={handleViewHistoryRecord}
        />
      ) : null}
      {activeView === 'run' ? (
        <RunSection
          historySelection={historySelection}
          onHistorySelectionClear={handleHistorySelectionClear}
          onAuditComplete={() => setHistoryRefresh((k) => k + 1)}
        />
      ) : null}
      {activeView === 'history' ? (
        <HistorySection
          refreshKey={historyRefresh}
          onDeleted={() => setHistoryRefresh((k) => k + 1)}
          onViewRecord={handleViewHistoryRecord}
        />
      ) : null}
    </CapabilityAuditShell>
  );
}
