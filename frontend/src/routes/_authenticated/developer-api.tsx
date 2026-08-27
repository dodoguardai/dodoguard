import { createFileRoute } from '@tanstack/react-router';
import { DeveloperApiPage } from '@/features/developer-api/developer-api-page';

export const Route = createFileRoute('/_authenticated/developer-api')({
  component: DeveloperApiPage,
});
