import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Copy, FileUp, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  CASE_STATUS_TEXT,
  type CaseStatus,
  type MappedTechnicalLibrary,
  MiniStat,
  mapTechnicalLibrary,
  paginate,
  RiskBadge,
  Shell,
} from './shared';
import { TechnicalCaseAiExpandDialog } from './technical-case-ai-expand-dialog';
import {
  ALL_DOMAIN_TAB,
  buildDomainTabs,
  buildTechnicalDomainMetas,
  resolveDomainMeta,
  tabLabelForDomain,
} from './technical-case-domains';
import { TechnicalCaseDetailBody } from './technical-case-form-fields';
import { TechnicalCaseImportDialog } from './technical-case-import-dialog';
import {
  buildTechnicalLibraryPayload,
  type LibraryFormState,
  TechnicalCaseLibraryFormDialog,
} from './technical-case-library-form-dialog';
import {
  buildTechnicalCasePayload,
  emptyTechnicalCaseForm,
  TechnicalCaseSampleFormDialog,
  technicalCaseFormFromEntity,
} from './technical-case-sample-form-dialog';
import {
  buildTestMethodFilterTabs,
  renderTechnicalPayloadPreview,
  resolveTestMethodFilterKey,
  resolveTestMethodLabel,
} from './technical-case-test-methods';
import type { PaginatedResponse } from '@/types/api';
import type { SecurityCaseLibrary, SecurityTestCase } from '@/types/entities';

import type { TechnicalCaseFormState } from './technical-case-form-fields';

type DetailPageProps = {
  libraryId: string;
  returnDomain?: string;
  highlightCase?: string;
};

function buildLibraryPayload(form: LibraryFormState) {
  return buildTechnicalLibraryPayload(form);
}

function isAiExpandedCase(item: SecurityTestCase) {
  const metadata = item.metadata || {};
  const caseBasis = typeof metadata.caseBasis === 'string' ? metadata.caseBasis.trim() : '';
  return caseBasis === 'AI 自动扩充';
}

export function TechnicalCaseLibraryDetailPage({
  libraryId,
  returnDomain = ALL_DOMAIN_TAB,
  highlightCase,
}: DetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const libraryQueryKey = ['technical-case-library', libraryId] as const;
  const [testMethodFilter, setTestMethodFilter] = useState<string>('all');
  const [sampleSearch, setSampleSearch] = useState('');
  const [samplePage, setSamplePage] = useState(1);
  const [detailCase, setDetailCase] = useState<SecurityTestCase | null>(null);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<SecurityTestCase | null>(null);
  const [caseForm, setCaseForm] = useState<TechnicalCaseFormState | null>(null);
  const [editLibraryOpen, setEditLibraryOpen] = useState(false);
  const [aiExpandOpen, setAiExpandOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteLibraryOpen, setDeleteLibraryOpen] = useState(false);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SecurityTestCase | null>(null);

  const technicalLibrariesQuery = useQuery({
    queryKey: ['security-case-libraries', 'technical'],
    queryFn: () =>
      detectionScanningApi.listAllCaseLibraries({
        category: 'technical',
      }),
  });

  const libraryQuery = {
    ...technicalLibrariesQuery,
    data: technicalLibrariesQuery.data?.data.find((item) => item.id === libraryId),
  };

  const testCasesQuery = useQuery({
    queryKey: ['security-test-cases', libraryId],
    queryFn: () => detectionScanningApi.listTestCases(libraryId),
  });

  const lib: MappedTechnicalLibrary | null = libraryQuery.data
    ? mapTechnicalLibrary(libraryQuery.data)
    : null;
  const mappedTechnicalLibraries = useMemo(
    () => (technicalLibrariesQuery.data?.data || []).map((item) => mapTechnicalLibrary(item)),
    [technicalLibrariesQuery.data?.data],
  );
  const domainMetas = useMemo(
    () => buildTechnicalDomainMetas(mappedTechnicalLibraries),
    [mappedTechnicalLibraries],
  );
  const domainOptions = useMemo(
    () =>
      buildDomainTabs(domainMetas)
        .filter((item) => item !== ALL_DOMAIN_TAB)
        .map((item) => ({
          value: item,
          label: tabLabelForDomain(item, domainMetas),
        })),
    [domainMetas],
  );
  const domainMeta = lib ? resolveDomainMeta(lib.domain, domainMetas) : null;

  const testMethodFilterTabs = useMemo(
    () => buildTestMethodFilterTabs(testCasesQuery.data || []),
    [testCasesQuery.data],
  );

  const testMethodCounts = useMemo(() => {
    const cases = testCasesQuery.data || [];
    const counts: Record<string, number> = { all: cases.length };
    for (const tab of testMethodFilterTabs) {
      counts[tab.key] = tab.count;
    }
    return counts;
  }, [testCasesQuery.data, testMethodFilterTabs]);

  const filteredCases = useMemo(() => {
    const cases = testCasesQuery.data || [];
    const kw = sampleSearch.trim().toLowerCase();
    return cases.filter((item) => {
      const filterKey = resolveTestMethodFilterKey(item.attackType, item.metadata);
      if (testMethodFilter !== 'all' && filterKey !== testMethodFilter) {
        return false;
      }
      if (!kw) {
        return true;
      }
      const hay = [
        item.caseCode,
        item.name,
        item.prompt,
        item.expectedPass,
        item.expectedFail,
        resolveTestMethodLabel(item.attackType, item.metadata),
        isAiExpandedCase(item) ? 'AI 补充 AI 自动扩充' : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [testCasesQuery.data, sampleSearch, testMethodFilter]);

  const pagedCases = paginate(filteredCases, samplePage, 10);

  useEffect(() => {
    if (!highlightCase || !testCasesQuery.data?.length) {
      return;
    }
    const match = testCasesQuery.data.find((item) => item.caseCode === highlightCase);
    if (match) {
      setDetailCase(match);
      setSampleSearch(highlightCase);
    }
  }, [highlightCase, testCasesQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: (nextEnabled: boolean) => {
      if (!lib) {
        throw new Error('场景库不存在');
      }
      return detectionScanningApi.updateCaseLibrary(lib.id, { enabled: nextEnabled });
    },
    onMutate: async (nextEnabled) => {
      await queryClient.cancelQueries({ queryKey: libraryQueryKey });
      const previousLibrary = queryClient.getQueryData<SecurityCaseLibrary>(libraryQueryKey);
      const previousLibraryLists = queryClient.getQueriesData<
        PaginatedResponse<SecurityCaseLibrary>
      >({
        queryKey: ['security-case-libraries'],
      });

      queryClient.setQueryData<SecurityCaseLibrary>(libraryQueryKey, (current) =>
        current ? { ...current, enabled: nextEnabled } : current,
      );
      queryClient.setQueriesData<PaginatedResponse<SecurityCaseLibrary>>(
        { queryKey: ['security-case-libraries'] },
        (current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.id === libraryId ? { ...item, enabled: nextEnabled } : item,
                ),
              }
            : current,
      );

      return { previousLibrary, previousLibraryLists };
    },
    onSuccess: (updatedLibrary) => {
      queryClient.setQueryData<SecurityCaseLibrary>(libraryQueryKey, updatedLibrary);
      queryClient.setQueriesData<PaginatedResponse<SecurityCaseLibrary>>(
        { queryKey: ['security-case-libraries'] },
        (current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.id === updatedLibrary.id ? updatedLibrary : item,
                ),
              }
            : current,
      );
      queryClient.invalidateQueries({ queryKey: libraryQueryKey });
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      toast.success(updatedLibrary.enabled ? '场景库已启用' : '场景库已关闭');
    },
    onError: (error: Error, _nextEnabled, context) => {
      if (context?.previousLibrary) {
        queryClient.setQueryData<SecurityCaseLibrary>(libraryQueryKey, context.previousLibrary);
      }
      context?.previousLibraryLists.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error(error.message || '更新失败');
    },
  });

  const updateLibraryMutation = useMutation({
    mutationFn: (form: LibraryFormState) => {
      if (!libraryQuery.data) {
        throw new Error('场景库不存在');
      }
      return detectionScanningApi.updateCaseLibrary(
        libraryQuery.data.id,
        buildLibraryPayload(form),
      );
    },
    onSuccess: (updatedLibrary) => {
      queryClient.setQueryData<SecurityCaseLibrary>(libraryQueryKey, updatedLibrary);
      queryClient.setQueriesData<PaginatedResponse<SecurityCaseLibrary>>(
        { queryKey: ['security-case-libraries'] },
        (current) =>
          current
            ? {
                ...current,
                data: current.data.map((item) =>
                  item.id === updatedLibrary.id ? updatedLibrary : item,
                ),
              }
            : current,
      );
      queryClient.invalidateQueries({ queryKey: ['technical-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      setEditLibraryOpen(false);
      toast.success('场景库已更新');
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  });

  const deleteLibraryMutation = useMutation({
    mutationFn: () => detectionScanningApi.deleteCaseLibrary(libraryId),
    onSuccess: () => {
      toast.success('场景库已删除');
      navigate({ to: '/scan/security-cases', search: { domain: returnDomain } });
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const saveCaseMutation = useMutation({
    mutationFn: () => {
      if (!caseForm) {
        throw new Error('表单未初始化');
      }
      const payload = buildTechnicalCasePayload(caseForm, {
        status: editingCase?.status === 'archived' ? 'draft' : editingCase?.status || 'published',
      });
      if (editingCase) {
        return detectionScanningApi.updateTestCase(libraryId, editingCase.id, payload);
      }
      return detectionScanningApi.createTestCase(libraryId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-test-cases', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['technical-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      setCaseDialogOpen(false);
      setEditingCase(null);
      setCaseForm(null);
      toast.success(editingCase ? '用例已更新' : '用例已添加');
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (caseId: string) => detectionScanningApi.deleteTestCase(libraryId, caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-test-cases', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['technical-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      toast.success('用例已删除');
    },
  });

  function openCreateCase() {
    if (!lib) {
      return;
    }
    setEditingCase(null);
    const form = emptyTechnicalCaseForm(lib);
    setCaseForm(form);
    setCaseDialogOpen(true);
  }

  function openEditCase(item: SecurityTestCase) {
    if (!lib) {
      return;
    }
    setEditingCase(item);
    setCaseForm(technicalCaseFormFromEntity(item, lib));
    setCaseDialogOpen(true);
  }

  function copyCaseText(item: SecurityTestCase) {
    const text = [
      item.caseCode,
      item.name,
      renderTechnicalPayloadPreview(item, 500),
      item.expectedPass,
      item.expectedFail,
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制到剪贴板'),
      () => toast.error('复制失败'),
    );
  }

  if (libraryQuery.isLoading) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </Shell>
    );
  }

  if (!lib || !libraryQuery.data) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">场景库不存在</p>
        <Button asChild variant="outline" className="w-fit">
          <Link to="/scan/security-cases" search={{ domain: returnDomain }}>
            返回对话安全测试用例库
          </Link>
        </Button>
      </Shell>
    );
  }

  const detailKicker = `${domainMeta?.kpiLibLabel || lib.domain}场景库`;
  const primaryStandard = lib.tag || lib.standards[0] || 'OWASP ASI';

  return (
    <Shell>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link to="/scan/security-cases" search={{ domain: returnDomain }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回对话安全测试用例库
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl">
                {lib.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {detailKicker} · <code className="text-xs">{lib.libraryKey}</code>
                </p>
                <CardTitle className="mt-1 text-xl">{lib.title}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">{lib.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{primaryStandard}</Badge>
                  {lib.category ? <Badge variant="secondary">{lib.category}</Badge> : null}
                  <RiskBadge level={lib.level} />
                  <Badge
                    variant="outline"
                    className={
                      lib.enabled
                        ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                        : 'text-muted-foreground'
                    }
                  >
                    {lib.enabled ? '已启用' : '关闭'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditLibraryOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑配置
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={deleteLibraryMutation.isPending}
                onClick={() => setDeleteLibraryOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除库
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate(!lib.enabled)}
              >
                {lib.enabled ? '关闭库' : '启用库'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAiExpandOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 自动扩充
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                导入用例
              </Button>
              <Button size="sm" onClick={openCreateCase}>
                <Plus className="mr-2 h-4 w-4" />
                新建用例
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <MiniStat label="检测样本" value={`${lib.cases} 条`} />
            <MiniStat label="检测方式" value={lib.method} />
            <MiniStat label="检测依据" value={lib.standards[0] || '—'} />
          </div>

          <div className="mb-4 flex flex-col gap-3 border-t pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">检测用例列表</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  归属分类 · 基础信息 · 测试输入 · 预期判定 · 点击行查看详情 · 按测试方式筛选
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={testMethodFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setTestMethodFilter('all');
                    setSamplePage(1);
                  }}
                >
                  全部
                  <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                    {testMethodCounts.all}
                  </Badge>
                </Button>
                {testMethodFilterTabs.map((tab) => (
                  <Button
                    key={tab.key}
                    variant={testMethodFilter === tab.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setTestMethodFilter(tab.key);
                      setSamplePage(1);
                    }}
                  >
                    {tab.label}
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      {tab.count}
                    </Badge>
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Input
                  placeholder="搜索用例名称、测试输入、测试方式或预期判定…"
                  value={sampleSearch}
                  onChange={(event) => {
                    setSampleSearch(event.target.value);
                    setSamplePage(1);
                  }}
                  className="max-w-sm"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  共 {testCasesQuery.data?.length || 0} 条
                  {filteredCases.length !== (testCasesQuery.data?.length || 0)
                    ? ` · 匹配 ${filteredCases.length} 条`
                    : ''}
                </span>
              </div>
            </div>
          </div>

          {filteredCases.length === 0 && !testCasesQuery.isLoading ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-sm font-medium">
                {sampleSearch || testMethodFilter !== 'all' ? '无匹配用例' : '暂无检测用例'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sampleSearch
                  ? '尝试调整搜索关键词'
                  : testMethodFilter !== 'all'
                    ? '切换测试方式或新建用例'
                    : '点击「新建用例」添加结构化检测用例'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[32%]">测试输入</TableHead>
                    <TableHead>测试方式</TableHead>
                    <TableHead>风险等级</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>风险命中表现</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCases.items.map((item) => {
                    const isHighlighted = highlightCase === item.caseCode;
                    return (
                      <TableRow
                        key={item.id}
                        className={`cursor-pointer ${isHighlighted ? 'bg-muted' : ''}`}
                        onClick={() => setDetailCase(item)}
                        onDoubleClick={() => setDetailCase(item)}
                      >
                        <TableCell>
                          {isAiExpandedCase(item) ? (
                            <div className="mb-2 flex">
                              <Badge
                                variant="outline"
                                className="border-sky-200 bg-sky-50 text-sky-700"
                              >
                                AI 补充
                              </Badge>
                            </div>
                          ) : null}
                          <div
                            className="max-h-24 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
                            title={item.prompt}
                          >
                            {renderTechnicalPayloadPreview(item)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {resolveTestMethodLabel(item.attackType, item.metadata)}
                        </TableCell>
                        <TableCell>
                          <RiskBadge level={item.riskLevel as MappedTechnicalLibrary['level']} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.status === 'archived'
                              ? '草稿'
                              : CASE_STATUS_TEXT[item.status as CaseStatus] || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-sm">
                          {item.expectedFail || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button variant="ghost" size="sm" onClick={() => openEditCase(item)}>
                              编辑
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => copyCaseText(item)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteCaseTarget(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {pagedCases.total > 0 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                显示 {pagedCases.start}–{pagedCases.end} / {pagedCases.total} 条
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagedCases.page <= 1}
                  onClick={() => setSamplePage((prev) => prev - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagedCases.page >= pagedCases.pages}
                  onClick={() => setSamplePage((prev) => prev + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailCase)} onOpenChange={(open) => !open && setDetailCase(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px] [&>button]:hidden">
          {detailCase && lib ? (
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
                <p className="text-xs text-muted-foreground">检测用例详情</p>
                <SheetTitle className="text-xl leading-snug">{detailCase.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <RiskBadge level={detailCase.riskLevel as MappedTechnicalLibrary['level']} />
                    <Badge variant={detailCase.status === 'published' ? 'default' : 'outline'}>
                      {detailCase.status === 'published'
                        ? '启用'
                        : detailCase.status === 'archived'
                          ? '停用'
                          : CASE_STATUS_TEXT[detailCase.status as CaseStatus] || detailCase.status}
                    </Badge>
                    {typeof detailCase.metadata === 'object' &&
                    detailCase.metadata &&
                    typeof (detailCase.metadata as Record<string, unknown>).riskSubclass ===
                      'string' ? (
                      <Badge variant="secondary">
                        {(detailCase.metadata as Record<string, string>).riskSubclass}
                      </Badge>
                    ) : lib.category ? (
                      <Badge variant="secondary">{lib.category}</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {resolveTestMethodLabel(detailCase.attackType, detailCase.metadata)}
                    </Badge>
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <TechnicalCaseDetailBody
                  library={lib}
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
              </div>
              <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setDetailCase(null)}>
                  关闭
                </Button>
                <Button type="button" variant="outline" onClick={() => copyCaseText(detailCase)}>
                  复制测试输入
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    openEditCase(detailCase);
                    setDetailCase(null);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑用例
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {caseForm ? (
        <TechnicalCaseSampleFormDialog
          open={caseDialogOpen}
          library={lib}
          editingCase={editingCase}
          form={caseForm}
          pending={saveCaseMutation.isPending}
          onOpenChange={(open) => {
            setCaseDialogOpen(open);
            if (!open) {
              setEditingCase(null);
              setCaseForm(null);
            }
          }}
          onFormChange={setCaseForm}
          onSubmit={() => saveCaseMutation.mutate()}
        />
      ) : null}

      <TechnicalCaseLibraryFormDialog
        open={editLibraryOpen}
        editing={lib}
        domainOptions={domainOptions}
        pending={updateLibraryMutation.isPending}
        onOpenChange={setEditLibraryOpen}
        onSubmit={(form) => updateLibraryMutation.mutate(form)}
      />

      <TechnicalCaseAiExpandDialog
        open={aiExpandOpen}
        onOpenChange={setAiExpandOpen}
        libraryId={libraryId}
        libraryTitle={lib.title}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['security-test-cases', libraryId] });
          queryClient.invalidateQueries({ queryKey: ['technical-case-library', libraryId] });
          queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
        }}
      />

      <TechnicalCaseImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        libraryId={libraryId}
        libraryTitle={lib.title}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['security-test-cases', libraryId] });
          queryClient.invalidateQueries({ queryKey: ['technical-case-library', libraryId] });
          queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
        }}
      />
      <ConfirmDialog
        open={deleteLibraryOpen}
        onOpenChange={(open) => {
          if (!open && !deleteLibraryMutation.isPending) {
            setDeleteLibraryOpen(false);
          }
        }}
        title="删除安全用例库？"
        desc={`确定删除「${lib.title}」？此操作不可恢复。`}
        cancelBtnText="取消"
        confirmText={deleteLibraryMutation.isPending ? '删除中…' : '确认删除'}
        destructive
        isLoading={deleteLibraryMutation.isPending}
        handleConfirm={() => deleteLibraryMutation.mutate()}
      />
      <ConfirmDialog
        open={Boolean(deleteCaseTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteCaseMutation.isPending) {
            setDeleteCaseTarget(null);
          }
        }}
        title="删除安全用例？"
        desc={`确定删除用例「${deleteCaseTarget?.name ?? '该用例'}」？此操作不可恢复。`}
        cancelBtnText="取消"
        confirmText={deleteCaseMutation.isPending ? '删除中…' : '确认删除'}
        destructive
        isLoading={deleteCaseMutation.isPending}
        handleConfirm={() => {
          if (deleteCaseTarget) {
            deleteCaseMutation.mutate(deleteCaseTarget.id, {
              onSettled: () => setDeleteCaseTarget(null),
            });
          }
        }}
      />
    </Shell>
  );
}
