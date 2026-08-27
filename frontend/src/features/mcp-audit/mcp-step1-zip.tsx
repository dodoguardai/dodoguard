/**
 * Step 1: MCP server source — .zip only
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const MAX_ZIP_BYTES = 15 * 1024 * 1024;

export interface McpStep1ZipProps {
  zipFile: File | null;
  setZipFile: (v: File | null) => void;
  setFileName: (v: string | undefined) => void;
  onZipSelected?: () => void;
}

export function McpStep1Zip({ zipFile, setZipFile, setFileName, onZipSelected }: McpStep1ZipProps) {
  const { t } = useTranslation();

  const onZip = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith('.zip')) {
        toast.error(t('pages.mcpAudit.toastZipOnly'));
        return;
      }
      if (file.size > MAX_ZIP_BYTES) {
        toast.error(t('pages.mcpAudit.zipTooLarge', { mb: MAX_ZIP_BYTES / 1024 / 1024 }));
        return;
      }
      setZipFile(file);
      setFileName(file.name);
      onZipSelected?.();
      toast.success(t('pages.mcpAudit.toastZipLoaded', { name: file.name }));
    },
    [setZipFile, setFileName, onZipSelected, t],
  );

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-1 block">{t('pages.mcpAudit.step1ZipLabel')}</Label>
        <div className="mt-1 flex min-h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
          <input
            id="mcp-audit-zip"
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => void onZip(e.target.files?.[0])}
          />
          <Label
            htmlFor="mcp-audit-zip"
            className="text-primary shrink-0 cursor-pointer text-sm font-medium hover:underline"
          >
            {t('pages.mcpAudit.step1ChooseZip')}
          </Label>
          <span className="text-muted-foreground truncate text-sm">
            {zipFile?.name ?? t('pages.mcpAudit.step1NoZip')}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{t('pages.mcpAudit.step1ZipHint')}</p>
      </div>
    </div>
  );
}
