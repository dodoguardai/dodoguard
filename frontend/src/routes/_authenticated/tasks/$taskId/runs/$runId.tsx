import { createFileRoute } from '@tanstack/react-router';
import { TaskRunView } from '@/features/tasks/components/task-run-view';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';

export const Route = createFileRoute('/_authenticated/tasks/$taskId/runs/$runId')({
  component: () => {
    const { taskId, runId } = Route.useParams();
    return (
      <>
        <Header fixed>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          <TaskRunView taskId={taskId} runId={runId} />
        </Main>
      </>
    );
  },
});
