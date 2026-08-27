import { useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';
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
import { MODEL_PROVIDERS, type ModelTypeId } from '../constants/model-settings';
import { defaultProviderForType, getModelEndpoint } from '../lib/model-settings-utils';
import { ChatModelFormDialog } from './chat-model-form-dialog';
import type { ManagedModel } from '@/services/api/models';

import type { ModelFormValues } from '../hooks/use-models-by-type';

interface ModelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelType: ModelTypeId;
  editing: ManagedModel | null;
  saving: boolean;
  onSubmit: (values: ModelFormValues) => void;
}

export function ModelFormDialog(props: ModelFormDialogProps) {
  if (props.modelType === 'chat') {
    return <ChatModelFormDialog {...props} />;
  }

  return <SimpleModelFormDialog {...props} />;
}

function SimpleModelFormDialog({
  open,
  onOpenChange,
  modelType,
  editing,
  saving,
  onSubmit,
}: ModelFormDialogProps) {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';
  const typeDefKey = `pages.settingsModels.types.${modelType}`;

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<string>(defaultProviderForType(modelType));
  const [endpoint, setEndpoint] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      setName(editing.name);
      setProvider(editing.provider);
      setEndpoint(getModelEndpoint(editing));
    } else {
      setName('');
      setProvider(defaultProviderForType(modelType));
      setEndpoint('');
    }
  }, [open, editing, modelType]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    onSubmit({ name: name.trim(), provider, endpoint: endpoint.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t(`${p}.editTitle`) : t(`${p}.addTitle`)}</DialogTitle>
          <DialogDescription>{t(`${typeDefKey}.desc`)}</DialogDescription>
        </DialogHeader>
        <form id="model-form" className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model-name">
                {t(`${p}.fieldName`)} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="model-name"
                required
                placeholder={t(`${p}.fieldNamePlaceholder`)}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-provider">{t(`${p}.fieldProvider`)}</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="model-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PROVIDERS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-endpoint">{t(`${p}.fieldEndpoint`)}</Label>
            <Input
              id="model-endpoint"
              placeholder={t(`${p}.fieldEndpointPlaceholder`)}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t(`${p}.cancel`)}
          </Button>
          <Button type="submit" form="model-form" disabled={saving || !name.trim()}>
            {saving ? t(`${p}.saving`) : t(`${p}.confirm`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
