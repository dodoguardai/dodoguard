import { useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/components/ui/button';
import { useReviewIntegrations } from '../hooks/use-review-integrations';
import {
  formValuesToIntegrationPatch,
  getIntegrationProviderLabel,
  isIntegrationActive,
  type ReviewIntegrationFormValues,
} from '../lib/integration-form-utils';
import { getIntegrationBaseUrl } from '../lib/integration-models';
import { CpModelCard } from './cp-model-card';
import { CpModelEmpty } from './cp-model-empty';
import { CpModelSection } from './cp-model-section';
import { ReviewIntegrationEditDialog } from './review-integration-edit-dialog';
import type { IntegrationConfig } from '@/types/entities';

export function ReviewIntegrationSection() {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';
  const reviewP = 'pages.settingsModels.review';

  const { integrations, isLoading, testMutation, deleteMutation, updateMutation, createMutation } =
    useReviewIntegrations();

  const [deleteTarget, setDeleteTarget] = useState<IntegrationConfig | null>(null);
  const [editTarget, setEditTarget] = useState<IntegrationConfig | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const dialogOpen = createOpen || editTarget !== null;
  const saving = updateMutation.isPending || createMutation.isPending;

  const closeDialog = () => {
    setCreateOpen(false);
    setEditTarget(null);
  };

  const handleFormSubmit = (values: ReviewIntegrationFormValues) => {
    const patch = formValuesToIntegrationPatch(values, editTarget);
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: patch }, { onSuccess: () => closeDialog() });
      return;
    }
    createMutation.mutate(
      { ...patch, type: 'llm', enabled: true },
      { onSuccess: () => closeDialog() },
    );
  };

  const openCreate = () => setCreateOpen(true);

  return (
    <>
      <CpModelSection
        title={t(`${p}.types.chat.label`)}
        description={t(`${p}.types.chat.desc`)}
        addLabel={t(`${reviewP}.addIntegration`)}
        onAdd={openCreate}
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t(`${p}.loading`)}</p>
        ) : integrations.length === 0 ? (
          <CpModelEmpty
            message={t(`${reviewP}.empty`)}
            action={
              <Button type="button" size="sm" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                {t(`${reviewP}.addIntegration`)}
              </Button>
            }
          />
        ) : (
          <div className="cp-model-card-list flex flex-col gap-2">
            {integrations.map((integration) => {
              const baseUrl = getIntegrationBaseUrl(integration);
              const providerLabel = getIntegrationProviderLabel(integration.provider, t);
              const subtitle = baseUrl ? `${providerLabel} · ${baseUrl}` : providerLabel;
              const active = isIntegrationActive(integration);

              return (
                <CpModelCard
                  key={integration.id}
                  name={integration.name}
                  subtitle={subtitle}
                  statusLabel={t(`${p}.${active ? 'statusActive' : 'statusInactive'}`)}
                  statusTone={active ? 'success' : 'muted'}
                  onTest={() => testMutation.mutate(integration.id)}
                  testing={testMutation.isPending && testMutation.variables === integration.id}
                  onEdit={() => setEditTarget(integration)}
                  onDelete={() => setDeleteTarget(integration)}
                />
              );
            })}
          </div>
        )}
      </CpModelSection>

      <ReviewIntegrationEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        integration={editTarget}
        saving={saving}
        onSubmit={handleFormSubmit}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${reviewP}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`${reviewP}.deleteConfirm`, { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(`${p}.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) {
                  return;
                }
                deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => setDeleteTarget(null),
                });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t(`${p}.saving`) : t(`${reviewP}.delete`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
