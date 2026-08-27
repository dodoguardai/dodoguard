import { useCallback, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Separator } from '@/components/ui/separator';
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
import { AgentModeSystemSettings } from './components/agent-mode-system-settings';
import { CapabilityAuditUiSettings } from './components/capability-audit-ui-settings';
import { ModelFormDialog } from './components/model-form-dialog';
import { ModelTypeSection } from './components/model-type-section';
import { MODEL_TYPE_DEFS, type ModelTypeId } from './constants/model-settings';
import { type ModelFormValues, useModelsByType } from './hooks/use-models-by-type';
import { isBuiltinModel, isSeedModel } from './lib/model-settings-utils';
import type { ManagedModel } from '@/services/api/models';

export function ModelSettingsPage() {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';

  const { grouped, isLoading, createMutation, updateMutation, deleteMutation } = useModelsByType();
  const [dismissedSeedIds, setDismissedSeedIds] = useState<Set<string>>(() => new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeType, setActiveType] = useState<ModelTypeId>('chat');
  const [editing, setEditing] = useState<ManagedModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedModel | null>(null);

  const filterModels = useCallback(
    (models: ManagedModel[]) =>
      models.filter((model) => !isSeedModel(model) || !dismissedSeedIds.has(model.id)),
    [dismissedSeedIds],
  );

  const openCreate = useCallback((typeId: ModelTypeId) => {
    setActiveType(typeId);
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((model: ManagedModel, typeId: ModelTypeId) => {
    setActiveType(typeId);
    setEditing(model);
    setDialogOpen(true);
  }, []);

  const handleSubmit = (values: ModelFormValues) => {
    if (editing) {
      updateMutation.mutate(
        { model: editing, modelType: activeType, values },
        {
          onSuccess: () => {
            setDialogOpen(false);
            setEditing(null);
          },
        },
      );
      return;
    }

    createMutation.mutate(
      { modelType: activeType, values },
      {
        onSuccess: () => {
          setDialogOpen(false);
        },
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) {
      return;
    }
    if (isSeedModel(deleteTarget)) {
      setDismissedSeedIds((prev) => new Set(prev).add(deleteTarget.id));
      setDeleteTarget(null);
      return;
    }
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

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

      <Main className="flex flex-1 flex-col gap-6">
        <div className="border-b pb-5">
          <h2 className="text-2xl font-bold tracking-tight">{t(`${p}.title`)}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t(`${p}.subtitle`)}
          </p>
        </div>

        <div id="foundationRoot" className="flex flex-col gap-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t(`${p}.loading`)}</p>
          ) : (
            MODEL_TYPE_DEFS.map((def) => (
              <ModelTypeSection
                key={def.id}
                typeId={def.id}
                labelKey={def.labelKey}
                descKey={def.descKey}
                models={filterModels(grouped[def.id])}
                onAdd={openCreate}
                onEdit={openEdit}
                onDelete={(model) => {
                  if (!isBuiltinModel(model)) {
                    setDeleteTarget(model);
                  }
                }}
              />
            ))
          )}
        </div>

        <Separator />

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{t(`${p}.agentMode.title`)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t(`${p}.agentMode.desc`)}</p>
          </div>
          <AgentModeSystemSettings />
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{t(`${p}.capabilityAudit.title`)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t(`${p}.capabilityAudit.desc`)}</p>
          </div>
          <CapabilityAuditUiSettings />
        </section>
      </Main>

      <ModelFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        modelType={activeType}
        editing={editing}
        saving={saving}
        onSubmit={handleSubmit}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`${p}.deleteConfirm`, { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(`${p}.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t(`${p}.saving`) : t(`${p}.delete`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
