import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WizardTag } from '@/features/compliance-detection/compliance-wizard-ui';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { ComplianceTaskTemplate } from '@/types/entities';

type ComplianceTaskTemplateDetailDialogProps = {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseTemplate: (template: ComplianceTaskTemplate) => void;
};

export function ComplianceTaskTemplateDetailDialog({
  templateId,
  open,
  onOpenChange,
  onUseTemplate,
}: ComplianceTaskTemplateDetailDialogProps) {
  const templateQuery = useQuery({
    queryKey: ['compliance-task-template', templateId],
    queryFn: () => detectionScanningApi.getComplianceTaskTemplate(templateId!),
    enabled: open && Boolean(templateId),
  });

  const template = templateQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            {template?.icon ? <span>{template.icon}</span> : null}
            {template?.name || '模版详情'}
          </DialogTitle>
          <DialogDescription>
            {template?.description || '查看预置或自定义合规评估模版配置'}
          </DialogDescription>
        </DialogHeader>

        {templateQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
        ) : template ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <WizardTag tone="purple">{template.domain}</WizardTag>
              <WizardTag tone="blue">{`${template.libCount} 控制库`}</WizardTag>
              <WizardTag tone="gray">{`${template.caseCount} 控制项`}</WizardTag>
              <WizardTag tone="green">{`使用 ${template.usageCount} 次`}</WizardTag>
              {template.isSystem ? <WizardTag tone="orange">平台预置</WizardTag> : null}
            </div>

            <div className="rounded-[14px] border bg-muted/20 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold text-muted-foreground">评估范围</div>
                  <div className="mt-1">{template.scope || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground">负责人</div>
                  <div className="mt-1">{template.ownerName || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground">创建模式</div>
                  <div className="mt-1">{template.creationMode === 'ai' ? 'AI 推荐' : '手动选库'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground">评估场景</div>
                  <div className="mt-1">{template.assessScenario}</div>
                </div>
              </div>
            </div>

            {template.tags.length ? (
              <div>
                <div className="mb-2 text-xs font-bold text-muted-foreground">标签</div>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <WizardTag key={tag} tone="gray">
                      {tag}
                    </WizardTag>
                  ))}
                </div>
              </div>
            ) : null}

            {template.libraries?.length ? (
              <div>
                <div className="mb-2 text-xs font-bold text-muted-foreground">关联合规控制库</div>
                <div className="space-y-2">
                  {template.libraries.map((lib) => (
                    <div
                      key={lib.id}
                      className="flex items-center justify-between rounded-[12px] border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{lib.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {lib.libraryKey} · {lib.domain}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">
                        {lib.caseCount} 条用例
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">未找到模版</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {template ? (
            <Button type="button" onClick={() => onUseTemplate(template)}>
              使用此模版创建任务
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
