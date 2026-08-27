/**
 * 紧凑扫描提交栏 — 拖拽上传 + 格式说明（参考 SAFESKILL 文件 Tab）
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown, FileArchive, Link2, Loader2, Package, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ModelOption } from '@/features/skills-md-audit/steps/step2-reviewer';
import {
  SCAN_STRATEGIES_ADVANCED,
  SCAN_STRATEGIES_UI,
  SCAN_STRATEGY_META,
  type ScanStrategy,
} from 'capability-audit/shared/scan';
import {
  ARCHIVE_ACCEPT,
  archiveFormatHint,
  archiveSizeLimitMb,
  isSupportedArchiveFileName,
  MAX_ARCHIVE_BYTES,
  MAX_MARKDOWN_BYTES,
} from 'capability-audit/shared/upload-formats';

export type ScanSubmitBarProps = {
  isSkills: boolean;
  isZh: boolean;
  loading: boolean;
  zipFile: File | null;
  setZipFile: (f: File | null) => void;
  markdownText: string;
  setMarkdownText: (v: string) => void;
  fileName: string | undefined;
  setFileName: (v: string | undefined) => void;
  sourceUrl: string;
  setSourceUrl: (v: string) => void;
  scanStrategy: ScanStrategy;
  setScanStrategy: (v: ScanStrategy) => void;
  debugEnginesText: string;
  setDebugEnginesText: (v: string) => void;
  useAsyncScan: boolean;
  setUseAsyncScan: (v: boolean) => void;
  needsLlm: boolean;
  modelOptions: ModelOption[];
  selectedModelValue: string;
  setSelectedModelValue: (v: string) => void;
  taskStatus: string | null;
  onInputChange?: () => void;
  onRun: () => void;
  /** When false, hide strategy select and force callers to use default standard. */
  showScanStrategy?: boolean;
};

type InputTab = 'archive' | 'markdown' | 'url';

export function ScanSubmitBar({
  isSkills,
  isZh,
  loading,
  zipFile,
  setZipFile,
  markdownText,
  setMarkdownText,
  fileName,
  setFileName,
  sourceUrl,
  setSourceUrl,
  scanStrategy,
  setScanStrategy,
  debugEnginesText,
  setDebugEnginesText,
  useAsyncScan,
  setUseAsyncScan,
  needsLlm,
  modelOptions,
  selectedModelValue,
  setSelectedModelValue,
  taskStatus,
  onInputChange,
  onRun,
  showScanStrategy = true,
}: ScanSubmitBarProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [inputTab, setInputTab] = useState<InputTab>('archive');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const maxMb = archiveSizeLimitMb();
  const hasArchive = Boolean(zipFile);
  const hasMarkdown = Boolean(
    markdownText.trim() || (fileName && /\.(md|markdown)$/i.test(fileName)),
  );

  const onArchive = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }
      if (!isSupportedArchiveFileName(file.name)) {
        toast.error(
          tr(
            `Unsupported format. Use ${archiveFormatHint(false)}`,
            `不支持的格式，请使用 ${archiveFormatHint(true)}`,
          ),
        );
        return;
      }
      if (file.size > MAX_ARCHIVE_BYTES) {
        toast.error(tr(`Archive too large (max ${maxMb} MB)`, `压缩包过大（最大 ${maxMb} MB）`));
        return;
      }
      setZipFile(file);
      setMarkdownText('');
      setSourceUrl('');
      setFileName(file.name);
      setInputTab('archive');
      onInputChange?.();
    },
    [setZipFile, setMarkdownText, setSourceUrl, setFileName, onInputChange, tr, maxMb],
  );

  const onMdFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !isSkills) {
        return;
      }
      if (!/\.(md|markdown)$/i.test(file.name)) {
        toast.error(tr('Please choose a .md file', '请选择 .md 文件'));
        return;
      }
      if (file.size > MAX_MARKDOWN_BYTES) {
        toast.error(
          tr(
            `File too large (max ${MAX_MARKDOWN_BYTES / 1024 / 1024} MB)`,
            `文件过大（最大 ${MAX_MARKDOWN_BYTES / 1024 / 1024} MB）`,
          ),
        );
        return;
      }
      const text = await file.text();
      setZipFile(null);
      setSourceUrl('');
      setMarkdownText(text);
      setFileName(file.name);
      setInputTab('markdown');
      onInputChange?.();
    },
    [isSkills, setZipFile, setSourceUrl, setMarkdownText, setFileName, onInputChange, tr],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) {
        return;
      }
      if (isSkills && /\.(md|markdown)$/i.test(file.name)) {
        void onMdFile(file);
        return;
      }
      void onArchive(file);
    },
    [onArchive, onMdFile, isSkills],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex">
          {isSkills ? (
            <>
              <button
                type="button"
                onClick={() => setInputTab('archive')}
                className={
                  inputTab === 'archive'
                    ? 'border-b-2 border-neutral-950 px-5 py-2.5 text-sm font-medium text-neutral-950 dark:border-neutral-100 dark:text-neutral-100'
                    : 'text-muted-foreground hover:text-foreground px-5 py-2.5 text-sm transition-colors'
                }
              >
                {tr('File', '文件')}
              </button>
              <button
                type="button"
                onClick={() => setInputTab('markdown')}
                className={
                  inputTab === 'markdown'
                    ? 'border-b-2 border-neutral-950 px-5 py-2.5 text-sm font-medium text-neutral-950 dark:border-neutral-100 dark:text-neutral-100'
                    : 'text-muted-foreground hover:text-foreground px-5 py-2.5 text-sm transition-colors'
                }
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => setInputTab('url')}
                className={
                  inputTab === 'url'
                    ? 'border-b-2 border-neutral-950 px-5 py-2.5 text-sm font-medium text-neutral-950 dark:border-neutral-100 dark:text-neutral-100'
                    : 'text-muted-foreground hover:text-foreground px-5 py-2.5 text-sm transition-colors'
                }
              >
                URL
              </button>
            </>
          ) : (
            <button
              type="button"
              className="border-b-2 border-neutral-950 px-5 py-2.5 text-sm font-medium text-neutral-950 dark:border-neutral-100 dark:text-neutral-100"
            >
              {tr('File', '文件')}
            </button>
          )}
        </div>
        {!isSkills && (
          <p className="text-muted-foreground hidden pr-4 text-xs sm:block">
            {tr('MCP server source archive', 'MCP 服务端源码压缩包')}
          </p>
        )}
      </div>

      {(inputTab === 'archive' || !isSkills) && (
        <>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && archiveInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => archiveInputRef.current?.click()}
            className={
              dragOver
                ? 'cursor-pointer border-b border-dashed border-neutral-500 bg-neutral-100/80 px-6 py-10 transition-colors dark:bg-neutral-900/50'
                : 'hover:border-neutral-400 cursor-pointer border-b border-dashed border-slate-300 bg-slate-50/50 px-6 py-10 transition-colors hover:bg-neutral-100/60 dark:border-slate-600 dark:bg-neutral-950/40 dark:hover:bg-neutral-900/40'
            }
          >
            <input
              ref={archiveInputRef}
              type="file"
              accept={ARCHIVE_ACCEPT}
              className="sr-only"
              onChange={(e) => void onArchive(e.target.files?.[0])}
            />
            <div className="flex flex-col items-center text-center">
              {hasArchive ? (
                <>
                  <FileArchive className="mb-3 size-10 text-neutral-800 dark:text-neutral-200" />
                  <p className="max-w-md truncate font-medium text-slate-900 dark:text-slate-100">
                    {zipFile?.name}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {tr('Click or drop to replace', '点击或拖拽以更换文件')}
                  </p>
                </>
              ) : (
                <>
                  <Package className="mb-3 size-10 text-neutral-600 dark:text-neutral-400" />
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {tr('Drag file here or click to upload', '拖拽文件到此处或点击上传')}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1 border-b border-slate-100 px-5 py-3 text-xs dark:border-slate-800">
            <p className="text-muted-foreground">
              {tr('Supported formats', '支持格式')}：
              <span className="text-foreground ml-1 font-mono">{archiveFormatHint(isZh)}</span>
            </p>
            <p className="text-muted-foreground">
              {tr('Size limit', '大小限制')}：{tr(' max ', ' 单文件最大 ')}
              <span className="font-semibold text-neutral-950 dark:text-neutral-100">
                {maxMb} MB
              </span>
            </p>
            <p className="text-muted-foreground">
              {tr('Notes', '其他说明')}：
              {isSkills
                ? tr(
                    ' package should contain SKILL.md (or skill.md) and skill assets',
                    ' 压缩包内需包含 SKILL.md（或 skill.md）及技能相关文件',
                  )
                : tr(' upload MCP server source as archive', ' 请上传 MCP 服务端源码压缩包')}
            </p>
          </div>
        </>
      )}

      {isSkills && inputTab === 'url' && (
        <div className="space-y-3 border-b border-slate-100 px-5 py-6 dark:border-slate-800">
          <div className="flex flex-col items-center text-center">
            <Link2 className="mb-3 size-10 text-neutral-600 dark:text-neutral-400" />
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {tr('Paste a direct download URL', '粘贴 Skill 制品直链 URL')}
            </p>
          </div>
          <Input
            type="url"
            placeholder="https://example.com/skill-package.zip"
            value={sourceUrl}
            disabled={loading}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              setZipFile(null);
              setMarkdownText('');
              setFileName(undefined);
              onInputChange?.();
            }}
            className="font-mono text-sm"
          />
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">
              {tr('Supported formats', '支持格式')}：
              <span className="text-foreground ml-1 font-mono">
                {archiveFormatHint(isZh)} · .md
              </span>
            </p>
            <p className="text-muted-foreground">
              {tr('Notes', '其他说明')}：
              {tr(' must be a public http(s) direct link', ' 需为可公网访问的 http(s) 直链')}
            </p>
          </div>
        </div>
      )}

      {isSkills && inputTab === 'markdown' && (
        <div className="space-y-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">
              {tr('Supported formats', '支持格式')}：
              <span className="text-foreground ml-1 font-mono">.md · .markdown</span>
              {tr(' · paste text', ' · 或直接粘贴')}
            </p>
            <p className="text-muted-foreground">
              {tr('Size limit', '大小限制')}：{tr(' max ', ' 单文件最大 ')}
              <span className="font-semibold text-neutral-950 dark:text-neutral-100">
                {MAX_MARKDOWN_BYTES / 1024 / 1024} MB
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="scan-md-file"
              type="file"
              accept=".md,.markdown"
              className="sr-only"
              onChange={(e) => void onMdFile(e.target.files?.[0])}
            />
            <Label
              htmlFor="scan-md-file"
              className="cursor-pointer text-xs text-neutral-900 hover:underline dark:text-neutral-100"
            >
              {tr('Upload .md file', '上传 .md 文件')}
            </Label>
            {hasMarkdown && fileName && (
              <span className="text-muted-foreground truncate text-xs">{fileName}</span>
            )}
          </div>
          <Textarea
            className="min-h-[140px] font-mono text-xs"
            placeholder="# My Skill\n..."
            value={markdownText}
            onChange={(e) => {
              setZipFile(null);
              setSourceUrl('');
              setMarkdownText(e.target.value);
              if (e.target.value.trim()) {
                setFileName(undefined);
              }
              onInputChange?.();
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        {showScanStrategy ? (
          <Select
            value={scanStrategy}
            onValueChange={(v) => setScanStrategy(v as ScanStrategy)}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[min(100%,420px)]">
              <SelectValue placeholder={tr('Scan strategy', '扫描策略')} />
            </SelectTrigger>
            <SelectContent className="max-w-[min(100vw-2rem,480px)]">
              {SCAN_STRATEGIES_UI.map((id) => {
                const s = SCAN_STRATEGY_META[id];
                return (
                  <SelectItem key={id} value={id}>
                    <span className="font-medium">{isZh ? s.labelZh : s.labelEn}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      — {isZh ? s.hintZh : s.hintEn}
                    </span>
                  </SelectItem>
                );
              })}
              {showAdvanced &&
                SCAN_STRATEGIES_ADVANCED.map((id) => {
                  const s = SCAN_STRATEGY_META[id];
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="font-medium">{isZh ? s.labelZh : s.labelEn}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        — {isZh ? s.hintZh : s.hintEn}
                      </span>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        ) : null}

        {needsLlm && modelOptions.length > 0 && (
          <Select
            value={selectedModelValue}
            onValueChange={setSelectedModelValue}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={tr('Model', '模型')} />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showScanStrategy ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="text-muted-foreground gap-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Settings2 className="size-4" />
            {tr('Advanced', '高级')}
            <ChevronDown
              className={`size-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
          </Button>
        ) : null}

        <div className="flex-1" />

        <Button
          type="button"
          disabled={loading}
          onClick={onRun}
          className="w-full bg-neutral-950 text-white hover:bg-neutral-800 sm:w-auto dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {tr('Scanning…', '扫描中…')}
            </>
          ) : (
            tr('Run audit', '运行审计')
          )}
        </Button>
      </div>

      {showAdvanced && showScanStrategy && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              checked={useAsyncScan}
              disabled={loading}
              onChange={(e) => setUseAsyncScan(e.target.checked)}
            />
            <span className="text-muted-foreground">
              {tr('Async scan (SARIF export)', '异步扫描（支持 SARIF 导出）')}
            </span>
          </label>
          {scanStrategy === 'debug' && (
            <div className="space-y-1">
              <Label className="text-xs">{tr('Debug engines', '调试引擎')}</Label>
              <Input
                value={debugEnginesText}
                disabled={loading}
                onChange={(e) => setDebugEnginesText(e.target.value)}
                placeholder="skillspector,cisco_skill_scanner,snyk_agent_scan,llm"
                className="font-mono text-xs"
              />
            </div>
          )}
          {taskStatus && loading && (
            <p className="text-muted-foreground text-xs">
              {tr('Task status', '任务状态')}: {taskStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
