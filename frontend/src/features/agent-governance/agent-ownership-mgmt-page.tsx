import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Layers, Pencil, Plus, Trash2, UserCircle, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AGENT_GOVERNANCE_QUERY_KEY,
  OWNER_TYPE_OPTIONS,
  useAgentGovernanceOptions,
} from '@/features/agent-governance/use-agent-governance-options';
import {
  agentGovernanceApi,
  type AgentGovBusinessScene,
  type AgentGovBusinessSystem,
  type AgentGovDepartment,
  type AgentGovOwner,
  type GovStatus,
  type OwnerType,
} from '@/services/api/agent-governance';

type TabKey = 'departments' | 'business-systems' | 'business-scenes' | 'owners';

type DialogMode =
  | { kind: 'department'; item?: AgentGovDepartment }
  | { kind: 'business-system'; item?: AgentGovBusinessSystem }
  | { kind: 'business-scene'; item?: AgentGovBusinessScene }
  | { kind: 'owner'; item?: AgentGovOwner }
  | null;

function StatusBadge({ status }: { status: GovStatus }) {
  return (
    <Badge variant={status === 'active' ? 'default' : 'secondary'}>
      {status === 'active' ? '启用' : '停用'}
    </Badge>
  );
}

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function AgentOwnershipMgmtPage() {
  const { t } = useTranslation();
  const p = 'pages.agentGovernance';
  const queryClient = useQueryClient();
  const { master, isLoading } = useAgentGovernanceOptions();

  const [tab, setTab] = useState<TabKey>('departments');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<DialogMode>(null);

  const [name, setName] = useState('');
  const [deptType, setDeptType] = useState('');
  const [lead, setLead] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [sceneName, setSceneName] = useState('');
  const [ownerType, setOwnerType] = useState<OwnerType>('business');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<GovStatus>('active');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: AGENT_GOVERNANCE_QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!dialog) {
        return;
      }
      if (dialog.kind === 'department') {
        const payload = { name, deptType: deptType || undefined, lead: lead || undefined, status };
        if (dialog.item) {
          return agentGovernanceApi.updateDepartment(dialog.item.id, payload);
        }
        return agentGovernanceApi.createDepartment(payload);
      }
      if (dialog.kind === 'business-scene') {
        const payload = { name, status };
        if (dialog.item) {
          return agentGovernanceApi.updateBusinessScene(dialog.item.id, payload);
        }
        return agentGovernanceApi.createBusinessScene(payload);
      }
      if (dialog.kind === 'business-system') {
        const payload = {
          name,
          departmentName: departmentName || undefined,
          sceneName: sceneName || undefined,
          status,
        };
        if (dialog.item) {
          return agentGovernanceApi.updateBusinessSystem(dialog.item.id, payload);
        }
        return agentGovernanceApi.createBusinessSystem(payload);
      }
      const payload = {
        name,
        ownerType,
        departmentName: departmentName || undefined,
        email: email || undefined,
        status,
      };
      if (dialog.item) {
        return agentGovernanceApi.updateOwner(dialog.item.id, payload);
      }
      return agentGovernanceApi.createOwner(payload);
    },
    onSuccess: () => {
      toast.success(t(`${p}.saveSuccess`));
      setDialog(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) {
        return;
      }
      if (deleteTarget.kind === 'department' && deleteTarget.item) {
        return agentGovernanceApi.deleteDepartment(deleteTarget.item.id);
      }
      if (deleteTarget.kind === 'business-scene' && deleteTarget.item) {
        return agentGovernanceApi.deleteBusinessScene(deleteTarget.item.id);
      }
      if (deleteTarget.kind === 'business-system' && deleteTarget.item) {
        return agentGovernanceApi.deleteBusinessSystem(deleteTarget.item.id);
      }
      if (deleteTarget.kind === 'owner' && deleteTarget.item) {
        return agentGovernanceApi.deleteOwner(deleteTarget.item.id);
      }
    },
    onSuccess: () => {
      toast.success(t(`${p}.deleteSuccess`));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openDialog = (mode: DialogMode) => {
    setDialog(mode);
    if (!mode) {
      return;
    }
    if (mode.kind === 'department') {
      setName(mode.item?.name || '');
      setDeptType(mode.item?.deptType || '');
      setLead(mode.item?.lead || '');
      setStatus(mode.item?.status || 'active');
      return;
    }
    if (mode.kind === 'business-scene') {
      setName(mode.item?.name || '');
      setStatus(mode.item?.status || 'active');
      return;
    }
    if (mode.kind === 'business-system') {
      setName(mode.item?.name || '');
      setDepartmentName(mode.item?.departmentName || '');
      setSceneName(mode.item?.sceneName || '');
      setStatus(mode.item?.status || 'active');
      return;
    }
    setName(mode.item?.name || '');
    setOwnerType(mode.item?.ownerType || 'business');
    setDepartmentName(mode.item?.departmentName || '');
    setEmail(mode.item?.email || '');
    setStatus(mode.item?.status || 'active');
  };

  const q = search.trim().toLowerCase();
  const filteredDepartments = useMemo(
    () =>
      (master?.departments || []).filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          (item.deptType || '').toLowerCase().includes(q) ||
          (item.lead || '').toLowerCase().includes(q),
      ),
    [master?.departments, q],
  );
  const filteredScenes = useMemo(
    () =>
      (master?.businessScenes || []).filter((item) => !q || item.name.toLowerCase().includes(q)),
    [master?.businessScenes, q],
  );
  const filteredSystems = useMemo(
    () =>
      (master?.businessSystems || []).filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          (item.departmentName || '').toLowerCase().includes(q) ||
          (item.sceneName || '').toLowerCase().includes(q),
      ),
    [master?.businessSystems, q],
  );
  const filteredOwners = useMemo(
    () =>
      (master?.owners || []).filter(
        (item) =>
          !q ||
          item.name.toLowerCase().includes(q) ||
          (item.departmentName || '').toLowerCase().includes(q) ||
          (item.email || '').toLowerCase().includes(q),
      ),
    [master?.owners, q],
  );

  const dialogTitle = (() => {
    if (!dialog) {
      return '';
    }
    const editing = !!dialog.item;
    if (dialog.kind === 'department') {
      return editing ? t(`${p}.editDepartment`) : t(`${p}.addDepartment`);
    }
    if (dialog.kind === 'business-system') {
      return editing ? t(`${p}.editBusinessSystem`) : t(`${p}.addBusinessSystem`);
    }
    if (dialog.kind === 'business-scene') {
      return editing ? t(`${p}.editBusinessScene`) : t(`${p}.addBusinessScene`);
    }
    return editing ? t(`${p}.editOwner`) : t(`${p}.addOwner`);
  })();

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

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t(`${p}.title`)}</h2>
          <p className="text-muted-foreground">{t(`${p}.description`)}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard
            title={t(`${p}.kpiDepartments`)}
            value={master?.departments.length ?? 0}
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <KpiCard
            title={t(`${p}.kpiBusinessSystems`)}
            value={master?.businessSystems.length ?? 0}
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
          />
          <KpiCard
            title={t(`${p}.kpiBusinessScenes`)}
            value={master?.businessScenes.length ?? 0}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <KpiCard
            title={t(`${p}.kpiOwners`)}
            value={master?.owners.length ?? 0}
            icon={<UserCircle className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        <Card>
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="departments">{t(`${p}.tabDepartments`)}</TabsTrigger>
                  <TabsTrigger value="business-systems">{t(`${p}.tabBusinessSystems`)}</TabsTrigger>
                  <TabsTrigger value="business-scenes">{t(`${p}.tabBusinessScenes`)}</TabsTrigger>
                  <TabsTrigger value="owners">{t(`${p}.tabOwners`)}</TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-56"
                    placeholder={t(`${p}.searchPlaceholder`)}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button
                    onClick={() => {
                      if (tab === 'departments') {
                        openDialog({ kind: 'department' });
                      } else if (tab === 'business-systems') {
                        openDialog({ kind: 'business-system' });
                      } else if (tab === 'business-scenes') {
                        openDialog({ kind: 'business-scene' });
                      } else {
                        openDialog({ kind: 'owner' });
                      }
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t(`${p}.add`)}
                  </Button>
                </div>
              </div>

              <TabsContent value="departments">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(`${p}.colName`)}</TableHead>
                      <TableHead>{t(`${p}.colDeptType`)}</TableHead>
                      <TableHead>{t(`${p}.colLead`)}</TableHead>
                      <TableHead>{t(`${p}.colStatus`)}</TableHead>
                      <TableHead className="w-28">{t(`${p}.colActions`)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDepartments.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.deptType || '—'}</TableCell>
                        <TableCell>{item.lead || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDialog({ kind: 'department', item })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ kind: 'department', item })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && filteredDepartments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t(`${p}.empty`)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="business-systems">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(`${p}.colName`)}</TableHead>
                      <TableHead>{t(`${p}.colDepartment`)}</TableHead>
                      <TableHead>{t(`${p}.colScene`)}</TableHead>
                      <TableHead>{t(`${p}.colStatus`)}</TableHead>
                      <TableHead className="w-28">{t(`${p}.colActions`)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSystems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.departmentName || '—'}</TableCell>
                        <TableCell>{item.sceneName || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDialog({ kind: 'business-system', item })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ kind: 'business-system', item })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && filteredSystems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t(`${p}.empty`)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="business-scenes">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(`${p}.colName`)}</TableHead>
                      <TableHead>{t(`${p}.colStatus`)}</TableHead>
                      <TableHead className="w-28">{t(`${p}.colActions`)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScenes.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDialog({ kind: 'business-scene', item })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ kind: 'business-scene', item })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && filteredScenes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          {t(`${p}.empty`)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="owners">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t(`${p}.colName`)}</TableHead>
                      <TableHead>{t(`${p}.colOwnerRole`)}</TableHead>
                      <TableHead>{t(`${p}.colDepartment`)}</TableHead>
                      <TableHead>{t(`${p}.colEmail`)}</TableHead>
                      <TableHead>{t(`${p}.colStatus`)}</TableHead>
                      <TableHead className="w-28">{t(`${p}.colActions`)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOwners.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          {OWNER_TYPE_OPTIONS.find(([type]) => type === item.ownerType)?.[1] ||
                            item.ownerType}
                        </TableCell>
                        <TableCell>{item.departmentName || '—'}</TableCell>
                        <TableCell>{item.email || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openDialog({ kind: 'owner', item })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ kind: 'owner', item })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!isLoading && filteredOwners.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          {t(`${p}.empty`)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </Main>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{t(`${p}.dialogDescription`)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{t(`${p}.colName`)}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            {dialog?.kind === 'department' && (
              <>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colDeptType`)}</Label>
                  <Input value={deptType} onChange={(event) => setDeptType(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colLead`)}</Label>
                  <Input value={lead} onChange={(event) => setLead(event.target.value)} />
                </div>
              </>
            )}
            {dialog?.kind === 'business-system' && (
              <>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colDepartment`)}</Label>
                  <Select value={departmentName} onValueChange={setDepartmentName}>
                    <SelectTrigger>
                      <SelectValue placeholder={t(`${p}.selectDepartment`)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(master?.departments || []).map((item) => (
                        <SelectItem key={item.id} value={item.name}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colScene`)}</Label>
                  <Select value={sceneName} onValueChange={setSceneName}>
                    <SelectTrigger>
                      <SelectValue placeholder={t(`${p}.selectScene`)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(master?.businessScenes || []).map((item) => (
                        <SelectItem key={item.id} value={item.name}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {dialog?.kind === 'owner' && (
              <>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colOwnerRole`)}</Label>
                  <Select
                    value={ownerType}
                    onValueChange={(value) => setOwnerType(value as OwnerType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OWNER_TYPE_OPTIONS.map(([type, label]) => (
                        <SelectItem key={type} value={type}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colDepartment`)}</Label>
                  <Select value={departmentName} onValueChange={setDepartmentName}>
                    <SelectTrigger>
                      <SelectValue placeholder={t(`${p}.selectDepartment`)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(master?.departments || []).map((item) => (
                        <SelectItem key={item.id} value={item.name}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t(`${p}.colEmail`)}</Label>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
              </>
            )}
            {dialog?.kind !== 'business-scene' && (
              <div className="grid gap-2">
                <Label>{t(`${p}.colStatus`)}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as GovStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t(`${p}.cancel`)}
            </Button>
            <Button
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {t(`${p}.save`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${p}.deleteDescription`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(`${p}.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {t(`${p}.delete`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
