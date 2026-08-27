import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { workflowConfigAssetsApi } from '@/services/api/workflow-config-assets';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, asset is stored against this target agent (same org). */
  targetAgentId?: string;
};

export function UploadWorkflowConfigDialog({ open, onOpenChange, targetAgentId }: Props) {
  const { t } = useTranslation();
  const p = 'pages.workflowConfigAssets.upload';
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState('');
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const [sourceType, setSourceType] = useState<string>('auto');

  const mutation = useMutation({
    mutationFn: () =>
      workflowConfigAssetsApi.create({
        raw,
        name: name.trim() || undefined,
        fileName: fileName.trim() || undefined,
        ...(sourceType === 'auto'
          ? {}
          : { sourceType: sourceType as 'dify' | 'fastgpt' | 'coze' }),
        ...(targetAgentId ? { targetAgentId } : {}),
      }),
    onSuccess: (data) => {
      toast.success(
        data.deduplicated ? t(`${p}.toastDedup`) : t(`${p}.toastCreated`, { name: data.asset.name }),
      );
      void queryClient.invalidateQueries({ queryKey: ['workflow-config-assets'] });
      onOpenChange(false);
      setRaw('');
      setName('');
      setFileName('');
      setSourceType('auto');
    },
    onError: (err: Error & { status?: number; code?: string }) => {
      if (err.status === 501 || err.code === 'NOT_SUPPORTED') {
        toast.error(t(`${p}.notSupported`));
        return;
      }
      toast.error(err.message || t(`${p}.toastError`));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`${p}.title`)}</DialogTitle>
          <DialogDescription>{t(`${p}.description`)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="wf-raw">{t(`${p}.labelRaw`)}</Label>
            <Textarea
              id="wf-raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t(`${p}.placeholderRaw`)}
              className="font-mono text-xs [field-sizing:fixed] min-h-[200px] max-h-[min(55vh,22rem)] resize-y overflow-y-auto"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wf-name">{t(`${p}.labelName`)}</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(`${p}.placeholderName`)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wf-file">{t(`${p}.labelFileName`)}</Label>
            <Input
              id="wf-file"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t(`${p}.placeholderFileName`)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t(`${p}.labelSourceType`)}</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t(`${p}.sourceAuto`)}</SelectItem>
                <SelectItem value="dify">Dify</SelectItem>
                <SelectItem value="fastgpt">FastGPT</SelectItem>
                <SelectItem value="coze">Coze</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" disabled={!raw.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : t(`${p}.submit`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
