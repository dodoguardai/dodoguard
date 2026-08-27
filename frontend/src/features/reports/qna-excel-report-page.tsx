/**
 * 上传 Excel 问答用例，生成对抗测评 PDF（与平台任务报告同版式）。
 */

import { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reportsApi } from '@/services/api/reports';

export function QnaExcelReportPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const tr = (key: string, zh: string) => (i18n.exists(key) ? t(key) : zh);

  const [file, setFile] = useState<File | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [targetDisplayName, setTargetDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const onDownload = useCallback(async () => {
    if (!file) {
      toast.error(tr('reports.qnaExcel.noFile', '请先选择 .xlsx 文件'));
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error(tr('reports.qnaExcel.badExt', '仅支持 .xlsx 格式'));
      return;
    }
    setBusy(true);
    try {
      const blob = await reportsApi.downloadQnaExcelPdf({
        file,
        reportTitle: reportTitle.trim() || undefined,
        targetDisplayName: targetDisplayName.trim() || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.xlsx$/i, '') + '-对话测评报告.pdf';
      a.click();
      URL.revokeObjectURL(url);
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-manual-reports'] });
      toast.success(tr('reports.qnaExcel.success', 'PDF 已生成并开始下载，报告已入库'));
    } catch (e) {
      toast.error((e as Error).message || tr('reports.qnaExcel.failed', '生成失败'));
    } finally {
      setBusy(false);
    }
  }, [file, queryClient, reportTitle, targetDisplayName, tr]);

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main fluid className="flex w-full flex-1 flex-col gap-6 py-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reports/audit-center">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tr('reports.qnaExcel.back', '返回报告列表')}
            </Link>
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {tr('reports.qnaExcel.title', 'Excel 问答对抗测评')}
            </CardTitle>
            <CardDescription className="max-w-5xl">
              {tr(
                'reports.qnaExcel.description',
                '上传首工作表含「类型、问题内容、实际回答」三列的 .xlsx，系统将自动归纳并生成与任务报告同版式的 PDF。可选填报告标题与测试对象名称。',
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="qna-file">{tr('reports.qnaExcel.file', 'Excel 文件')}</Label>
                <Input
                  id="qna-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qna-title">
                  {tr('reports.qnaExcel.reportTitle', '报告标题（可选）')}
                </Label>
                <Input
                  id="qna-title"
                  placeholder={tr(
                    'reports.qnaExcel.reportTitlePh',
                    '默认：智能体 API 对话安全与合规测评报告',
                  )}
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qna-target">
                  {tr('reports.qnaExcel.targetName', '测试对象显示名（可选）')}
                </Label>
                <Input
                  id="qna-target"
                  placeholder={tr('reports.qnaExcel.targetNamePh', '默认：被测智能体（API 对话）')}
                  value={targetDisplayName}
                  onChange={(e) => setTargetDisplayName(e.target.value)}
                />
              </div>
            </div>

            <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void onDownload()}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr('reports.qnaExcel.generating', '正在生成 PDF…')}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {tr('reports.qnaExcel.download', '生成并下载 PDF')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </Main>
    </>
  );
}
