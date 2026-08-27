import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { modelsApi, type ManagedModel } from '@/services/api/models';
import { Brain, HeartPulse, Pencil, Plus, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';

function defaultAdvancedJson(model: ManagedModel | null): string {
  if (model?.providerConfig && Object.keys(model.providerConfig).length > 0) {
    return JSON.stringify(model.providerConfig, null, 2);
  }
  return JSON.stringify(
    {
      label: '',
      apiKeyEnvVar: '',
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    },
    null,
    2,
  );
}

export function Models() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedModel | null>(null);
  const [formTab, setFormTab] = useState<'basic' | 'advanced'>('basic');

  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [modelKey, setModelKey] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [quotaMonthly, setQuotaMonthly] = useState('100000');
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxOutputTokens, setMaxOutputTokens] = useState('');

  const [advancedJson, setAdvancedJson] = useState(defaultAdvancedJson(null));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ManagedModel | null>(null);

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.list(),
  });

  const resetFormForCreate = useCallback(() => {
    setEditing(null);
    setFormTab('basic');
    setName('');
    setProvider('openai');
    setModelKey('');
    setStatus('active');
    setQuotaMonthly('100000');
    setApiKeyEnvVar('');
    setTemperature('');
    setMaxOutputTokens('');
    setAdvancedJson(defaultAdvancedJson(null));
    setJsonError(null);
  }, []);

  const openCreate = () => {
    resetFormForCreate();
    setSheetOpen(true);
  };

  const openEdit = (model: ManagedModel) => {
    setEditing(model);
    setFormTab('basic');
    setName(model.name);
    setProvider(model.provider);
    setModelKey(model.modelKey);
    setStatus(model.status);
    setQuotaMonthly(String(model.quotaMonthly));
    const pc = model.providerConfig ?? {};
    const cfg = (typeof pc.config === 'object' && pc.config !== null ? pc.config : {}) as Record<
      string,
      unknown
    >;
    setApiKeyEnvVar(typeof pc.apiKeyEnvVar === 'string' ? pc.apiKeyEnvVar : '');
    setTemperature(cfg.temperature !== undefined ? String(cfg.temperature) : '');
    setMaxOutputTokens(
      cfg.maxOutputTokens !== undefined
        ? String(cfg.maxOutputTokens)
        : cfg.max_tokens !== undefined
          ? String(cfg.max_tokens)
          : '',
    );
    setAdvancedJson(defaultAdvancedJson(model));
    setJsonError(null);
    setSheetOpen(true);
  };

  const buildProviderConfigFromBasic = (): Record<string, unknown> | undefined => {
    const out: Record<string, unknown> = {};
    if (name.trim()) {
      out.label = name.trim();
    }
    if (apiKeyEnvVar.trim()) {
      out.apiKeyEnvVar = apiKeyEnvVar.trim();
    }
    const inner: Record<string, unknown> = {};
    if (temperature.trim() !== '' && !Number.isNaN(Number(temperature))) {
      inner.temperature = Number(temperature);
    }
    if (maxOutputTokens.trim() !== '' && !Number.isNaN(Number(maxOutputTokens))) {
      inner.maxOutputTokens = Number(maxOutputTokens);
    }
    if (Object.keys(inner).length > 0) {
      out.config = inner;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof modelsApi.create>[0]) => modelsApi.create(payload),
    onSuccess: () => {
      toast.success('Model created');
      setSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create model: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof modelsApi.update>[1] }) =>
      modelsApi.update(id, payload),
    onSuccess: () => {
      toast.success('Model updated');
      setSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update model: ${error.message}`);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => modelsApi.remove(id),
    onSuccess: () => {
      toast.success('Model deleted');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete model: ${error.message}`);
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: (id: string) => modelsApi.runHealthCheck(id),
    onSuccess: () => {
      toast.success('Health check completed');
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (error: Error) => {
      toast.error(`Health check failed: ${error.message}`);
    },
  });

  const quotaNum = useMemo(() => {
    const n = Number.parseInt(quotaMonthly, 10);
    return Number.isFinite(n) && n > 0 ? n : 100000;
  }, [quotaMonthly]);

  const handleSave = () => {
    let providerConfig: Record<string, unknown> | undefined;

    if (formTab === 'advanced') {
      try {
        providerConfig = JSON.parse(advancedJson) as Record<string, unknown>;
        if (typeof providerConfig !== 'object' || providerConfig === null) {
          setJsonError('JSON must be an object');
          return;
        }
        setJsonError(null);
      } catch {
        setJsonError('Invalid JSON');
        return;
      }
    } else {
      providerConfig = buildProviderConfigFromBasic();
      setJsonError(null);
    }

    const base = {
      name: name.trim() || 'Unnamed model',
      provider: provider.trim() || 'openai',
      modelKey: modelKey.trim() || `${provider.trim() || 'openai'}:model`,
      status,
      quotaMonthly: quotaNum,
    };

    if (editing) {
      const payload: Parameters<typeof modelsApi.update>[1] = { ...base };
      if (formTab === 'advanced') {
        payload.providerConfig = providerConfig ?? {};
      } else if (providerConfig !== undefined) {
        payload.providerConfig = providerConfig;
      }
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate({
        ...base,
        ...(providerConfig !== undefined ? { providerConfig } : {}),
      });
    }
  };

  const activeCount = models.filter((model) => model.status === 'active').length;
  const healthyCount = models.filter((model) => model.healthStatus === 'healthy').length;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="flex w-full min-w-0 flex-1 flex-col gap-6 sm:gap-8">
        {/* Title block: stack on narrow; button stays top-right on desktop without wrapping into title text */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight">LLM Models</h2>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Registry, provider binding, health, and quotas — per organization.
            </p>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Reference API keys and other secrets by environment variable name in configuration—do
              not paste raw secrets into stored JSON.
            </p>
          </div>
          <Button type="button" className="shrink-0 sm:mt-0.5" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add model
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="space-y-1 pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{models.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">Models in registry</CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="space-y-1 pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{activeCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">Traffic enabled</CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="space-y-1 pb-2">
              <CardDescription>Healthy</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{healthyCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">Last check</CardContent>
          </Card>
          <Card className="shadow-sm col-span-2 lg:col-span-1">
            <CardHeader className="space-y-1 pb-2">
              <CardDescription>Quota used</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {models.reduce((sum, m) => sum + m.quotaUsed, 0)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground pt-0 text-xs">Sum of monthly use</CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-border border-b pb-4">
            <CardTitle className="text-lg">Model registry</CardTitle>
            <CardDescription className="max-w-2xl">
              Add, edit, or remove entries. Each row keeps its own provider options.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground px-6 py-10 text-center text-sm">Loading models…</p>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <p className="text-muted-foreground max-w-sm text-sm">
                  No models yet. Use <span className="text-foreground font-medium">Add model</span>{' '}
                  to register your first endpoint.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add model
                </Button>
              </div>
            ) : (
              <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="ps-6">Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead className="tabular-nums">Quota</TableHead>
                      <TableHead className="pe-6 text-end">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="ps-6 font-medium">{model.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{model.provider}</TableCell>
                        <TableCell
                          className="max-w-[min(280px,40vw)] truncate font-mono text-xs"
                          title={model.modelKey}
                        >
                          {model.modelKey}
                        </TableCell>
                        <TableCell>
                          <Badge variant={model.status === 'active' ? 'default' : 'outline'}>
                            {model.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={model.healthStatus === 'healthy' ? 'default' : 'secondary'}
                          >
                            {model.healthStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums text-sm">
                          {model.quotaUsed}/{model.quotaMonthly}
                        </TableCell>
                        <TableCell className="pe-6 text-end">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => openEdit(model)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Health check"
                              onClick={() => healthCheckMutation.mutate(model.id)}
                              disabled={healthCheckMutation.isPending}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive h-8 w-8"
                              title="Delete"
                              onClick={() => setDeleteTarget(model)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="bg-muted/50 text-muted-foreground rounded-lg border px-4 py-3 sm:px-5">
          <p className="text-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Notes
          </p>
          <ul className="grid gap-2 text-xs leading-relaxed sm:grid-cols-3 sm:gap-4">
            <li className="flex gap-2">
              <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span>Registry is stored per organization.</span>
            </li>
            <li className="flex gap-2">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span>
                Prefer <code className="bg-background rounded px-1 py-0.5 text-[0.7rem]">apiKeyEnvVar</code>{' '}
                in JSON, not embedded keys.
              </span>
            </li>
            <li className="flex gap-2 sm:col-span-1">
              <HeartPulse className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span>Health check is a placeholder until live probes ship.</span>
            </li>
          </ul>
        </div>
      </Main>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="pb-4">
            <SheetTitle>{editing ? 'Edit model' : 'Add model'}</SheetTitle>
            <SheetDescription>
              Set model id, optional <code className="text-xs">config</code>, and reference secrets
              via env vars—not inline values.
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={formTab}
            onValueChange={(v) => setFormTab(v as 'basic' | 'advanced')}
            className="flex flex-1 flex-col gap-4 px-4 pb-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="advanced">Advanced JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="m-name">Display name</Label>
                <Input
                  id="m-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production GPT-4.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-provider">Provider id</Label>
                <Input
                  id="m-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="openai, anthropic, azure, …"
                />
                <p className="text-muted-foreground text-xs">
                  Identifier your provider or gateway expects (e.g. openai, anthropic).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-key">Model ID / key</Label>
                <Input
                  id="m-key"
                  value={modelKey}
                  onChange={(e) => setModelKey(e.target.value)}
                  placeholder="gpt-4.1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as 'active' | 'inactive')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-quota">Monthly quota</Label>
                  <Input
                    id="m-quota"
                    type="number"
                    min={1}
                    value={quotaMonthly}
                    onChange={(e) => setQuotaMonthly(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-env">API key env var (optional)</Label>
                <Input
                  id="m-env"
                  value={apiKeyEnvVar}
                  onChange={(e) => setApiKeyEnvVar(e.target.value)}
                  placeholder="OPENAI_API_KEY"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="m-temp">Temperature</Label>
                  <Input
                    id="m-temp"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="0.2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-max">Max output tokens</Label>
                  <Input
                    id="m-max"
                    value={maxOutputTokens}
                    onChange={(e) => setMaxOutputTokens(e.target.value)}
                    placeholder="4096"
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="advanced" className="mt-0 space-y-2">
              <p className="text-muted-foreground text-xs">
                Full <code className="text-xs">providerConfig</code> object (merged with top-level
                name / provider / model id on save). Field names follow your vendor or gateway API.
              </p>
              <Textarea
                value={advancedJson}
                onChange={(e) => {
                  setAdvancedJson(e.target.value);
                  setJsonError(null);
                }}
                className="min-h-[240px] font-mono text-xs"
                spellCheck={false}
              />
              {jsonError ? <p className="text-destructive text-sm">{jsonError}</p> : null}
            </TabsContent>
          </Tabs>

          <SheetFooter className="mt-auto border-t px-4 py-4">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{deleteTarget?.name}&quot; from the registry. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && removeMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
