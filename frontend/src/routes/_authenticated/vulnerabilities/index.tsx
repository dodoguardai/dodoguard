import { createFileRoute } from '@tanstack/react-router';
import { Vulnerabilities } from '@/features/vulnerabilities';

export const Route = createFileRoute('/_authenticated/vulnerabilities/')({
  component: Vulnerabilities,
});
