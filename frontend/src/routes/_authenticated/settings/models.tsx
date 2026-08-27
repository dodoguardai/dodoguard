import { createFileRoute } from '@tanstack/react-router';
import { ModelSettingsPage } from '@/features/settings/model-settings-page';

export const Route = createFileRoute('/_authenticated/settings/models')({
  component: ModelSettingsPage,
});
