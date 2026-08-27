import { useCallback, useEffect, useState } from 'react';

import { Eye, EyeOff, Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { getApiClientErrorMessage } from '@/services/api/client';
import { systemConfigApi } from '@/services/api/system-config';
import { CHAT_VENDORS, MODEL_SOURCES, type ModelSourceId } from '../constants/model-settings';
import {
  formValuesToIntegrationPatch,
  integrationToFormValues,
  type ReviewIntegrationFormValues,
} from '../lib/integration-form-utils';
import type { IntegrationConfig } from '@/types/entities';

const REVIEW_EXTRA_VENDORS = [
  { id: 'doubao', labelKey: 'pages.settingsModels.review.providers.doubao' },
  { id: 'aliyun', labelKey: 'pages.settingsModels.review.providers.aliyun' },
  { id: 'ollama', labelKey: 'pages.settingsModels.providers.ollama' },
] as const;

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface ReviewIntegrationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: IntegrationConfig | null;
  saving: boolean;
  onSubmit: (values: ReviewIntegrationFormValues) => void;
}

export function ReviewIntegrationEditDialog({
  open,
  onOpenChange,
  integration,
  saving,
  onSubmit,
}: ReviewIntegrationEditDialogProps) {
  const { t } = useTranslation();
  const p = 'pages.settingsModels.chatForm';

  const [modelSource, setModelSource] = useState<ModelSourceId>('remote');
  const [vendor, setVendor] = useState('custom_openai');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [supportsMultimodal, setSupportsMultimodal] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testLatencyMs, setTestLatencyMs] = useState<number | null>(null);
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);

  const chatVendorIds = new Set<string>(CHAT_VENDORS.map((vendor) => vendor.id));
  const vendorOptions = [
    ...CHAT_VENDORS,
    ...REVIEW_EXTRA_VENDORS.filter((extra) => !chatVendorIds.has(extra.id)),
  ].filter((item) => item.id !== 'ollama');

  useEffect(() => {
    if (!open) {
      return;
    }
    setTestStatus('idle');
    setTestLatencyMs(null);
    setTestErrorMessage(null);
    if (integration) {
      const values = integrationToFormValues(integration);
      setModelSource(values.modelSource);
      setVendor(values.provider);
      setName(values.name);
      setBaseUrl(values.endpoint);
      setApiKey(values.apiKey ?? '');
      setSupportsMultimodal(values.supportsMultimodal ?? false);
    } else {
      setModelSource('remote');
      setVendor('custom_openai');
      setName('');
      setBaseUrl('');
      setApiKey('');
      setSupportsMultimodal(false);
    }
  }, [open, integration]);

  const handleTestConnection = useCallback(async () => {
    if (!baseUrl.trim() || !name.trim()) {
      return;
    }
    setTestStatus('testing');
    setTestLatencyMs(null);
    setTestErrorMessage(null);
    const started = performance.now();

    try {
      const patch = formValuesToIntegrationPatch(
        {
          name: name.trim(),
          provider: vendor,
          endpoint: baseUrl.trim(),
          modelSource,
          apiKey: apiKey.trim() || undefined,
          supportsMultimodal,
        },
        integration,
      );

      if (integration?.id) {
        const result = await systemConfigApi.testIntegrationWithConfig({
          type: 'llm',
          name: name.trim(),
          provider: vendor,
          enabled: true,
          config: patch.config,
        });
        setTestLatencyMs(Math.round(performance.now() - started));
        setTestStatus(result.success ? 'success' : 'error');
        if (!result.success) {
          setTestErrorMessage(result.message || t(`${p}.testFailed`));
        }
        return;
      }

      const result = await systemConfigApi.testIntegrationWithConfig({
        type: 'llm',
        ...patch,
        enabled: true,
      });
      setTestLatencyMs(Math.round(performance.now() - started));
      setTestStatus(result.success ? 'success' : 'error');
      if (!result.success) {
        setTestErrorMessage(result.message || t(`${p}.testFailed`));
      }
    } catch (error) {
      setTestLatencyMs(Math.round(performance.now() - started) || 92);
      setTestStatus('error');
      setTestErrorMessage(getApiClientErrorMessage(error) || t(`${p}.testFailed`));
    }
  }, [baseUrl, name, vendor, modelSource, apiKey, supportsMultimodal, integration, t, p]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !baseUrl.trim()) {
      return;
    }
    onSubmit({
      name: name.trim(),
      provider: vendor,
      endpoint: baseUrl.trim(),
      modelSource,
      apiKey: apiKey.trim() || undefined,
      supportsMultimodal,
    });
  };

  const modelNamePlaceholder =
    vendor === 'deepseek' ? 'deepseek-v4-pro' : t(`${p}.modelNamePlaceholder`);

  const baseUrlPlaceholder =
    vendor === 'deepseek'
      ? 'https://api.deepseek.com'
      : vendor === 'ollama'
        ? 'http://127.0.0.1:11434'
        : vendor === 'lmstudio'
          ? 'http://127.0.0.1:1234/v1'
          : vendor === 'sglang'
            ? 'http://127.0.0.1:30000/v1'
            : 'https://api.example.com/v1';

  const canSubmit = name.trim().length > 0 && baseUrl.trim().length > 0;
  const isLocalSource = modelSource !== 'remote';

  const handleSourceChange = (source: string) => {
    const nextSource = source as ModelSourceId;
    setModelSource(nextSource);
    if (nextSource === 'ollama' || nextSource === 'lmstudio' || nextSource === 'sglang') {
      setVendor(nextSource);
    } else if (vendor === 'ollama' || vendor === 'lmstudio' || vendor === 'sglang') {
      setVendor('custom_openai');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="cpModelModalRoot"
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogHeader className="modal-panel border-b px-6 py-4">
          <DialogTitle>{integration ? t(`${p}.editTitle`) : t(`${p}.addTitle`)}</DialogTitle>
          <DialogDescription>{t(`${p}.description`)}</DialogDescription>
        </DialogHeader>

        <form
          id="chat-model-form"
          className="modal-content flex-1 space-y-4 overflow-y-auto px-6 py-4"
          onSubmit={handleSubmit}
        >
          <div className="space-y-2">
            <Label htmlFor="model-source">
              {t(`${p}.modelSource`)} <span className="text-destructive">*</span>
            </Label>
            <Select value={modelSource} onValueChange={handleSourceChange}>
              <SelectTrigger id="model-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_SOURCES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLocalSource ? (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium">{t(`${p}.localProviderLabel`)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t(`${p}.localProviderHint`)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="model-vendor">{t(`${p}.vendor`)}</Label>
              <Select value={vendor} onValueChange={setVendor}>
                <SelectTrigger id="model-vendor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendorOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="chat-model-name">
              {t(`${p}.modelName`)} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="chat-model-name"
              required
              placeholder={modelNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-base-url">
              {t(`${p}.baseUrl`)} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="chat-base-url"
              required
              placeholder={baseUrlPlaceholder}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-api-key">{t(`${p}.apiKey`)}</Label>
            <div className="relative">
              <Input
                id="chat-api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder={t(`${p}.apiKeyPlaceholder`)}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? t(`${p}.hideApiKey`) : t(`${p}.showApiKey`)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t(`${p}.connectionTest`)}</p>
                {testStatus === 'success' && testLatencyMs !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`${p}.latency`, { ms: testLatencyMs })}
                  </p>
                ) : null}
                {testStatus === 'error' ? (
                  <p className="mt-1 text-xs text-destructive">
                    {testErrorMessage ?? t(`${p}.testFailed`)}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testStatus === 'testing' || !canSubmit}
                onClick={() => void handleTestConnection()}
              >
                {testStatus === 'testing' ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                {t(`${p}.testConnection`)}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <Label htmlFor="chat-multimodal" className="cursor-pointer font-normal">
              {t(`${p}.supportsMultimodal`)}
            </Label>
            <Switch
              id="chat-multimodal"
              checked={supportsMultimodal}
              onCheckedChange={setSupportsMultimodal}
            />
          </div>
        </form>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('pages.settingsModels.cancel')}
          </Button>
          <Button type="submit" form="chat-model-form" disabled={saving || !canSubmit}>
            {saving ? t('pages.settingsModels.saving') : t('pages.settingsModels.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
