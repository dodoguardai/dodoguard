/**
 * Reports Management Page
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DEFAULT_REPORT_BRAND_ORGANIZATION,
  normalizeReportBrandConfig,
  REPORT_BRAND_CONFIG_KEY,
} from '@/features/reports/report-brand-config';
import { formatReportStorageFormatLabel } from '@/features/reports/report-format-label';
import { getRunSourceLabel } from '@/features/tasks/run-source-label';
import { Route as ReportsRoute } from '@/routes/_authenticated/reports/';
import { reportsApi } from '@/services/api/reports';
import { systemConfigApi } from '@/services/api/system-config';
import { tasksApi } from '@/services/api/tasks';
import type { Report } from '@/types/entities';

/** date-fns `format` throws on Invalid Date — backend rows may omit or malform timestamps. */
function formatReportCreatedAt(iso: unknown): string {
  if (iso == null || iso === '') {
    return '—';
  }
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return format(d, 'MMM dd, yyyy HH:mm');
}

function formatReportFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

import {
  getAttackTaskTypeLabel,
  getGenerateReportDialogDescription,
  getGenerateReportDialogTitle,
  getReportKindForLabels,
} from '@/features/tasks/task-type-label';

function reportDisplayName(report: Report): string {
  return (
    (report as any).title ||
    ((report.metadata as any)?.taskName && typeof (report.metadata as any).taskName === 'string'
      ? (report.metadata as any).taskName
      : report.taskId) ||
    (report.reportType === 'dify_config_audit'
      ? 'Dify Config Gray-Box & API Black-Box Scanning Task'
      : report.reportType === 'dify_config_static'
        ? 'Dify Config Gray-Box Scanning Task'
        : report.reportType === 'skills_md_audit'
          ? 'SKILLS.md Audit'
          : report.reportType === 'coze_config_static'
            ? 'Coze Config Gray-Box Scanning Task'
            : report.reportType === 'coze_config_audit'
              ? 'Coze Config Gray-Box & API Black-Box Scanning Task'
              : report.reportType === 'fastgpt_config_static'
                ? 'FastGPT Config Gray-Box Scanning Task'
                : report.reportType === 'fastgpt_config_audit'
                  ? 'FastGPT Config Gray-Box & API Black-Box Scanning Task'
                  : report.reportType === 'n8n_config_audit'
                    ? 'n8n Config Audit'
                    : report.reportType === 'qna_excel_manual'
                      ? '手动 Excel 问答测评报告'
                      : report.reportType === 'compliance_assessment'
                        ? '合规评估报告'
                        : report.id)
  );
}

export function Reports() {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [brandOrganizationInput, setBrandOrganizationInput] = useState(
    DEFAULT_REPORT_BRAND_ORGANIZATION,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const { taskId: taskIdFromSearch } = ReportsRoute.useSearch();

  useEffect(() => {
    if (taskIdFromSearch) {
      setSelectedTaskId(taskIdFromSearch);
      setGenerateDialogOpen(true);
    }
  }, [taskIdFromSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['reports', currentPage, pageSize],
    queryFn: () =>
      reportsApi.list({
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
      }),
  });

  const { data: reportBrandConfig } = useQuery({
    queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY],
    queryFn: async () => {
      try {
        const row = await systemConfigApi.getByKey(REPORT_BRAND_CONFIG_KEY);
        return normalizeReportBrandConfig(row.value);
      } catch (error) {
        if ((error as { status?: number; code?: string })?.status === 404) {
          return normalizeReportBrandConfig(null);
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (brandDialogOpen) {
      setBrandOrganizationInput(
        reportBrandConfig?.organization || DEFAULT_REPORT_BRAND_ORGANIZATION,
      );
    }
  }, [brandDialogOpen, reportBrandConfig?.organization]);

  const listTotal = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize) || 1);

  useEffect(() => {
    if (isLoading || listTotal <= 0) {
      return;
    }
    const maxPage = Math.max(1, Math.ceil(listTotal / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [isLoading, listTotal, pageSize, currentPage]);

  const trimmedTaskId = selectedTaskId.trim();
  const { data: taskTypesRaw } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });
  const taskTypesForReport = Array.isArray(taskTypesRaw) ? taskTypesRaw : [];

  const {
    data: generateDialogTask,
    isLoading: generateDialogTaskLoading,
    isError: generateDialogTaskError,
  } = useQuery({
    queryKey: ['attack-tasks', trimmedTaskId, 'generate-dialog'],
    queryFn: () => tasksApi.get(trimmedTaskId),
    enabled: generateDialogOpen && trimmedTaskId.length > 0,
  });

  const dialogTaskKind = generateDialogTask
    ? getReportKindForLabels(generateDialogTask.metadata as Record<string, unknown> | undefined)
    : null;

  const refreshReportsList = useCallback(async () => {
    setCurrentPage(1);
    await queryClient.refetchQueries({ queryKey: ['reports'], type: 'active' });
  }, [queryClient]);

  const downloadReportBlob = useCallback(
    (
      blob: Blob,
      variables: { id: string; fileName?: string; format?: 'md' | 'html' | 'pdf' | 'docx' },
    ) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extension = variables.format || 'pdf';
      a.download = variables.fileName || `report-${variables.id}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    [],
  );

  const generateMutation = useMutation({
    mutationFn: ({ taskId, format }: { taskId: string; format: 'md' | 'html' | 'pdf' | 'docx' }) =>
      reportsApi.generate({ taskId, format }),
    onSuccess: async (report, variables) => {
      const format = variables.format ?? report.format ?? 'pdf';
      try {
        const blob = await reportsApi.download({ reportId: report.id, format });
        downloadReportBlob(blob, {
          id: report.id,
          fileName: report.filePath,
          format,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(tr('Report created but download failed', `报告已生成但下载失败：${msg}`));
      }
      await refreshReportsList();
      toast.success(tr('Report generated successfully', '报告已生成'));
      setGenerateDialogOpen(false);
      setSelectedTaskId('');
      void navigate({ to: '/reports', search: {} });
    },
    onError: (error) => {
      toast.error(`Failed to generate report: ${error.message}`);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: ({
      id,
      format,
    }: {
      id: string;
      fileName?: string;
      format?: 'md' | 'html' | 'pdf' | 'docx';
    }) => reportsApi.download({ reportId: id, format }),
    onSuccess: async (blob, variables) => {
      downloadReportBlob(blob, variables);
      await refreshReportsList();
      toast.success(tr('Report downloaded', '报告已下载'));
    },
    onError: (error) => {
      toast.error(`Failed to download report: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Report deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete report: ${error.message}`);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => reportsApi.delete(id)));
    },
    onSuccess: (_, ids) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Deleted ${ids.length} report(s)`);
    },
    onError: (error) => {
      toast.error(`Batch delete failed: ${error.message}`);
    },
  });

  const saveBrandMutation = useMutation({
    mutationFn: async () => {
      const next = normalizeReportBrandConfig({ organization: brandOrganizationInput });
      await systemConfigApi.updateByKey(REPORT_BRAND_CONFIG_KEY, {
        value: next,
        description: '报告封面、页眉与页脚使用的出具机构信息',
        editable: true,
        requiresRestart: false,
      });
      return next;
    },
    onSuccess: async (next) => {
      toast.success(tr('Report settings saved', '报告设置已保存'));
      setBrandDialogOpen(false);
      setBrandOrganizationInput(next.organization);
      await queryClient.invalidateQueries({
        queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY],
      });
    },
    onError: (error) => {
      toast.error(
        tr(
          `Failed to save report settings: ${error.message}`,
          `报告设置保存失败：${error.message}`,
        ),
      );
    },
  });

  const pageReports = data?.data ?? [];
  const reports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      return pageReports;
    }
    return pageReports.filter((report) => {
      const name = String(reportDisplayName(report)).toLowerCase();
      return (
        name.includes(q) ||
        (report.taskId && report.taskId.toLowerCase().includes(q)) ||
        report.id.toLowerCase().includes(q) ||
        (report.format && report.format.toLowerCase().includes(q))
      );
    });
  }, [pageReports, searchTerm]);

  const isAllSelected = reports.length > 0 && reports.every((r) => selectedIds.has(r.id));
  const isIndeterminate =
    reports.length > 0 && reports.some((r) => selectedIds.has(r.id)) && !isAllSelected;

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map((r) => r.id)));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    if (!window.confirm(`Delete ${ids.length} selected report(s)?`)) {
      return;
    }
    batchDeleteMutation.mutate(ids);
  };

  const handleGenerate = (format: 'md' | 'html' | 'pdf' | 'docx') => {
    if (!selectedTaskId) {
      toast.error('Please select a task');
      return;
    }
    generateMutation.mutate({ taskId: selectedTaskId.trim(), format });
  };

  const handleGenerateDialogOpenChange = (open: boolean) => {
    setGenerateDialogOpen(open);
    if (!open) {
      void navigate({ to: '/reports', search: {} });
    }
  };

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{tr('Reports', '报告')}</h2>
            <p className="text-muted-foreground">
              {tr('View and manage security reports.', '查看并管理安全报告。')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports/qna-excel">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {tr('Excel Q&A PDF', 'Excel 问答 PDF')}
              </Link>
            </Button>
            <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="mr-2 h-4 w-4" />
                  {tr('Report Settings', '报告设置')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tr('Report Settings', '报告设置')}</DialogTitle>
                  <DialogDescription>
                    {tr(
                      'Configure the issuer name shown on exported reports.',
                      '配置导出报告封面、页眉和页脚中的出具机构信息。',
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="report-brand-organization">
                      {tr('Issuer', '出具机构')}
                    </label>
                    <Input
                      id="report-brand-organization"
                      value={brandOrganizationInput}
                      maxLength={140}
                      onChange={(event) => setBrandOrganizationInput(event.target.value)}
                      placeholder={DEFAULT_REPORT_BRAND_ORGANIZATION}
                    />
                    <p className="text-xs text-muted-foreground">
                      {tr('Default', '默认值')}：{DEFAULT_REPORT_BRAND_ORGANIZATION}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBrandOrganizationInput(DEFAULT_REPORT_BRAND_ORGANIZATION)}
                      disabled={saveBrandMutation.isPending}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {tr('Use Default', '使用默认值')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveBrandMutation.mutate()}
                      disabled={saveBrandMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveBrandMutation.isPending
                        ? tr('Saving...', '保存中…')
                        : tr('Save', '保存')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Input
              placeholder={tr('Search reports...', '搜索报告...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
            <Dialog open={generateDialogOpen} onOpenChange={handleGenerateDialogOpenChange}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {tr('Generate Report', '生成报告')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{getGenerateReportDialogTitle(dialogTaskKind)}</DialogTitle>
                  <DialogDescription>
                    {getGenerateReportDialogDescription(dialogTaskKind)}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {trimmedTaskId ? (
                    <div className="space-y-2">
                      {generateDialogTaskLoading && <Skeleton className="h-18 w-full rounded-md" />}
                      {!generateDialogTaskLoading && generateDialogTask ? (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="font-medium leading-snug">{generateDialogTask.name}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-normal">
                              {getAttackTaskTypeLabel(generateDialogTask, taskTypesForReport)}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              {generateDialogTask.id}
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {!generateDialogTaskLoading && generateDialogTaskError ? (
                        <p className="text-sm text-muted-foreground">
                          Could not load task metadata; you can still generate if the task ID is
                          correct.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Task ID</label>
                    <Input
                      placeholder="Enter task ID"
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Format</label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleGenerate('pdf')}
                        disabled={generateMutation.isPending}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleGenerate('html')}
                        disabled={generateMutation.isPending}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        HTML
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleGenerate('md')}
                        disabled={generateMutation.isPending}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Markdown
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleGenerate('docx')}
                        disabled={generateMutation.isPending}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Word
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleBatchDelete}
              disabled={batchDeleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Batch Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-2 h-4 w-4" />
              Clear selection
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isAllSelected ? true : isIndeterminate ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>{tr('Task Name', '任务名称')}</TableHead>
                  <TableHead>{tr('Format', '格式')}</TableHead>
                  <TableHead>{tr('File Size', '文件大小')}</TableHead>
                  <TableHead>{tr('Created', '创建时间')}</TableHead>
                  <TableHead className="text-right">{tr('Actions', '操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No reports found. Generate your first report.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => {
                    const displayName = reportDisplayName(report);

                    return (
                      <TableRow key={report.id}>
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(report.id)}
                            onCheckedChange={(checked) => toggleOne(report.id, checked === true)}
                            aria-label={`Select report ${displayName}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0">{displayName}</span>
                            {(report.reportType === 'dify_config_audit' ||
                              report.reportType === 'fastgpt_config_audit' ||
                              report.reportType === 'n8n_config_audit') && (
                              <>
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  Config
                                </Badge>
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  API
                                </Badge>
                              </>
                            )}
                            {report.reportType === 'dify_config_static' && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Config
                              </Badge>
                            )}
                            {(report.reportType === 'skills_md_audit' ||
                              report.reportType === 'mcp_source_audit' ||
                              report.reportType === 'coze_config_audit' ||
                              report.reportType === 'qna_excel_manual') && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Audit
                              </Badge>
                            )}
                            {report.reportType === 'fastgpt_config_static' && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Config
                              </Badge>
                            )}
                            {getRunSourceLabel(report.metadata as Record<string, unknown>, isZh) ? (
                              <Badge variant="outline" className="shrink-0 text-xs">
                                {getRunSourceLabel(
                                  report.metadata as Record<string, unknown>,
                                  isZh,
                                )}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" title={String(report.format ?? '')}>
                            {formatReportStorageFormatLabel(report.format)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatReportFileSize(report.fileSize)}</TableCell>
                        <TableCell>{formatReportCreatedAt(report.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate({
                                    to: '/reports/$reportId',
                                    params: { reportId: report.id },
                                  })
                                }
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  downloadMutation.mutate({
                                    id: report.id,
                                    fileName: report.filePath,
                                    format: report.format,
                                  })
                                }
                                disabled={downloadMutation.isPending || !report.filePath}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (
                                    window.confirm('Are you sure you want to delete this report?')
                                  ) {
                                    deleteMutation.mutate(report.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && (listTotal > 0 || currentPage > 1) && (
          <Pagination
            currentPage={Math.min(currentPage, totalPages)}
            totalPages={totalPages}
            pageSize={pageSize}
            total={listTotal}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            itemLabels={{ singular: 'report', plural: 'reports' }}
            className="pt-2"
          />
        )}
      </Main>
    </>
  );
}
