/**
 * Step 1: Upload skill package (.zip) or paste / upload Markdown
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

const MAX_MD_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_BYTES = 15 * 1024 * 1024;

export interface Step1UploadProps {
  markdownText: string;
  setMarkdownText: (v: string) => void;
  fileName: string | undefined;
  setFileName: (v: string | undefined) => void;
  zipFile: File | null;
  setZipFile: (v: File | null) => void;
  onMarkdownChange?: () => void;
}

export function Step1Upload({
  markdownText,
  setMarkdownText,
  fileName,
  setFileName,
  zipFile,
  setZipFile,
  onMarkdownChange,
}: Step1UploadProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const onZip = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith('.zip')) {
        toast.error(tr('Please choose a .zip skill package', '请选择 .zip 技能包'));
        return;
      }
      if (file.size > MAX_ZIP_BYTES) {
        toast.error(
          tr(
            `ZIP too large (max ${MAX_ZIP_BYTES / 1024 / 1024} MB)`,
            `ZIP 过大（最大 ${MAX_ZIP_BYTES / 1024 / 1024} MB）`,
          ),
        );
        return;
      }
      setZipFile(file);
      setMarkdownText('');
      setFileName(file.name);
      onMarkdownChange?.();
      toast.success(tr(`Loaded package ${file.name}`, `已选择技能包 ${file.name}`));
    },
    [setZipFile, setMarkdownText, setFileName, onMarkdownChange, isZh],
  );

  const onMdFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!/\.(md|markdown)$/i.test(file.name)) {
        toast.error(tr('Please choose a .md or .markdown file', '请选择 .md 或 .markdown 文件'));
        return;
      }
      if (file.size > MAX_MD_BYTES) {
        toast.error(
          tr(`File too large (max ${MAX_MD_BYTES / 1024 / 1024} MB)`, `文件过大（最大 ${MAX_MD_BYTES / 1024 / 1024} MB）`),
        );
        return;
      }
      const text = await file.text();
      setZipFile(null);
      setMarkdownText(text);
      setFileName(file.name);
      onMarkdownChange?.();
      toast.success(tr(`Loaded ${file.name}`, `已加载 ${file.name}`));
    },
    [setMarkdownText, setFileName, setZipFile, onMarkdownChange, isZh],
  );

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-1 block">{tr('Skill package (.zip)', '技能包（.zip）')}</Label>
        <div className="mt-1 flex min-h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
          <input
            id="skills-zip-file"
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => void onZip(e.target.files?.[0])}
          />
          <Label
            htmlFor="skills-zip-file"
            className="text-primary shrink-0 cursor-pointer text-sm font-medium hover:underline"
          >
            {tr('Choose ZIP', '选择 ZIP')}
          </Label>
          <span className="text-muted-foreground truncate text-sm">
            {zipFile?.name ?? tr('No package chosen', '未选择技能包')}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {tr(
            'Upload a skill folder as ZIP (SKILL.md, scripts, YAML). Max 15 MB.',
            '将技能目录打包为 ZIP 上传（含 SKILL.md、脚本、YAML 等）。最大 15 MB。',
          )}
        </p>
      </div>

      <div>
        <Label className="mb-1 block">{tr('Or upload Markdown', '或上传 Markdown')}</Label>
        <div className="mt-1 flex min-h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5">
          <input
            id="skills-md-file"
            type="file"
            accept=".md,.markdown"
            className="sr-only"
            onChange={(e) => void onMdFile(e.target.files?.[0])}
          />
          <Label
            htmlFor="skills-md-file"
            className="text-primary shrink-0 cursor-pointer text-sm font-medium hover:underline"
          >
            {tr('Choose file', '选择文件')}
          </Label>
          <span className="text-muted-foreground truncate text-sm">
            {!zipFile && fileName && /\.(md|markdown)$/i.test(fileName) ? fileName : tr('No file chosen', '未选择文件')}
          </span>
        </div>
      </div>

      <Collapsible defaultOpen={false} className="group/collapse">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="hover:bg-muted/50 flex w-full items-center justify-between rounded-md py-1.5 text-left text-sm font-medium"
          >
            {tr('Or paste Markdown', '或粘贴 Markdown')}
            <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapse:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <Textarea
            id="skills-md-paste"
            className="mt-1 min-h-[200px] font-mono text-xs"
            placeholder={'# My Skill\n...'}
            value={markdownText}
            onChange={(e) => {
              setZipFile(null);
              setMarkdownText(e.target.value);
              if (e.target.value.trim()) {
                setFileName(undefined);
              }
              onMarkdownChange?.();
            }}
          />
        </CollapsibleContent>
      </Collapsible>
      <p className="text-muted-foreground text-xs">
        {tr(
          `Single-file Markdown max ${MAX_MD_BYTES / 1024 / 1024} MB. ZIP and Markdown are mutually exclusive.`,
          `单文件 Markdown 最大 ${MAX_MD_BYTES / 1024 / 1024} MB。ZIP 与 Markdown 二选一。`,
        )}
      </p>
    </div>
  );
}
