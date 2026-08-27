import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import {
  KpiCard,
  type MappedTechnicalLibrary,
  mapTechnicalLibrary,
  PageHead,
  Shell,
} from './shared';
import { TechnicalCaseDomainPanel } from './technical-case-domain-panel';
import {
  ALL_DOMAIN_TAB,
  buildDomainTabs,
  buildTechnicalDomainMetas,
  isSameTechnicalDomain,
  normalizeTechnicalDomainKey,
  resolveDomainMeta,
  type TechnicalDomainMeta,
  tabLabelForDomain,
} from './technical-case-domains';
import {
  buildTechnicalLibraryPayload,
  type LibraryFormState,
  TechnicalCaseLibraryFormDialog,
  type TechnicalDomainOption,
} from './technical-case-library-form-dialog';
import type { PaginatedResponse } from '@/types/api';
import type { SecurityCaseLibrary as ApiSecurityCaseLibrary } from '@/types/entities';

function buildLibraryPayload(form: LibraryFormState) {
  return buildTechnicalLibraryPayload(form);
}

export function TechnicalCaseLibraryPage({
  initialDomain = ALL_DOMAIN_TAB,
}: {
  initialDomain?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState(normalizeTechnicalDomainKey(initialDomain));
  const [pagesByDomain, setPagesByDomain] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState<MappedTechnicalLibrary | null>(null);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [newDomainForm, setNewDomainForm] = useState({ label: '', icon: '📁', description: '' });
  const [domainsExpanded, setDomainsExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MappedTechnicalLibrary | null>(null);
  const [deleteDomainTarget, setDeleteDomainTarget] = useState<TechnicalDomainMeta | null>(null);

  useEffect(() => {
    setDomain(normalizeTechnicalDomainKey(initialDomain));
  }, [initialDomain]);

  const caseLibrariesQuery = useQuery({
    queryKey: ['security-case-libraries', 'technical'],
    queryFn: () =>
      detectionScanningApi.listAllCaseLibraries({
        category: 'technical',
      }),
  });

  const domainSourceRows = useMemo(
    () =>
      (caseLibrariesQuery.data?.data || [])
        .map((lib: ApiSecurityCaseLibrary) => mapTechnicalLibrary(lib))
        .sort((left, right) => left.domainOrder - right.domainOrder),
    [caseLibrariesQuery.data?.data],
  );

  const allRows = useMemo(
    () => domainSourceRows.filter((row) => !row.isDomainOnly),
    [domainSourceRows],
  );

  const domainMetas = useMemo(
    () => buildTechnicalDomainMetas(domainSourceRows),
    [domainSourceRows],
  );

  const domainTabs = useMemo(() => buildDomainTabs(domainMetas), [domainMetas]);

  const domainOptions = useMemo<TechnicalDomainOption[]>(
    () =>
      domainTabs
        .filter((item) => item !== ALL_DOMAIN_TAB)
        .map((item) => ({
          value: item,
          label: tabLabelForDomain(item, domainMetas),
        })),
    [domainTabs, domainMetas],
  );

  const createModalSubtitle = useMemo(() => {
    if (domain === ALL_DOMAIN_TAB) {
      return '添加一类技术安全场景库 · 先选择所属类别 · 可配置检测依据 · 创建后补充攻击样本';
    }
    const targetDomain = domain === ALL_DOMAIN_TAB ? '系统指令泄露与绕过风险' : domain;
    const meta = resolveDomainMeta(targetDomain, domainMetas);
    const label = meta.kpiLibLabel.replace(/检测$/, '') || meta.tabLabel;
    const sampleWord = isSameTechnicalDomain(targetDomain, '恶意输入与对话攻击风险')
      ? '对抗样本'
      : '攻击样本';
    return `添加一类${label}场景库 · 可配置检测依据 · 创建后补充${sampleWord}`;
  }, [domain, domainMetas]);

  const filteredRows = useMemo(() => {
    if (domain === ALL_DOMAIN_TAB) {
      return allRows;
    }
    return allRows.filter((row) => isSameTechnicalDomain(row.domain, domain));
  }, [allRows, domain]);

  const kpiRows = domain === ALL_DOMAIN_TAB ? allRows : filteredRows;
  const domainMeta = domain === ALL_DOMAIN_TAB ? null : resolveDomainMeta(domain, domainMetas);
  const totalCases = kpiRows.reduce((sum, item) => sum + item.cases, 0);
  const enabledCount = kpiRows.filter((item) => item.enabled).length;
  const basisCount = kpiRows.filter((item) => item.standards.length > 0).length;

  function updateCachedLibrary(updatedLibrary: ApiSecurityCaseLibrary) {
    queryClient.setQueriesData<PaginatedResponse<ApiSecurityCaseLibrary>>(
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
    queryClient.setQueryData<ApiSecurityCaseLibrary>(
      ['technical-case-library', updatedLibrary.id],
      updatedLibrary,
    );
  }

  const createMutation = useMutation({
    mutationFn: (form: LibraryFormState) =>
      detectionScanningApi.createCaseLibrary(buildLibraryPayload(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      setCreateOpen(false);
      toast.success('场景库已创建，可继续维护检测样本');
    },
    onError: (error: Error) => toast.error(error.message || '创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: LibraryFormState }) =>
      detectionScanningApi.updateCaseLibrary(id, buildLibraryPayload(form)),
    onSuccess: (updatedLibrary) => {
      updateCachedLibrary(updatedLibrary);
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      setEditingLibrary(null);
      toast.success('场景库已更新');
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: (lib: MappedTechnicalLibrary) =>
      detectionScanningApi.updateCaseLibrary(lib.id, { enabled: !lib.enabled }),
    onSuccess: (updatedLibrary, lib) => {
      updateCachedLibrary(updatedLibrary);
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      toast.success(`已${lib.enabled ? '关闭' : '启用'} ${lib.title}`);
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => detectionScanningApi.deleteCaseLibrary(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      if (editingLibrary?.id === id) {
        setEditingLibrary(null);
      }
      setDeleteTarget(null);
      toast.success('场景库已删除');
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const createDomainMutation = useMutation({
    mutationFn: (form: typeof newDomainForm) => {
      const label = normalizeTechnicalDomainKey(form.label.trim());
      const nextOrder = Math.max(0, ...domainMetas.map((item) => item.order || 0)) + 1;
      return detectionScanningApi.createCaseLibrary({
        libraryKey: `domain-custom-${Date.now()}`,
        title: label,
        domain: label,
        description: form.description.trim() || `覆盖 ${label} 相关攻击场景`,
        caseCount: 0,
        enabled: true,
        defaultLevel: 'medium',
        detectMethod: 'manual',
        status: 'published',
        standards: [],
        metadata: {
          libraryCategory: 'technical',
          domainOnly: true,
          domainOrder: nextOrder,
          icon: form.icon.trim() || '📁',
        },
      });
    },
    onSuccess: (createdLibrary) => {
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      setAddDomainOpen(false);
      setNewDomainForm({ label: '', icon: '📁', description: '' });
      handleDomainChange(createdLibrary.domain);
      toast.success(`已新增类别「${createdLibrary.domain}」`);
    },
    onError: (error: Error) => toast.error(error.message || '新增类别失败'),
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (item: TechnicalDomainMeta) => {
      if (!item.id) {
        throw new Error('该类别没有可删除的数据库记录');
      }
      return detectionScanningApi.deleteCaseLibrary(item.id);
    },
    onSuccess: (_data, deletedDomain) => {
      queryClient.invalidateQueries({ queryKey: ['security-case-libraries'] });
      if (domain === deletedDomain.domainKey) {
        handleDomainChange(ALL_DOMAIN_TAB);
      }
      setDeleteDomainTarget(null);
      toast.success(`已删除类别「${deletedDomain.domainKey}」`);
    },
    onError: (error: Error) => toast.error(error.message || '删除类别失败'),
  });

  const formPending = createMutation.isPending || updateMutation.isPending;
  const createDefaultDomain =
    domain === ALL_DOMAIN_TAB ? domainOptions[0]?.value || domainMetas[0]?.domainKey || '' : domain;
  const page = pagesByDomain[domain] ?? 1;
  const deleteDomainAffectedLibraries = deleteDomainTarget
    ? allRows.filter((row) => isSameTechnicalDomain(row.domain, deleteDomainTarget.domainKey))
    : [];
  const deleteDomainAffectedCaseCount = deleteDomainAffectedLibraries.reduce(
    (sum, row) => sum + row.cases,
    0,
  );
  const canToggleDomainTabs = domainTabs.length + 1 > 4;

  const handleDomainChange = (nextDomain: string) => {
    setDomain(nextDomain);
    navigate({
      to: '/scan/security-cases',
      search: { domain: nextDomain },
      replace: true,
    });
  };

  function handleAddDomain() {
    if (!newDomainForm.label.trim()) {
      toast.error('请输入类别名称');
      return;
    }
    const nextLabel = normalizeTechnicalDomainKey(newDomainForm.label.trim());
    if (domainOptions.some((item) => item.value === nextLabel)) {
      toast.error('该类别已存在');
      return;
    }
    createDomainMutation.mutate({ ...newDomainForm, label: nextLabel });
  }

  return (
    <Shell>
      <PageHead
        title="对话安全测试用例库"
        desc="通过模拟真实用户、异常用户和恶意诱导用户的提问方式，验证智能体是否存在敏感信息泄露、越权回答、错误业务承诺、合规话术不当、工具误调用等风险。"
      />

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          title={domainMeta?.kpiLibLabel || '场景库'}
          value={String(kpiRows.length)}
          sub="检测用例库"
        />
        <KpiCard
          title={domainMeta ? '用例总数' : '检测样本'}
          value={String(totalCases)}
          sub="检测样本"
        />
        <KpiCard title="已启用" value={String(enabledCount)} sub="纳入评估任务" />
        <KpiCard title="检测依据" value={String(basisCount)} sub="OWASP ASI" />
      </div>

      <div className="flex items-start gap-2">
        <Tabs
          value={domain}
          className="min-w-0 flex-1 gap-0"
          onValueChange={(value) => {
            if (value === '__add_domain__') {
              setAddDomainOpen(true);
              return;
            }
            handleDomainChange(value);
          }}
        >
          <TabsList
            className={`flex w-full flex-wrap justify-start overflow-hidden transition-all duration-300 ease-out ${
              domainsExpanded
                ? 'h-auto max-h-[28rem] gap-1.5 p-1.5'
                : 'h-9 max-h-9 gap-0 p-[3px]'
            }`}
          >
            {domainTabs.map((item) => {
              const meta = domainMetas.find((domainMetaItem) => domainMetaItem.domainKey === item);
              const label = item === ALL_DOMAIN_TAB ? '总览' : tabLabelForDomain(item, domainMetas);

              return (
                <TabsTrigger
                  key={item}
                  value={item}
                  className={`${meta?.deletable ? 'gap-1.5 pr-2' : ''} ${
                    domainsExpanded ? 'h-8 flex-none px-3' : 'flex-none'
                  }`}
                >
                  <span>{label}</span>
                  {meta?.deletable ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`删除类别 ${label}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDeleteDomainTarget(meta);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteDomainTarget(meta);
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
            <TabsTrigger
              value="__add_domain__"
              className={`flex-none text-primary ${domainsExpanded ? 'h-8 px-3' : ''}`}
            >
              + 新建类别…
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {canToggleDomainTabs ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 border border-border/70 bg-muted px-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted/80 hover:text-foreground"
            aria-expanded={domainsExpanded}
            onClick={() => setDomainsExpanded((prev) => !prev)}
          >
            <span className="sr-only">{domainsExpanded ? '收起分类' : '展开全部分类'}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ease-out ${
                domainsExpanded ? 'rotate-180' : ''
              }`}
            />
          </Button>
        ) : null}
      </div>

      <TechnicalCaseDomainPanel
        domain={domain}
        rows={filteredRows}
        domainMetas={domainMetas}
        page={page}
        onPageChange={(nextPage) => {
          setPagesByDomain((prev) => ({ ...prev, [domain]: nextPage }));
        }}
        onCreateLibrary={() => setCreateOpen(true)}
        onToggleEnabled={(lib) => toggleMutation.mutate(lib)}
        onEditLibrary={setEditingLibrary}
        onDeleteLibrary={setDeleteTarget}
        togglePending={toggleMutation.isPending}
      />

      <TechnicalCaseLibraryFormDialog
        open={createOpen}
        defaultDomain={createDefaultDomain}
        domainOptions={domainOptions}
        modalSubtitle={createModalSubtitle}
        pending={formPending}
        onOpenChange={setCreateOpen}
        onSubmit={(form) => createMutation.mutate(form)}
      />

      <TechnicalCaseLibraryFormDialog
        open={editingLibrary !== null}
        editing={editingLibrary}
        domainOptions={domainOptions}
        pending={formPending}
        onOpenChange={(open) => {
          if (!open) {
            setEditingLibrary(null);
          }
        }}
        onSubmit={(form) => {
          if (!editingLibrary) {
            return;
          }
          updateMutation.mutate({ id: editingLibrary.id, form });
        }}
      />

      <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增技术安全类别</DialogTitle>
            <DialogDescription>
              类别将保存到数据库，并用于对话安全测试用例库筛选。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>类别名称</Label>
              <Input
                value={newDomainForm.label}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, label: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>图标</Label>
              <Input
                value={newDomainForm.icon}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, icon: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>说明</Label>
              <Input
                value={newDomainForm.description}
                onChange={(event) =>
                  setNewDomainForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDomainOpen(false)}>
              取消
            </Button>
            <Button disabled={createDomainMutation.isPending} onClick={handleAddDomain}>
              {createDomainMutation.isPending ? '添加中…' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除场景库？</AlertDialogTitle>
            <AlertDialogDescription>
              {`将删除「${deleteTarget?.title || '该场景库'}」及其库内检测样本。已创建的评估任务和历史结果不会自动删除。此操作不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteDomainTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDomainTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除技术安全类别？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDomainAffectedLibraries.length > 0
                ? `类别「${deleteDomainTarget?.tabLabel || '该类别'}」下还有 ${deleteDomainAffectedLibraries.length} 个场景库、${deleteDomainAffectedCaseCount} 条用例。删除类别只会移除数据库中的分类记录，不会删除这些场景库和用例；它们仍会按实际库类别显示。`
                : `将删除数据库类别「${deleteDomainTarget?.tabLabel || '该类别'}」配置。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDomainMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteDomainMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteDomainTarget) {
                  deleteDomainMutation.mutate(deleteDomainTarget);
                }
              }}
            >
              {deleteDomainMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}

/** @deprecated Use TechnicalCaseLibraryPage */
export const SecurityCaseLibraryPage = TechnicalCaseLibraryPage;
