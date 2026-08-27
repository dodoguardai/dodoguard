import { createFileRoute } from '@tanstack/react-router';
import { CommercialApiTestCreatePage } from '@/features/tasks/commercial-api-test-create-page';

export const Route = createFileRoute('/_authenticated/tasks/commercial-api-test/create')({
  component: CommercialApiTestCreatePage,
});
