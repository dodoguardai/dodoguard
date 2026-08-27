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
import { getApiClientErrorMessage } from '@/services/api/client';
import {
  detectionScanningApi,
  type ComplianceCaseAiExpandPreviewItem,
} from '@/services/api/detection-scanning';
import type { SecurityTestCase } from '@/types/entities';
import {
  buildCaseMetadata,
  readCaseExtraMetadata,
  renderCasePayloadPreview,
  type CaseExtraMetadata,
} from './compliance-case-form-fields';
import { SAMPLE_TYPE_LABELS, type SampleType } from './shared';

type ComplianceAiExpandDialogProps = {
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

function buildExtraFromPreview(item: ComplianceCaseAiExpandPreviewItem): CaseExtraMetadata {
  const metadata = item.metadata || {};
  return {
    turns: Array.isArray(metadata.turns)
      ? (metadata.turns as { role: string; content: string }[])
      : undefined,
    fileName: typeof metadata.fileName === 'string' ? metadata.fileName : undefined,
    fileContent: typeof metadata.fileContent === 'string' ? metadata.fileContent : undefined,
    userQuery: typeof metadata.userQuery === 'string' ? metadata.userQuery : undefined,
  };
}

export function ComplianceAiExpandDialog({
  open,
  onOpenChange,
  libraryId,
  libraryTitle,
  onSuccess,
}: ComplianceAiExpandDialogProps) {
  const [direction, setDirection] = useState('');
  const [count, setCount] = useState(3);
  const [typePref, setTypePref] = useState<SampleType | 'any'>('any');
  const [referenceCaseIds, setReferenceCaseIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ComplianceCaseAiExpandPreviewItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateErrorDetail, setGenerateErrorDetail] = useState('');

  const allSelected = preview.length > 0 && selected.size === preview.length;
  const selectedCount = selected.size;
  const referenceCount = referenceCaseIds.size;
  const selectedPreview = useMemo(
    () => preview.filter((item) => selected.has(item.id)),
    [preview, selected],
  );
  const referenceCasesQuery = useQuery({
    queryKey: ['compliance-case-ai-expand-reference-cases', libraryId],
    queryFn: () => detectionScanningApi.listTestCases(libraryId),
    enabled: open,
  });
  const referenceCases = referenceCasesQuery.data || [];

  function reset() {
    setDirection('');
    setCount(3);
    setTypePref('any');
    setReferenceCaseIds(new Set());
    setPreview([]);
    setSelected(new Set());
    setStep('input');
    setGenerateError('');
    setGenerateErrorDetail('');
  }

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
      const result = await detectionScanningApi.generateComplianceCaseAiPreview(libraryId, {
        direction,
        count,
        typePref,
        referenceCaseIds: Array.from(referenceCaseIds),
      });
      setPreview(result.cases);
      setSelected(new Set(result.cases.map((item) => item.id)));
      setStep('preview');
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
    if (!selectedPreview.length) {
      toast.error('请至少选择一条用例');
      return;
    }
    setSaving(true);
    try {
      for (const [index, item] of selectedPreview.entries()) {
        const metadata = buildCaseMetadata(
          item.sampleType,
          typeof item.metadata?.regClause === 'string' ? item.metadata.regClause : '',
          buildExtraFromPreview(item),
        );
        metadata.caseBasis = 'AI 自动扩充';
        await detectionScanningApi.createTestCase(libraryId, {
          name: item.name,
          attackType: item.sampleType,
          prompt: item.prompt,
          expectedPass: item.expectedPass,
          expectedFail: item.expectedFail,
          riskLevel: item.riskLevel || 'medium',
          status: 'draft',
          tags: item.tags,
          sortOrder: index,
          metadata,
        });
      }
      toast.success(`已入库 ${selectedPreview.length} 条 AI 扩充用例`);
      onOpenChange(false);
      reset();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '入库失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
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

        {step === 'input' ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>扩充方向</Label>
              <Textarea
                rows={3}
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                placeholder="例如：个人信息跨境传输、金融适当性告知"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>生成条数</Label>
                <Input
                  type="number"
                  min={2}
                  max={5}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value) || 3)}
                />
              </div>
              <div className="grid gap-2">
                <Label>类型偏好</Label>
                <Select
                  value={typePref}
                  onValueChange={(value) => setTypePref(value as SampleType | 'any')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">混合</SelectItem>
                    {Object.entries(SAMPLE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
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
                  referenceCases.map((item) => {
                    const extra = readCaseExtraMetadata(item.metadata);
                    return (
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
                              {SAMPLE_TYPE_LABELS[item.attackType as SampleType] || item.attackType}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-1 font-mono text-xs text-muted-foreground">
                            {renderCasePayloadPreview(
                              item.attackType as SampleType,
                              item.prompt,
                              extra,
                            )}
                          </p>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">暂无可参考用例</div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                仅借鉴法规粒度和判定口径，生成时会避开同类改写。
              </p>
            </div>

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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={generating}>
                {generating ? '生成中…' : '生成预览'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                勾选要入库的用例（{selectedCount} 条）
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (allSelected) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(preview.map((item) => item.id)));
                  }
                }}
              >
                {allSelected ? '取消全选' : '全选'}
              </Button>
            </div>
            <div className="grid max-h-[360px] gap-3 overflow-y-auto">
              {preview.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-muted/30"
                >
                  <Checkbox
                    checked={selected.has(item.id)}
                    className="mt-1"
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
                      <p className="font-medium">{item.name}</p>
                      <Badge variant="outline">{SAMPLE_TYPE_LABELS[item.sampleType]}</Badge>
                      {typeof item.metadata?.regClause === 'string' && item.metadata.regClause ? (
                        <Badge variant="secondary">{item.metadata.regClause}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.prompt}</p>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('input')}>
                返回
              </Button>
              <Button type="button" disabled={saving || selectedCount === 0} onClick={handleImport}>
                {saving ? '入库中' : `批量入库 (${selectedCount})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
