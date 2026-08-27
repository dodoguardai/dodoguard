import { createFileRoute } from '@tanstack/react-router';
import { FindingDetail } from '@/features/findings/detail';

export const Route = createFileRoute('/_authenticated/findings/$findingId')({
  component: () => {
    const { findingId } = Route.useParams();
    return <FindingDetail findingId={findingId} />;
  },
});
