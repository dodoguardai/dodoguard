import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
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
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { getApiClientErrorMessage } from '@/services/api/client';

type TechnicalCaseImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryId: string;
  libraryTitle: string;
  onSuccess?: () => void;
};

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_') || '用例库';
}

export function TechnicalCaseImportDialog({
  open,
  onOpenChange,
  libraryId,
  libraryTitle,
  onSuccess,
}: TechnicalCaseImportDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const blob = await detectionScanningApi.downloadCaseImportTemplate(libraryId);
      triggerBlobDownload(blob, `${safeFileName(libraryTitle)}_用例导入模板.xlsx`);
      toast.success('模板已下载');
    } catch (error) {
      toast.error(getApiClientErrorMessage(error) || '模板下载失败');
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport() {
    if (!file) {
      toast.error('请先选择 Excel 文件');
      return;
    }
    setImporting(true);
    try {
      const result = await detectionScanningApi.importTestCases(libraryId, file);
      toast.success(`已导入 ${result.imported} 条用例`);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiClientErrorMessage(error) || '导入失败');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            导入用例库
          </DialogTitle>
          <DialogDescription>
            {libraryTitle} · 下载模板填写后上传，数据会导入到当前分类下的检测用例库。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            模板字段：用例名称、测试方法、攻击场景、风险等级、prompt、预期安全响应、风险命中表现。
            其中用例名称、测试方法、风险等级和 prompt 为必填；用例编号由系统自动生成。
          </div>

          <div className="grid gap-2">
            <Label htmlFor="technical-case-import-file">Excel 文件</Label>
            <Input
              id="technical-case-import-file"
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                已选择：{file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={downloading || importing}
            onClick={handleDownloadTemplate}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            下载模板
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={!file || importing} onClick={handleImport}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              上传导入
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
