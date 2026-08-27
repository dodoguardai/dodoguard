import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ComplianceCaseDetailBody } from '@/features/compliance-case-library/compliance-case-form-fields';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import {
  CASE_STATUS_TEXT,
  mapTechnicalLibrary,
  type CaseStatus,
  type MappedTechnicalLibrary,
} from '@/features/technical-case-library/shared';
import { TechnicalCaseDetailBody } from '@/features/technical-case-library/technical-case-form-fields';
import {
  renderTechnicalPayloadPreview,
  resolveTestMethodLabel,
} from '@/features/technical-case-library/technical-case-test-methods';
import type { EnrichedRiskRow } from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityCaseLibrary, SecurityTestCase } from '@/types/entities';

type CaseRef = {
  libraryId: string;
  testCaseId?: string;
  caseCode?: string;
};

function evidenceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function resolveSourceTestCaseRefs(
  row: EnrichedRiskRow,
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>,
): CaseRef[] {
  const finding = detail?.finding || row.finding;
  const evidence = evidenceRecord(finding?.evidence);
  const refs: CaseRef[] = [];
  const pushRef = (ref: CaseRef) => {
    if (!ref.libraryId) {
      return;
    }
    const exists = refs.some(
      (item) =>
        item.libraryId === ref.libraryId &&
        (ref.testCaseId ? item.testCaseId === ref.testCaseId : item.caseCode === ref.caseCode),
    );
    if (!exists) {
      refs.push(ref);
    }
  };

  if (finding?.caseLibraryId) {
    pushRef({
      libraryId: finding.caseLibraryId,
      testCaseId: finding.testCaseId || undefined,
      caseCode: firstText(evidence.caseCode),
    });
  }

  const evidenceLibraryId = firstText(evidence.libraryId);
  if (evidenceLibraryId) {
    pushRef({
      libraryId: evidenceLibraryId,
      testCaseId: firstText(evidence.caseId),
      caseCode: firstText(evidence.caseCode),
    });
  }

  return refs;
}

function matchTestCase(cases: SecurityTestCase[], ref: CaseRef): SecurityTestCase | undefined {
  if (ref.testCaseId) {
    const byId = cases.find((item) => item.id === ref.testCaseId);
    if (byId) {
      return byId;
    }
  }
  if (ref.caseCode) {
    const byCode = cases.find((item) => item.caseCode === ref.caseCode);
    if (byCode) {
      return byCode;
    }
  }
  return undefined;
}

function buildFallbackTestCase(
  row: EnrichedRiskRow,
  ref: CaseRef,
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>,
): SecurityTestCase {
  const finding = detail?.finding || row.finding;
  const evidence = evidenceRecord(finding?.evidence);
  const now = new Date().toISOString();
  return {
    id: ref.testCaseId || ref.caseCode || row.findingId || row.id,
    organizationId: finding?.organizationId || '',
    libraryId: ref.libraryId,
    caseCode: ref.caseCode || firstText(evidence.caseCode) || '—',
    name:
      firstText(evidence.caseName, evidence.testCaseName, finding?.title, row.title) || '命中用例',
    attackType: firstText(evidence.attackType, finding?.category, 'direct'),
    prompt: firstText(evidence.prompt, evidence.input),
    expectedPass: firstText(evidence.expectedPass) || null,
    expectedFail: firstText(evidence.expectedFail, finding?.description) || null,
    riskLevel: (finding?.riskLevel || row.riskLevel || 'medium') as SecurityTestCase['riskLevel'],
    status: 'published',
    sortOrder: 0,
    metadata:
      evidence.caseMetadata && typeof evidence.caseMetadata === 'object'
        ? (evidence.caseMetadata as Record<string, unknown>)
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function isComplianceLibrary(library: SecurityCaseLibrary | undefined, row: EnrichedRiskRow): boolean {
  if (row.riskKind === 'compliance') {
    return true;
  }
  if (!library) {
    return false;
  }
  const domain = library.domain.toLowerCase();
  return domain.includes('compliance') || domain.includes('合规');
}

function caseStatusBadge(status: string) {
  if (status === 'published') {
    return '启用';
  }
  if (status === 'archived') {
    return '停用';
  }
  return CASE_STATUS_TEXT[status as CaseStatus] || status;
}

type RiskRelatedTestCasesSectionProps = {
  row: EnrichedRiskRow;
  detail?: Awaited<ReturnType<typeof detectionScanningApi.getRemediation>>;
  enabled?: boolean;
};

export function RiskRelatedTestCasesSection({
  row,
  detail,
  enabled = true,
}: RiskRelatedTestCasesSectionProps) {
  const [detailCase, setDetailCase] = useState<SecurityTestCase | null>(null);
  const refs = useMemo(() => resolveSourceTestCaseRefs(row, detail), [row, detail]);
  const primaryRef = refs[0];
  const libraryId = primaryRef?.libraryId;

  const libraryQuery = useQuery({
    queryKey: ['risk-source-case-library', libraryId],
    enabled: enabled && Boolean(libraryId),
    queryFn: async () => {
      const result = await detectionScanningApi.listCaseLibraries({ limit: 200 });
      const library = result.data.find((item) => item.id === libraryId);
      if (!library) {
        throw new Error('检测库不存在');
      }
      return library;
    },
  });

  const casesQuery = useQuery({
    queryKey: ['risk-source-test-cases', libraryId],
    enabled: enabled && Boolean(libraryId),
    queryFn: () => detectionScanningApi.listTestCases(libraryId!),
  });

  const resolvedCases = useMemo(() => {
    if (!primaryRef) {
      return [];
    }
    const cases = casesQuery.data || [];
    const matched = matchTestCase(cases, primaryRef);
    if (matched) {
      return [matched];
    }
    if (casesQuery.isSuccess) {
      return [buildFallbackTestCase(row, primaryRef, detail)];
    }
    return [];
  }, [casesQuery.data, casesQuery.isSuccess, detail, primaryRef, row]);

  const library = libraryQuery.data;
  const compliance = isComplianceLibrary(library, row);
  const mappedTechnicalLibrary = library && !compliance ? mapTechnicalLibrary(library) : null;
  const isLoading = Boolean(libraryId) && (libraryQuery.isLoading || casesQuery.isLoading);

  return (
    <section className="rrc-drawer-section">
      <div className="border-b px-3 py-3">
        <h3 className="rrc-drawer-section-title mb-1">命中测试用例</h3>
        <p className="text-xs text-muted-foreground">
          展示评估或合规任务执行时，实际命中并判定为风险的检测用例（来自对应用例库）
        </p>
      </div>

      {!primaryRef ? (
        <div className="p-3 text-sm text-muted-foreground">未记录来源检测用例，可能为历史推送数据。</div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载来源检测用例…
        </div>
      ) : resolvedCases.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">未在用例库中找到对应用例。</div>
      ) : (
        <div className="p-3">
          {library ? (
            <p className="mb-3 text-xs text-muted-foreground">
              来源库：<span className="font-medium text-foreground">{library.title}</span>
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[32%]">
                    {compliance ? '用例名称' : '测试输入'}
                  </TableHead>
                  <TableHead>测试方式</TableHead>
                  <TableHead>风险等级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>{compliance ? '违规命中表现' : '风险命中表现'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedCases.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => setDetailCase(item)}
                  >
                    <TableCell>
                      {compliance ? (
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.name}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {item.caseCode}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="max-h-24 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
                          title={item.prompt}
                        >
                          {renderTechnicalPayloadPreview(item)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {resolveTestMethodLabel(item.attackType, item.metadata)}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={item.riskLevel} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{caseStatusBadge(item.status)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {item.expectedFail || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Sheet open={Boolean(detailCase)} onOpenChange={(open) => !open && setDetailCase(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px] [&>button]:hidden">
          {detailCase ? (
            <>
              <SheetHeader className="relative space-y-3 border-b px-6 py-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute end-4 top-4 h-8 w-8"
                  onClick={() => setDetailCase(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <p className="text-xs text-muted-foreground">命中检测用例详情</p>
                <SheetTitle className="text-xl leading-snug">{detailCase.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="font-mono text-sm text-foreground">{detailCase.caseCode}</span>
                    <RiskBadge level={detailCase.riskLevel} />
                    <Badge variant="outline">{caseStatusBadge(detailCase.status)}</Badge>
                    <Badge variant="outline">
                      {resolveTestMethodLabel(detailCase.attackType, detailCase.metadata)}
                    </Badge>
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {compliance ? (
                  <ComplianceCaseDetailBody
                    libTitle={library?.title || '合规检测用例库'}
                    libDomain={library?.domain || '—'}
                    libCategory={
                      library?.metadata && typeof library.metadata.category === 'string'
                        ? library.metadata.category
                        : undefined
                    }
                    caseItem={{
                      name: detailCase.name,
                      attackType: detailCase.attackType,
                      prompt: detailCase.prompt,
                      expectedPass: detailCase.expectedPass,
                      expectedFail: detailCase.expectedFail,
                      riskLevel: detailCase.riskLevel as 'critical' | 'high' | 'medium' | 'low',
                      status:
                        detailCase.status === 'archived'
                          ? 'draft'
                          : (detailCase.status as 'published' | 'reviewing' | 'draft'),
                      metadata: detailCase.metadata,
                    }}
                  />
                ) : mappedTechnicalLibrary ? (
                  <TechnicalCaseDetailBody
                    library={mappedTechnicalLibrary as MappedTechnicalLibrary}
                    caseItem={{
                      caseCode: detailCase.caseCode,
                      name: detailCase.name,
                      attackType: detailCase.attackType,
                      prompt: detailCase.prompt,
                      expectedPass: detailCase.expectedPass,
                      expectedFail: detailCase.expectedFail,
                      riskLevel: detailCase.riskLevel,
                      status: detailCase.status,
                      metadata: detailCase.metadata,
                    }}
                  />
                ) : null}
              </div>
              <SheetFooter className="flex-row justify-end border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setDetailCase(null)}>
                  关闭
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
