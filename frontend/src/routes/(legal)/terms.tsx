import { createFileRoute } from '@tanstack/react-router';
import { TermsOfService } from '@/features/legal/terms-of-service';

export const Route = createFileRoute('/(legal)/terms')({
  component: TermsOfService,
});
