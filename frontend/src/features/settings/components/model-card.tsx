import { useTranslation } from 'react-i18next';
import { CpModelCard } from './cp-model-card';
import { getModelEndpoint, getProviderLabel, isBuiltinModel } from '../lib/model-settings-utils';
import type { ManagedModel } from '@/services/api/models';

interface ModelCardProps {
  model: ManagedModel;
  onEdit: (model: ManagedModel) => void;
  onDelete: (model: ManagedModel) => void;
}

export function ModelCard({ model, onEdit, onDelete }: ModelCardProps) {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';
  const builtin = isBuiltinModel(model);
  const endpoint = getModelEndpoint(model);
  const providerLabel = getProviderLabel(model.provider, t);
  const subtitle = endpoint
    ? `${providerLabel} · ${endpoint}`
    : `${providerLabel} · ${t(`${p}.noEndpoint`)}`;
  const status =
    model.status !== 'active'
      ? {
          label: t(`${p}.statusInactive`),
          tone: 'muted' as const,
        }
      : model.healthStatus === 'healthy'
        ? {
            label: t(`${p}.statusActive`),
            tone: 'success' as const,
          }
        : model.healthStatus === 'offline'
          ? {
              label: t(`${p}.statusOffline`),
              tone: 'muted' as const,
            }
          : model.healthStatus === 'degraded'
            ? {
                label: t(`${p}.statusDegraded`),
                tone: 'warning' as const,
              }
            : {
                label: t(`${p}.statusUnknown`),
                tone: 'warning' as const,
              };

  if (builtin) {
    return (
      <div className="cp-model-card flex flex-col gap-2 rounded-lg border bg-background px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="cp-model-card-meta min-w-0 flex-1">
          <strong className="block text-sm font-semibold">{model.name}</strong>
          <div className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{t(`${p}.builtinBadge`)}</span>
      </div>
    );
  }

  return (
    <CpModelCard
      name={model.name}
      subtitle={subtitle}
      statusLabel={status.label}
      statusTone={status.tone}
      onEdit={() => onEdit(model)}
      onDelete={() => onDelete(model)}
    />
  );
}
