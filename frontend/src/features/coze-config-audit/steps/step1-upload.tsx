/**
 * Step 1: Upload or paste Coze workflow YAML
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
  yamlText: string;
  setYamlText: (v: string) => void;
  fileName: string | undefined;
  setFileName: (v: string | undefined) => void;
  onYamlChange?: () => void;
}

export function Step1Upload({
  yamlText,
  setYamlText,
  fileName,
  setFileName,
  onYamlChange,
}: Step1UploadProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!/\.(ya?ml)$/i.test(file.name)) {
        toast.error(tr('Please choose a .yml or .yaml file', '请选择 .yml 或 .yaml 文件'));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(tr(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, `文件过大（最大 ${MAX_FILE_BYTES / 1024 / 1024} MB）`));
        return;
      }
      const text = await file.text();
      setYamlText(text);
      setFileName(file.name);
      onYamlChange?.();
      toast.success(tr(`Loaded ${file.name}`, `已加载 ${file.name}`));
    },
    [setYamlText, setFileName, onYamlChange, isZh],
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1 block">{tr('Upload', '上传')}</Label>
        <div className="mt-1 flex min-h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
          <input
            id="coze-yaml-file"
            type="file"
            accept=".yml,.yaml"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Label
            htmlFor="coze-yaml-file"
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
            {tr('Or paste YAML', '或粘贴 YAML')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <Textarea
            id="coze-yaml-paste"
            className="mt-1 min-h-[200px] font-mono text-xs"
            placeholder="schema_version: 1.0.0 ..."
            value={yamlText}
            onChange={(e) => {
              setYamlText(e.target.value);
              onYamlChange?.();
            }}
          />
        </CollapsibleContent>
      </Collapsible>
      <p className="text-xs text-muted-foreground">
        {tr(
          `Export your workflow from Coze (YAML). Max ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
          `从 Coze 导出工作流（YAML）。最大 ${MAX_FILE_BYTES / 1024 / 1024} MB。`,
        )}
      </p>
    </div>
  );
}
