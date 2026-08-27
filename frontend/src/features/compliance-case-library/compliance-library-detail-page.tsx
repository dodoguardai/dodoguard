import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Copy, FileText, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Textarea } from '@/components/ui/textarea';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityTestCase } from '@/types/entities';
import { ComplianceAiExpandDialog } from './compliance-ai-expand-dialog';
import {
  buildCaseMetadata,
  CaseExtraFields,
  ComplianceCaseDetailBody,
  readCaseExtraMetadata,
  RegClauseSection,
  renderCasePayloadPreview,
  type CaseExtraMetadata,
} from './compliance-case-form-fields';
import { COMPLIANCE_REGULATION_LAWS } from './compliance-law-catalog';
import { buildLibraryPayload, ComplianceLibraryFormDialog } from './compliance-library-form-dialog';
import { inferLawFromLibrary } from './compliance-mapping-utils';
import { loadCustomDomains } from './compliance-custom-domains';
import {
  CASE_STATUS_TEXT,
  COMPLIANCE_DOMAINS,
  mapLibrary,
  MiniStat,
  paginate,
  readRegClause,
  RiskBadge,
  SAMPLE_TYPE_DETAIL_LABELS,
  SAMPLE_TYPE_LABELS,
  Shell,
  type CaseStatus,
  type RiskLevel,
  type SampleType,
} from './shared';

type DetailPageProps = {
  libraryId: string;
  returnDomain?: string;
  highlightCase?: string;
};

type CaseForm = {
  name: string;
  sampleType: SampleType;
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  regClause: string;
  riskLevel: RiskLevel;
  status: CaseStatus;
  extra: CaseExtraMetadata;
};

const emptyCaseForm: CaseForm = {
  name: '',
  sampleType: 'single',
  prompt: '',
  expectedPass: '',
  expectedFail: '',
  regClause: '',
  riskLevel: 'medium',
  status: 'draft',
  extra: {},
};

function isAiExpandedCase(item: SecurityTestCase) {
  const metadata = item.metadata || {};
  const caseBasis = typeof metadata.caseBasis === 'string' ? metadata.caseBasis.trim() : '';
  return caseBasis === 'AI 自动扩充';
}

export function ComplianceLibraryDetailPage({
  libraryId,
  returnDomain,
  highlightCase,
}: DetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sampleTypeFilter, setSampleTypeFilter] = useState<'all' | SampleType>('all');
  const [sampleSearch, setSampleSearch] = useState('');
  const [samplePage, setSamplePage] = useState(1);
  const [detailCase, setDetailCase] = useState<SecurityTestCase | null>(null);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<SecurityTestCase | null>(null);
  const [caseForm, setCaseForm] = useState<CaseForm>(emptyCaseForm);
  const [editLibraryOpen, setEditLibraryOpen] = useState(false);
  const [aiExpandOpen, setAiExpandOpen] = useState(false);
  const [deleteLibraryOpen, setDeleteLibraryOpen] = useState(false);

  const libraryQuery = useQuery({
    queryKey: ['compliance-case-library', libraryId],
    queryFn: async () => {
      const result = await detectionScanningApi.listAllCaseLibraries({
        category: 'compliance',
      });
      const found = result.data.find((item) => item.id === libraryId);
      if (!found) throw new Error('控制库不存在');
      return found;
    },
  });

  const testCasesQuery = useQuery({
    queryKey: ['compliance-test-cases', libraryId],
    queryFn: () => detectionScanningApi.listTestCases(libraryId),
  });

  const mappingsQuery = useQuery({
    queryKey: ['compliance-mappings-for-case-form'],
    queryFn: () => detectionScanningApi.listComplianceMappings({ limit: 200 }),
    enabled: caseDialogOpen,
  });

  const lib = libraryQuery.data ? mapLibrary(libraryQuery.data) : null;
  const law = lib ? inferLawFromLibrary(lib) : '';
  const returnDomainValue = returnDomain || lib?.domain || 'all';
  const returnSearch = { tab: 'libraries' as const, domain: returnDomainValue, law: undefined };
  const domainOptions = [...COMPLIANCE_DOMAINS, ...loadCustomDomains().map((item) => item.label)];

  const filteredCases = useMemo(() => {
    const cases = testCasesQuery.data || [];
    const kw = sampleSearch.trim().toLowerCase();
    return cases.filter((item) => {
      if (sampleTypeFilter !== 'all' && item.attackType !== sampleTypeFilter) return false;
      if (!kw) return true;
      const extra = readCaseExtraMetadata(item.metadata);
      const hay = [
        item.caseCode,
        item.name,
        item.prompt,
        item.expectedPass,
        item.expectedFail,
        readRegClause(item.metadata),
        isAiExpandedCase(item) ? 'AI 补充 AI 自动扩充' : '',
        extra.fileName,
        extra.userQuery,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [testCasesQuery.data, sampleSearch, sampleTypeFilter]);

  const pagedCases = paginate(filteredCases, samplePage, 10);

  useEffect(() => {
    if (!highlightCase || !testCasesQuery.data?.length) return;
    const match = testCasesQuery.data.find((item) => item.caseCode === highlightCase);
    if (match) {
      setDetailCase(match);
      setSampleSearch(highlightCase);
    }
  }, [highlightCase, testCasesQuery.data]);

  const toggleMutation = useMutation({
    mutationFn: () => {
      if (!lib) throw new Error('控制库不存在');
      return detectionScanningApi.updateCaseLibrary(lib.id, { enabled: !lib.enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] });
      toast.success('控制库状态已更新');
    },
  });

  const updateLibraryMutation = useMutation({
    mutationFn: (form: Parameters<typeof buildLibraryPayload>[0]) => {
      if (!libraryQuery.data) throw new Error('控制库不存在');
      return detectionScanningApi.updateCaseLibrary(
        libraryQuery.data.id,
        buildLibraryPayload(form),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] });
      setEditLibraryOpen(false);
      toast.success('控制库已更新');
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  });

  const deleteLibraryMutation = useMutation({
    mutationFn: () => detectionScanningApi.deleteCaseLibrary(libraryId),
    onSuccess: () => {
      toast.success('控制库已删除');
      navigate({ to: '/scan/compliance-cases', search: returnSearch });
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const saveCaseMutation = useMutation({
    mutationFn: () => {
      const metadata = buildCaseMetadata(caseForm.sampleType, caseForm.regClause, caseForm.extra);
      const payload = {
        name: caseForm.name.trim() || undefined,
        attackType: caseForm.sampleType,
        prompt: caseForm.prompt.trim(),
        expectedPass: caseForm.expectedPass.trim() || undefined,
        expectedFail: caseForm.expectedFail.trim() || undefined,
        riskLevel: caseForm.riskLevel,
        status: caseForm.status,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
      if (editingCase) {
        return detectionScanningApi.updateTestCase(libraryId, editingCase.id, payload);
      }
      return detectionScanningApi.createTestCase(libraryId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-test-cases', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-library-case-codes'] });
      setCaseDialogOpen(false);
      setEditingCase(null);
      setCaseForm(emptyCaseForm);
      toast.success(editingCase ? '用例已更新' : '用例已添加');
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (caseId: string) => detectionScanningApi.deleteTestCase(libraryId, caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-test-cases', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-library', libraryId] });
      queryClient.invalidateQueries({ queryKey: ['compliance-case-libraries'] });
      toast.success('用例已删除');
    },
  });

  function openCreateCase() {
    setEditingCase(null);
    setCaseForm({
      ...emptyCaseForm,
    });
    setCaseDialogOpen(true);
  }

  function openEditCase(item: SecurityTestCase) {
    const extra = readCaseExtraMetadata(item.metadata);
    setEditingCase(item);
    setCaseForm({
      name: item.name,
      sampleType: (item.attackType as SampleType) || 'single',
      prompt: item.prompt,
      expectedPass: item.expectedPass || '',
      expectedFail: item.expectedFail || '',
      regClause: readRegClause(item.metadata) === '—' ? '' : readRegClause(item.metadata),
      riskLevel: item.riskLevel,
      status: item.status === 'archived' ? 'draft' : item.status,
      extra,
    });
    setCaseDialogOpen(true);
  }

  function copyCaseText(item: SecurityTestCase) {
    const extra = readCaseExtraMetadata(item.metadata);
    const text = [
      item.caseCode,
      item.name,
      renderCasePayloadPreview(item.attackType as SampleType, item.prompt, extra),
      item.expectedPass,
      item.expectedFail,
      readRegClause(item.metadata),
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制到剪贴板'),
      () => toast.error('复制失败'),
    );
  }

  function copyTestInput(item: SecurityTestCase) {
    const extra = readCaseExtraMetadata(item.metadata);
    const text = renderCasePayloadPreview(item.attackType as SampleType, item.prompt, extra);
    navigator.clipboard.writeText(text).then(
      () => toast.success('测试输入已复制'),
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
        <p className="text-sm text-muted-foreground">控制库不存在</p>
        <Button asChild variant="outline" className="w-fit">
          <Link to="/scan/compliance-cases" search={returnSearch}>
            返回合规控制库
          </Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link to="/scan/compliance-cases" search={returnSearch}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回合规控制库
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              {lib.meta.icon ? (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-2xl">
                  {lib.meta.icon}
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">
                  {lib.domain} · <code className="text-xs">{lib.libraryKey}</code>
                </p>
                <CardTitle className="mt-1 text-xl">{lib.title}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">{lib.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lib.meta.tag ? <Badge variant="outline">{lib.meta.tag}</Badge> : null}
                  {lib.meta.category ? (
                    <Badge variant="secondary">{lib.meta.category}</Badge>
                  ) : null}
                  {lib.meta.lawPdf?.name ? (
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      PDF 原文 · {lib.meta.lawPdf.name}
                    </Badge>
                  ) : null}
                  <RiskBadge level={lib.level} />
                  <Badge
                    variant="outline"
                    className={
                      lib.enabled ? 'border-emerald-200 text-emerald-700' : 'text-muted-foreground'
                    }
                  >
                    {lib.enabled ? '已启用' : '关闭'}
                  </Badge>
                </div>
                {lib.meta.basis ? (
                  <p className="mt-3 text-sm">
                    <span className="font-medium">检测依据：</span>
                    {lib.meta.basis}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditLibraryOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑库
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
                onClick={() => toggleMutation.mutate()}
              >
                {lib.enabled ? '关闭库' : '启用库'}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/scan/compliance-cases" search={{ tab: 'mappings', domain: 'all', law }}>
                  法规映射
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAiExpandOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 扩充
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
            <MiniStat label="合规用例" value={`${lib.cases} 条`} />
            <MiniStat label="检测方式" value={lib.method} />
            <MiniStat label="适用范围" value={lib.meta.scope || '—'} />
          </div>

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(['all', 'single', 'multi_turn', 'file_input', 'file_output'] as const).map(
                (type) => (
                  <Button
                    key={type}
                    variant={sampleTypeFilter === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSampleTypeFilter(type);
                      setSamplePage(1);
                    }}
                  >
                    {type === 'all' ? '全部' : SAMPLE_TYPE_LABELS[type]}
                  </Button>
                ),
              )}
            </div>
            <Input
              placeholder="搜索用例…"
              value={sampleSearch}
              onChange={(event) => {
                setSampleSearch(event.target.value);
                setSamplePage(1);
              }}
              className="max-w-xs"
            />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用例名称</TableHead>
                  <TableHead>测试方式</TableHead>
                  <TableHead>风险等级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>违规命中表现</TableHead>
                  <TableHead>法规条款映射</TableHead>
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
                    >
                      <TableCell className="max-w-[220px]">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.name}</span>
                          {isAiExpandedCase(item) ? (
                            <Badge
                              variant="outline"
                              className="border-sky-200 bg-sky-50 text-sky-700"
                            >
                              AI 补充
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {item.caseCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        {SAMPLE_TYPE_LABELS[item.attackType as SampleType] || item.attackType}
                      </TableCell>
                      <TableCell>
                        <RiskBadge level={item.riskLevel} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.status === 'published'
                            ? '已发布'
                            : item.status === 'reviewing'
                              ? '评审中'
                              : '草稿'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {item.expectedFail || '—'}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {readRegClause(item.metadata)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex justify-end gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" onClick={() => setDetailCase(item)}>
                            详情
                          </Button>
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
                            onClick={() => deleteCaseMutation.mutate(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!testCasesQuery.isLoading && filteredCases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      暂无合规用例 · 点击「新建用例」添加
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

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
                <p className="text-xs text-muted-foreground">合规检测用例详情</p>
                <SheetTitle className="text-xl leading-snug">{detailCase.name}</SheetTitle>
                <SheetDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="font-mono text-sm text-foreground">{detailCase.caseCode}</span>
                    <RiskBadge level={detailCase.riskLevel} />
                    <Badge variant="outline">
                      {detailCase.status === 'archived'
                        ? '草稿'
                        : CASE_STATUS_TEXT[detailCase.status as CaseStatus] || detailCase.status}
                    </Badge>
                    <Badge variant="secondary">
                      {SAMPLE_TYPE_DETAIL_LABELS[detailCase.attackType as SampleType] ||
                        detailCase.attackType}
                    </Badge>
                  </div>
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <ComplianceCaseDetailBody
                  libTitle={lib.title}
                  libDomain={lib.domain}
                  libCategory={lib.meta.category}
                  caseItem={{
                    name: detailCase.name,
                    attackType: detailCase.attackType,
                    prompt: detailCase.prompt,
                    expectedPass: detailCase.expectedPass,
                    expectedFail: detailCase.expectedFail,
                    riskLevel: detailCase.riskLevel,
                    status:
                      detailCase.status === 'archived'
                        ? 'draft'
                        : (detailCase.status as CaseStatus),
                    metadata: detailCase.metadata,
                  }}
                />
              </div>
              <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setDetailCase(null)}>
                  关闭
                </Button>
                <Button type="button" variant="outline" onClick={() => copyTestInput(detailCase)}>
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

      <Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]">
          <DialogHeader className="space-y-1 border-b px-6 py-5">
            <DialogTitle className="text-lg">
              {editingCase ? '编辑合规用例' : '新建合规用例'}
            </DialogTitle>
            <DialogDescription>
              {lib.meta.basis || lib.title} · 配置归属、测试输入与预期判定
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (caseForm.sampleType === 'single' && !caseForm.prompt.trim()) {
                toast.error('请填写测试 Prompt');
                return;
              }
              saveCaseMutation.mutate();
            }}
          >
            <div className="grid gap-6 overflow-y-auto px-6 py-5">
              <section className="grid gap-3">
                <h4 className="text-sm font-semibold text-foreground">一、归属分类</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">所属合规库</Label>
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{lib.title}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">所属合规域</Label>
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{lib.domain}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">所属控制类别</Label>
                    <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {lib.meta.category || '—'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-3">
                <h4 className="text-sm font-semibold text-foreground">二、基础信息</h4>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>用例名称</Label>
                    <Input
                      value={caseForm.name}
                      onChange={(event) =>
                        setCaseForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="例如 拒绝索取完整身份证号"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>
                      风险等级<span className="ml-0.5 text-destructive">*</span>
                    </Label>
                    <Select
                      value={caseForm.riskLevel}
                      onValueChange={(value) =>
                        setCaseForm((prev) => ({ ...prev, riskLevel: value as RiskLevel }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">严重</SelectItem>
                        <SelectItem value="high">高危</SelectItem>
                        <SelectItem value="medium">中危</SelectItem>
                        <SelectItem value="low">低危</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>样本类型</Label>
                    <Select
                      value={caseForm.sampleType}
                      onValueChange={(value) =>
                        setCaseForm((prev) => ({ ...prev, sampleType: value as SampleType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SAMPLE_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>状态</Label>
                    <Select
                      value={caseForm.status}
                      onValueChange={(value) =>
                        setCaseForm((prev) => ({ ...prev, status: value as CaseStatus }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">草稿</SelectItem>
                        <SelectItem value="reviewing">评审中</SelectItem>
                        <SelectItem value="published">已发布</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="grid gap-3">
                <h4 className="text-sm font-semibold text-foreground">三、测试输入</h4>
                {caseForm.sampleType === 'single' ? (
                  <div className="grid gap-2">
                    <Label>测试 Prompt</Label>
                    <Textarea
                      rows={4}
                      value={caseForm.prompt}
                      onChange={(event) =>
                        setCaseForm((prev) => ({ ...prev, prompt: event.target.value }))
                      }
                      placeholder="输入用于检测的测试 Prompt"
                    />
                  </div>
                ) : (
                  <CaseExtraFields
                    sampleType={caseForm.sampleType}
                    extra={caseForm.extra}
                    onChange={(extra) => setCaseForm((prev) => ({ ...prev, extra }))}
                  />
                )}
                {caseForm.sampleType !== 'single' ? (
                  <div className="grid gap-2">
                    <Label>摘要 Prompt（可选）</Label>
                    <Textarea
                      rows={2}
                      value={caseForm.prompt}
                      onChange={(event) =>
                        setCaseForm((prev) => ({ ...prev, prompt: event.target.value }))
                      }
                      placeholder="用于列表展示的简短描述"
                    />
                  </div>
                ) : null}
              </section>

              <section className="grid gap-3">
                <h4 className="text-sm font-semibold text-foreground">四、预期判定</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>合规预期</Label>
                    <Textarea
                      rows={3}
                      value={caseForm.expectedPass}
                      onChange={(event) =>
                        setCaseForm((prev) => ({ ...prev, expectedPass: event.target.value }))
                      }
                      placeholder="Agent 应如何合规响应"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>违规判定</Label>
                    <Textarea
                      rows={3}
                      value={caseForm.expectedFail}
                      onChange={(event) =>
                        setCaseForm((prev) => ({ ...prev, expectedFail: event.target.value }))
                      }
                      placeholder="何种响应视为违规"
                    />
                  </div>
                </div>
              </section>

              <section className="grid gap-2.5">
                <h4 className="text-sm font-semibold text-foreground">五、法规依据</h4>
                <RegClauseSection
                  value={caseForm.regClause}
                  onChange={(value) => setCaseForm((prev) => ({ ...prev, regClause: value }))}
                  laws={COMPLIANCE_REGULATION_LAWS}
                  mappings={mappingsQuery.data?.data || []}
                />
              </section>
            </div>
            <DialogFooter className="border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setCaseDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saveCaseMutation.isPending}>
                {saveCaseMutation.isPending ? '保存中' : '保存用例'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ComplianceLibraryFormDialog
        open={editLibraryOpen}
        onOpenChange={setEditLibraryOpen}
        mode="edit"
        initialLibrary={libraryQuery.data}
        domainOptions={domainOptions}
        pending={updateLibraryMutation.isPending}
        onSubmit={(form) => updateLibraryMutation.mutate(form)}
      />

      <ComplianceAiExpandDialog
        open={aiExpandOpen}
        onOpenChange={setAiExpandOpen}
        libraryId={libraryId}
        libraryTitle={lib.title}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['compliance-test-cases', libraryId] });
          queryClient.invalidateQueries({ queryKey: ['compliance-case-library', libraryId] });
        }}
      />
      <ConfirmDialog
        open={deleteLibraryOpen}
        onOpenChange={(open) => {
          if (!open && !deleteLibraryMutation.isPending) {
            setDeleteLibraryOpen(false);
          }
        }}
        title="删除合规控制库？"
        desc={`确定删除「${lib.title}」？此操作不可恢复。`}
        cancelBtnText="取消"
        confirmText={deleteLibraryMutation.isPending ? '删除中…' : '确认删除'}
        destructive
        isLoading={deleteLibraryMutation.isPending}
        handleConfirm={() => deleteLibraryMutation.mutate()}
      />
    </Shell>
  );
}
