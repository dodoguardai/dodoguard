import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPolicy } from '@/features/legal/privacy-policy';

export const Route = createFileRoute('/(legal)/privacy')({
  component: PrivacyPolicy,
});
