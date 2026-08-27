import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import {
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  type EnrichedRiskRow,
  formatRemediationListTitle,
  formatTaskDisplayLabel,
  needsRiskConfirmation,
  resolveRiskRowAttackTypeLabel,
  resolveRiskRowLibraryLabel,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { RiskRelatedTestCasesSection } from '@/features/risk-closed-loop/risk-related-test-cases-section';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import '@/features/risk-closed-loop/risk-closed-loop.css';

type DrawerField = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: 'default' | 'pass' | 'fail' | 'muted';
};

function shortId(value: string, head = 8, tail = 4): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function displayTitle(title: string): string {
  return title.replace(/^整改[：:]\s*/, '').trim() || title;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rrc-drawer-section">
      <h3 className="rrc-drawer-section-title">{title}</h3>
      <div className="rrc-drawer-kv-panel">{children}</div>
    </section>
  );
}

function DrawerKvRow({
  label,
  children,
  tone = 'default',
}: {
  label: string;
  children: React.ReactNode;
  tone?: DrawerField['tone'];
}) {
  return (
    <div className="rrc-drawer-kv-item">
      <div className="rrc-drawer-kv-label">{label}</div>
      <div
        className={cn(
          'rrc-drawer-kv-value',
          tone === 'pass' && 'rrc-drawer-kv-pass',
          tone === 'fail' && 'rrc-drawer-kv-fail',
          tone === 'muted' && 'rrc-drawer-kv-muted',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function CodeValue({ value }: { value: string }) {
  if (!value || value === '—') {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <code className="rrc-drawer-code" title={value}>
      {value.length > 24 ? shortId(value, 10, 6) : value}
    </code>
  );
}

function evidenceText(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value.trim() || '—';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function evidenceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textList(value: unknown): string {
  if (!Array.isArray(value)) {
    return '—';
  }
  const items = value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return [record.code, record.name, record.checkTarget].filter(Boolean).join(' · ');
      }
      return '';
    })
    .filter(Boolean);
  return items.length ? items.join('\n') : '—';
}

function componentEvidenceFields(evidence: Record<string, unknown>): DrawerField[] {
  const verdict = evidenceRecord(evidence.judgeVerdict);
  const judgeConfig = evidenceRecord(evidence.judgeConfig);
  const mode = String(evidence.mode || '');
  const isModelReview = mode === 'llm_static_review';
  return [
    {
      label: '检测方式',
      value: isModelReview ? '审查模型静态审查' : '风险库规则匹配',
    },
    {
      label: '审查依据',
      value: String(
        evidence.summary ||
          (isModelReview ? '组件风险库元数据、组件描述和关联规则' : '能力组件风险库规则'),
      ),
      tone: 'muted',
    },
    {
      label: '组件',
      value:
        [evidence.componentName, evidence.componentKind, evidence.componentKey]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    ...(isModelReview
      ? [
          {
            label: '审查模型',
            value: String(judgeConfig.label || judgeConfig.providerId || '—'),
          },
          {
            label: '模型置信度',
            value:
              typeof verdict.confidence === 'number'
                ? `${Math.round(verdict.confidence * 100)}%`
                : '—',
          },
          {
            label: '模型证据',
            value: textList(evidence.evidenceSnippets),
            mono: true,
          },
          {
            label: '关联规则',
            value: textList(evidence.relatedRules),
            mono: true,
          },
        ]
      : [
          { label: '规则编号', value: String(evidence.ruleCode || '—') },
          { label: '规则名称', value: String(evidence.ruleName || '—') },
          { label: '检查目标', value: String(evidence.checkTarget || '—') },
        ]),
  ];
}

function buildComplianceFields(
  row: EnrichedRiskRow,
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>,
): DrawerField[] {
  const finding = detail?.finding || row.finding;
  const evidence =
    finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};

  return [
    { label: '控制项', value: finding?.title || displayTitle(row.title) },
    { label: '违规编号', value: <CodeValue value={row.violationNo || '—'} /> },
    { label: '合规控制库', value: String(evidence.libraryTitle || finding?.category || '—') },
    { label: '法规条款', value: String(evidence.regClause || '—') },
    {
      label: 'User Prompt',
      value: evidenceText(evidence.prompt || evidence.input),
      mono: true,
    },
    {
      label: 'Agent 输出',
      value: evidenceText(evidence.responsePreview || evidence.output),
      mono: true,
      tone: 'fail',
    },
    { label: '判定规则', value: finding?.description || row.remediationAdvice || '—' },
    {
      label: '整改建议',
      value: finding?.recommendation || row.remediationAdvice || '—',
      tone: 'pass',
    },
  ];
}

function buildComponentFields(
  row: EnrichedRiskRow,
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>,
): DrawerField[] {
  const finding = detail?.finding || row.finding;
  const evidence = evidenceRecord(finding?.evidence);
  return [
    { label: '风险项', value: finding?.title || row.title },
    { label: '组件 / 范围', value: finding?.category || '—' },
    { label: '风险描述', value: finding?.description || '—' },
    ...componentEvidenceFields(evidence),
    {
      label: '整改建议',
      value: finding?.recommendation || row.remediationAdvice || '—',
      tone: 'pass',
    },
  ];
}

function buildApiFields(
  row: EnrichedRiskRow,
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>,
): DrawerField[] {
  const finding = detail?.finding || row.finding;
  const evidence =
    finding?.evidence && typeof finding.evidence === 'object'
      ? (finding.evidence as Record<string, unknown>)
      : {};
  const responseRaw = evidence.responsePreview || evidence.output;
  const responseText =
    typeof responseRaw === 'string' ? formatDifyResponseForDisplay(responseRaw) : '—';
  return [
    {
      label: '风险项',
      value: formatRemediationListTitle(finding?.title || row.title),
    },
    { label: '场景库', value: resolveRiskRowLibraryLabel(row) },
    { label: '攻击方式', value: resolveRiskRowAttackTypeLabel(row) },
    { label: '测试输入', value: evidenceText(evidence.input || evidence.prompt), mono: true },
    {
      label: 'Agent 响应',
      value: responseText,
      mono: true,
      tone: 'fail',
    },
    { label: '判定说明', value: finding?.description || '—', tone: 'muted' },
    {
      label: '整改建议',
      value: finding?.recommendation || row.remediationAdvice || '—',
      tone: 'pass',
    },
  ];
}

function renderFieldRows(fields: DrawerField[]) {
  return fields.map((field) => (
    <DrawerKvRow key={field.label} label={field.label} tone={field.tone}>
      {field.mono ? (
        field.value === '—' ? (
          '—'
        ) : (
          <pre className="rrc-drawer-pre">{field.value}</pre>
        )
      ) : (
        field.value
      )}
    </DrawerKvRow>
  ));
}

type RiskDetailDrawerProps = {
  row: EnrichedRiskRow | null;
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  onConfirm?: (row: EnrichedRiskRow) => void;
  onAcceptRisk?: (row: EnrichedRiskRow) => void;
  onGoTask?: (taskId: string) => void;
};

export function RiskDetailDrawer({
  row,
  open,
  onClose,
  busy,
  onConfirm,
  onAcceptRisk,
  onGoTask,
}: RiskDetailDrawerProps) {
  const detailQuery = useQuery({
    queryKey: ['security-remediation-detail', row?.id],
    queryFn: () => detectionScanningApi.getRemediation(row!.id),
    enabled: open && Boolean(row?.id),
  });

  const detail = detailQuery.data;
  const displayRow = row;
  if (!displayRow) {
    return null;
  }

  const pendingConfirm = needsRiskConfirmation(displayRow);
  const kindLabel =
    displayRow.riskKind === 'compliance'
      ? '合规违规'
      : displayRow.riskKind === 'component'
        ? '组件风险'
        : 'API / 对话';
  const detailFields =
    displayRow.riskKind === 'compliance'
      ? buildComplianceFields(displayRow, detail)
      : displayRow.riskKind === 'component'
        ? buildComponentFields(displayRow, detail)
        : buildApiFields(displayRow, detail);
  const detailSectionTitle = displayRow.riskKind === 'compliance' ? '合规判定' : '风险详情';

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="rrc-risk-drawer flex w-full flex-col gap-0 p-0 sm:max-w-[680px]">
        <SheetHeader className="rrc-risk-drawer-head border-b px-6 py-5">
          <p className="rrc-risk-drawer-eyebrow">{kindLabel}</p>
          <SheetTitle className="pr-8 text-left text-lg font-bold leading-snug">
            {displayTitle(displayRow.title)}
          </SheetTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={DISPLAY_STATUS_CLASS[displayRow.displayStatus]}>
              {DISPLAY_STATUS_LABEL[displayRow.displayStatus]}
            </Badge>
            <RiskBadge level={displayRow.riskLevel} />
          </div>
          <div className="rrc-risk-drawer-meta">
            <span>
              评估任务{' '}
              <span className="font-semibold text-foreground">
                {formatTaskDisplayLabel(
                  displayRow.taskId,
                  displayRow.scanTask?.name || displayRow.taskId,
                )}
              </span>
            </span>
            {displayRow.violationNo ? (
              <span>
                违规编号 <CodeValue value={displayRow.violationNo} />
              </span>
            ) : null}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-4">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载风险详情…
            </div>
          ) : (
            <div className="space-y-4">
              <DrawerSection title="归属信息">
                <DrawerKvRow label="Agent">{displayRow.agentName}</DrawerKvRow>
                <DrawerKvRow label="评估任务">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{displayRow.scanTask?.name || shortId(displayRow.taskId, 12, 6)}</span>
                    {onGoTask && displayRow.taskId ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto gap-1 px-0 text-xs"
                        onClick={() => onGoTask(displayRow.taskId)}
                      >
                        查看任务
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </DrawerKvRow>
                <DrawerKvRow label="责任人">{displayRow.ownerName || '未指派'}</DrawerKvRow>
                <DrawerKvRow label="部门" tone="muted">
                  {displayRow.department || '—'}
                </DrawerKvRow>
              </DrawerSection>

              <DrawerSection title={detailSectionTitle}>
                {renderFieldRows(detailFields)}
              </DrawerSection>

              <RiskRelatedTestCasesSection row={displayRow} detail={detail} enabled={open} />

              {detail?.evidence?.length ? (
                <DrawerSection title="整改证据">
                  <div className="space-y-2 p-3">
                    {detail.evidence.map((ev) => (
                      <div key={ev.id} className="rrc-drawer-evidence-card">
                        <div className="font-medium">{ev.title}</div>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {ev.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </DrawerSection>
              ) : null}
            </div>
          )}
        </div>

        <SheetFooter className="rrc-risk-drawer-foot border-t bg-background px-6 py-4">
          {pendingConfirm && onConfirm ? (
            <Button type="button" disabled={busy} onClick={() => onConfirm(displayRow)}>
              确认风险
            </Button>
          ) : null}
          {onAcceptRisk &&
          displayRow.displayStatus !== 'closed' &&
          displayRow.displayStatus !== 'risk_accepted' ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => onAcceptRisk(displayRow)}
            >
              风险接受，不再发起复测
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
