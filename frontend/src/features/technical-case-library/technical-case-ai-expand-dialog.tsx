import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import {
  detectionScanningApi,
  type TechnicalCaseAiExpandPreviewItem,
} from '@/services/api/detection-scanning';
import { getApiClientErrorMessage } from '@/services/api/client';
import type { SecurityTestCase } from '@/types/entities';
import {
  buildTechnicalCaseMetadata,
  TECHNICAL_TEST_METHOD_LABELS,
  type TechnicalTestMethodSlug,
  renderTechnicalPayloadPreview,
} from './technical-case-test-methods';

type TechnicalCaseAiExpandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryId: string;
  libraryTitle: string;
  onSuccess?: () => void;
};

function getAiExpandErrorDetail(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') {
    return '';
  }
  const nested = (details as { details?: unknown }).details;
  const source =
    nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : details;
  const outputPreview = (source as Record<string, unknown>).outputPreview;
  if (typeof outputPreview === 'string' && outputPreview.trim()) {
    return outputPreview.trim();
  }
  return '';
}

export function TechnicalCaseAiExpandDialog({
  open,
  onOpenChange,
  libraryId,
  libraryTitle,
  onSuccess,
}: TechnicalCaseAiExpandDialogProps) {
  const [direction, setDirection] = useState('');
  const [count, setCount] = useState(3);
  const [typePref, setTypePref] = useState<TechnicalTestMethodSlug | 'any'>('any');
  const [referenceCaseIds, setReferenceCaseIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TechnicalCaseAiExpandPreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateErrorDetail, setGenerateErrorDetail] = useState('');

  const selectedCount = selected.size;
  const referenceCount = referenceCaseIds.size;

  const previewItems = useMemo(
    () => preview.filter((item) => selected.has(item.id)),
    [preview, selected],
  );
  const referenceCasesQuery = useQuery({
    queryKey: ['technical-case-ai-expand-reference-cases', libraryId],
    queryFn: () => detectionScanningApi.listTestCases(libraryId),
    enabled: open,
  });
  const referenceCases = referenceCasesQuery.data || [];

  function toggleReferenceCase(item: SecurityTestCase, checked: boolean) {
    setReferenceCaseIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= 3 && !next.has(item.id)) {
          toast.error('最多选择 3 条参考用例');
          return prev;
        }
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError('');
    setGenerateErrorDetail('');
    setPreview([]);
    setSelected(new Set());
    try {
      const result = await detectionScanningApi.generateTechnicalCaseAiPreview(libraryId, {
        direction,
        count,
        typePref,
        referenceCaseIds: Array.from(referenceCaseIds),
      });
      setPreview(result.cases);
      setSelected(new Set(result.cases.map((item) => item.id)));
      toast.success(`已生成 ${result.cases.length} 条 AI 用例预览`);
    } catch (error) {
      const message = getApiClientErrorMessage(error);
      setGenerateError(message);
      setGenerateErrorDetail(getAiExpandErrorDetail(error));
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleImport() {
    if (!previewItems.length) {
      toast.error('请至少选择一条用例');
      return;
    }
    setImporting(true);
    try {
      for (const item of previewItems) {
        const metadata = buildTechnicalCaseMetadata({
          testMethodSlug: item.testMethodSlug,
          customTestMethod: item.customTestMethod,
          attackScene:
            typeof item.metadata?.attackScene === 'string' ? item.metadata.attackScene : undefined,
          riskSubclass:
            typeof item.metadata?.riskSubclass === 'string'
              ? item.metadata.riskSubclass
              : undefined,
          caseBasis: 'AI 自动扩充',
          turnSteps: Array.isArray(item.metadata?.turnSteps)
            ? (item.metadata.turnSteps as { userInput: string; expectedSafe: string }[])
            : undefined,
        });
        await detectionScanningApi.createTestCase(libraryId, {
          name: item.name,
          attackType: item.testMethodSlug,
          prompt: item.prompt,
          expectedPass: item.expectedPass,
          expectedFail: item.expectedFail,
          riskLevel: item.riskLevel || 'high',
          status: 'draft',
          tags: item.tags,
          metadata,
        });
      }
      toast.success(`已入库 ${previewItems.length} 条 AI 扩充用例`);
      onSuccess?.();
      onOpenChange(false);
      setPreview([]);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '入库失败');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI 自动扩充
          </DialogTitle>
          <DialogDescription>
            {libraryTitle} · 使用首个可用审查模型生成用例预览，勾选后批量入库
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>扩充方向</Label>
            <Textarea
              rows={2}
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              placeholder="例如：系统指令泄露、越狱、多轮诱导"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>生成数量</Label>
              <Input
                type="number"
                min={2}
                max={5}
                value={count}
                onChange={(event) => setCount(Number(event.target.value) || 3)}
              />
            </div>
            <div className="grid gap-2">
              <Label>偏好测试方式</Label>
              <Select
                value={typePref}
                onValueChange={(value) => setTypePref(value as TechnicalTestMethodSlug | 'any')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">不限</SelectItem>
                  {Object.entries(TECHNICAL_TEST_METHOD_LABELS).map(([slug, label]) => (
                    <SelectItem key={slug} value={slug}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>参考用例</Label>
              <span className="text-xs text-muted-foreground">已选 {referenceCount}/3</span>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {referenceCasesQuery.isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">加载中…</div>
              ) : referenceCases.length ? (
                referenceCases.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={referenceCaseIds.has(item.id)}
                      onCheckedChange={(checked) => toggleReferenceCase(item, checked === true)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.name}</span>
                        <Badge variant="outline">
                          {TECHNICAL_TEST_METHOD_LABELS[
                            item.attackType as TechnicalTestMethodSlug
                          ] || item.attackType}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 font-mono text-xs text-muted-foreground">
                        {renderTechnicalPayloadPreview(item)}
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-muted-foreground">暂无可参考用例</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              仅借鉴结构和判定口径，生成时会避开同类改写。
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? '生成中…' : '生成预览'}
          </Button>

          {generating ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              正在生成用例预览，请稍候。
            </div>
          ) : null}

          {generateError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {generateError}
              {generateErrorDetail ? (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-xs text-muted-foreground">
                  {generateErrorDetail}
                </pre>
              ) : null}
            </div>
          ) : null}

          {preview.length > 0 ? (
            <div className="grid gap-3 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                勾选要入库的用例（{selectedCount} 条）
              </p>
              {preview.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/30"
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(item.id);
                        } else {
                          next.delete(item.id);
                        }
                        return next;
                      });
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge variant="outline">
                        {item.testMethodSlug === 'custom'
                          ? item.customTestMethod || TECHNICAL_TEST_METHOD_LABELS.custom
                          : TECHNICAL_TEST_METHOD_LABELS[item.testMethodSlug]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 font-mono text-xs text-muted-foreground">
                      {item.prompt}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!previewItems.length || importing} onClick={handleImport}>
            {importing ? '入库中…' : `入库 ${selectedCount} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
