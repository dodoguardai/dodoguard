import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CpModelEmpty } from './cp-model-empty';
import { CpModelSection } from './cp-model-section';
import { ModelCard } from './model-card';
import type { ManagedModel } from '@/services/api/models';

import type { ModelTypeId } from '../constants/model-settings';

interface ModelTypeSectionProps {
  typeId: ModelTypeId;
  labelKey: string;
  descKey: string;
  models: ManagedModel[];
  onAdd: (typeId: ModelTypeId) => void;
  onEdit: (model: ManagedModel, typeId: ModelTypeId) => void;
  onDelete: (model: ManagedModel) => void;
}

export function ModelTypeSection({
  typeId,
  labelKey,
  descKey,
  models,
  onAdd,
  onEdit,
  onDelete,
}: ModelTypeSectionProps) {
  const { t } = useTranslation();
  const p = 'pages.settingsModels';
  const label = t(labelKey);
  const desc = t(descKey);

  return (
    <CpModelSection
      title={label}
      description={desc}
      addLabel={t(`${p}.addModel`)}
      onAdd={() => onAdd(typeId)}
    >
      {models.length === 0 ? (
        <CpModelEmpty
          message={t(`${p}.empty`, { type: label })}
          action={
            <Button type="button" size="sm" onClick={() => onAdd(typeId)}>
              <Plus className="mr-1 h-4 w-4" />
              {t(`${p}.addModel`)}
            </Button>
          }
        />
      ) : (
        <div className="cp-model-card-list flex flex-col gap-2">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onEdit={(m) => onEdit(m, typeId)}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </CpModelSection>
  );
}
