import { createFileRoute } from '@tanstack/react-router';
import { UserDetail } from '@/features/users/components/user-detail';

export const Route = createFileRoute('/_authenticated/users/$userId')({
  component: () => {
    const { userId } = Route.useParams();
    console.log('[User Detail Route] Route params:', { userId, type: typeof userId });
    return <UserDetail userId={userId} />;
  },
});
