/**
 * Step 1: Upload or paste n8n workflow JSON
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface Step1UploadProps {
  jsonText: string;
  setJsonText: (v: string) => void;
  fileName: string | undefined;
  setFileName: (v: string | undefined) => void;
  onJsonChange?: () => void;
}

export function Step1Upload({
  jsonText,
  setJsonText,
  fileName,
  setFileName,
  onJsonChange,
}: Step1UploadProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!/\.json$/i.test(file.name)) {
        toast.error(tr('Please choose a .json file', '请选择 .json 文件'));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(tr(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, `文件过大（最大 ${MAX_FILE_BYTES / 1024 / 1024} MB）`));
        return;
      }
      const text = await file.text();
      setJsonText(text);
      setFileName(file.name);
      onJsonChange?.();
      toast.success(tr(`Loaded ${file.name}`, `已加载 ${file.name}`));
    },
    [setJsonText, setFileName, onJsonChange, isZh],
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 block">{tr('Upload', '上传')}</Label>
        <div className="mt-1 flex min-h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
          <input
            id="n8n-json-file"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Label
            htmlFor="n8n-json-file"
            className="cursor-pointer shrink-0 text-sm font-medium text-primary hover:underline"
          >
            {tr('Choose file', '选择文件')}
          </Label>
          <span className="truncate text-sm text-muted-foreground">
            {fileName || tr('No file chosen', '未选择文件')}
          </span>
        </div>
      </div>
      <Collapsible defaultOpen={false} className="group/collapse">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md py-1.5 text-left text-sm font-medium hover:bg-muted/50"
          >
            {tr('Or paste JSON', '或粘贴 JSON')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <Textarea
            id="n8n-json-paste"
            className="mt-1 min-h-[200px] font-mono text-xs"
            placeholder='{ "nodes": [ ... ], "connections": { ... } }'
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              onJsonChange?.();
            }}
          />
        </CollapsibleContent>
      </Collapsible>
      <p className="text-xs text-muted-foreground">
        {tr(
          `Export your app/workflow from n8n as JSON. Max ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
          `从 n8n 导出应用/工作流（JSON）。最大 ${MAX_FILE_BYTES / 1024 / 1024} MB。`,
        )}
      </p>
    </div>
  );
}

